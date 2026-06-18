package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

func (h ReportsHandler) GenerateReport(c echo.Context) error {
	return h.generateReportByID(c, "reports:create")
}

func (h ReportsHandler) GenerateReportFromRequest(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	user, err := requirePermission(c, h.Auth, "reports:create")
	if err != nil {
		return err
	}

	var req reportGenerateRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	reportType := normalizeReportType(req.ReportType)
	category := normalizeReportCategory(req.Category)
	format := normalizeReportFormat(req.Format)
	startTime, endTime := parseGenerateRange(req.StartTime, req.EndTime)

	parameters := map[string]interface{}{
		"dateRange": map[string]interface{}{
			"startDate": startTime.Format(time.RFC3339),
			"endDate":   endTime.Format(time.RFC3339),
		},
		"device_ids":      req.DeviceIDs,
		"include_charts":  defaultBool(req.IncludeCharts, true),
		"include_details": defaultBool(req.IncludeDetails, true),
		"custom_config":   req.CustomConfig,
	}

	// 对于趋势类报表：在生成阶段预先组装一份“可落盘”的 report_data，
	// 让通用报表渲染器也能输出与趋势分析一致的核心结果（而不是空报表）。
	if reportType == "trend" {
		reportData := map[string]interface{}{
			"report_name":  req.Name,
			"range":        fmt.Sprintf("%s ~ %s", startTime.Format("2006-01-02"), endTime.Format("2006-01-02")),
			"generated_at": time.Now().UTC().Format(time.RFC3339),
			"summary": map[string]interface{}{
				"metrics": len(readStringSlice(req.CustomConfig, "metrics")),
				"devices": len(req.DeviceIDs),
			},
			"notes": "该趋势报表为摘要版（不包含全部数据点），用于快速回溯趋势变化与预测结果。",
		}

		db := h.Service.DB()
		if db == nil {
			reportData["notes"] = "趋势数据获取失败：数据库未配置"
		} else {
			metrics := readStringSlice(req.CustomConfig, "metrics")
			if len(metrics) == 0 {
				metrics = []string{"availability", "performance", "errors", "capacity"}
			}
			granularity := normalizeGranularity(readString(req.CustomConfig, "granularity"))
			series, err := loadTrendSeries(c.Request().Context(), db, metrics, startTime, endTime, granularity, req.DeviceIDs)
			if err != nil {
				reportData["notes"] = fmt.Sprintf("趋势数据获取失败：%s", err.Error())
			} else {
				compactMetrics := make([]map[string]interface{}, 0, len(series))
				for _, item := range series {
					payload := buildTrendMetricPayload(item)
					// 报表文件中不落全量 data_points，避免内容过大且难读。
					delete(payload, "data_points")
					compactMetrics = append(compactMetrics, payload)
				}
				reportData["metrics"] = compactMetrics

				includePredictions := false
				if value, ok := readBool(req.CustomConfig, "include_predictions", "includePredictions"); ok {
					includePredictions = value
				}
				if includePredictions {
					timeframe := timeframeForRange(startTime, endTime)
					reportData["predictions"] = buildTrendPredictions(series, predictionSteps(timeframe, granularity), timeframe)
				}
				reportData["alerts"] = buildTrendAlerts(series, "medium", 50)
			}
		}

		parameters["report_data"] = reportData
	}

	filtersJSON, err := encodeJSON(parameters)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid parameters")
	}

	formatJSON, err := encodeJSON([]string{format})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to encode format")
	}

	report := reports.Report{
		Title:         defaultString(req.Name, "报表"),
		ReportType:    reportType,
		Category:      &category,
		StartDate:     startTime,
		EndDate:       endTime,
		DeviceFilters: filtersJSON,
		Status:        "generating",
		FileFormats:   formatJSON,
		FilePaths:     datatypes.JSON([]byte("{}")),
		FileSizes:     datatypes.JSON([]byte("{}")),
	}
	if user != nil {
		report.GeneratedBy = &user.ID
	}

	if err := h.Service.CreateReport(c.Request().Context(), &report); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create report")
	}

	report, _ = h.completeReportGeneration(c, report, format)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    buildReportResponse(report, nil, h.OutputDir),
	})
}

func (h ReportsHandler) CloneReport(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:create"); err != nil {
		return err
	}

	reportID, err := parseIDParam(c, "report_id")
	if err != nil {
		return err
	}
	var payload struct {
		Title string `json:"title"`
	}
	_ = c.Bind(&payload)

	original, err := h.Service.GetReport(c.Request().Context(), reportID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Report not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load report")
	}

	clone := original
	clone.ID = 0
	clone.Title = defaultString(payload.Title, original.Title+"(副本)")
	clone.Status = "pending"
	clone.CreatedAt = nil
	clone.UpdatedAt = nil

	if err := h.Service.CreateReport(c.Request().Context(), &clone); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create report")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    buildReportResponse(clone, nil, h.OutputDir),
	})
}

func (h ReportsHandler) PreviewReport(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}

	reportID, err := parseIDParam(c, "report_id")
	if err != nil {
		return err
	}

	report, err := h.Service.GetReport(c.Request().Context(), reportID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Report not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load report")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"report": buildReportResponse(report, nil, h.OutputDir),
		},
	})
}

func (h ReportsHandler) DownloadReport(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}

	reportID, err := parseIDParam(c, "report_id")
	if err != nil {
		return err
	}

	report, err := h.Service.GetReport(c.Request().Context(), reportID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Report not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load report")
	}

	format := normalizeReportFormat(c.QueryParam("format"))
	filePath, _ := resolveReportFile(report, format)
	if filePath == "" {
		return echo.NewHTTPError(http.StatusNotFound, "Report file not found")
	}

	filename := filepath.Base(filePath)
	downloadURL := buildDownloadURL(filename)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"download_url": downloadURL,
		},
	})
}

func (h ReportsHandler) DownloadReportFile(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}
	if strings.TrimSpace(h.OutputDir) == "" {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report output not configured")
	}
	filename := strings.TrimSpace(c.Param("filename"))
	if filename == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid filename")
	}
	if !isSafeReportFilename(filename) {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid filename")
	}

	outputDir := filepath.Clean(h.OutputDir)
	fullPath := filepath.Join(outputDir, filename)
	relPath, err := filepath.Rel(outputDir, fullPath)
	if err != nil || strings.HasPrefix(relPath, "..") || filepath.IsAbs(relPath) {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid filename")
	}
	if _, err := os.Stat(fullPath); err != nil {
		if os.IsNotExist(err) {
			return echo.NewHTTPError(http.StatusNotFound, "Report file not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to access report file")
	}

	return c.Attachment(fullPath, filename)
}

func (h ReportsHandler) RerenderReportPDF(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:update"); err != nil {
		return err
	}

	reportID, err := parseIDParam(c, "report_id")
	if err != nil {
		return err
	}

	report, err := h.Service.GetReport(c.Request().Context(), reportID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Report not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load report")
	}
	if report.Status != "completed" {
		return echo.NewHTTPError(http.StatusConflict, "only completed reports can be rerendered")
	}

	updated, filePath, err := h.rerenderReportFormat(c, report, "pdf")
	if err != nil {
		c.Logger().Errorf("rerender report pdf failed: report_id=%d err=%v", report.ID, err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to rerender report pdf")
	}

	fileURL := buildDownloadURL(filepath.Base(filePath))
	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"format":       "pdf",
			"download_url": fileURL,
			"preview_url":  fileURL,
			"report":       buildReportResponse(updated, nil, h.OutputDir),
		},
	})
}
