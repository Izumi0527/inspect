package handlers

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/common"
	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

type ReportsHandler struct {
	Service   *reports.Service
	Auth      PermissionService
	OutputDir string
}

func (h ReportsHandler) Register(group *echo.Group) {
	group.GET("/reports", h.ListReports)
	group.GET("/reports/", h.ListReports)
	group.GET("/reports/:report_id", h.GetReport)
	group.POST("/reports", h.CreateReport)
	group.PUT("/reports/:report_id", h.UpdateReport)
	group.DELETE("/reports/:report_id", h.DeleteReport)
	group.POST("/reports/:report_id/generate", h.GenerateReport)
	group.POST("/reports/:report_id/clone", h.CloneReport)
	group.GET("/reports/:report_id/download", h.DownloadReport)
	group.GET("/reports/:report_id/preview", h.PreviewReport)

	group.POST("/reports/generate", h.GenerateReportFromRequest)

	group.GET("/reports/stats", h.GetReportStats)
	group.POST("/reports/stats/usage", h.GetUsageAnalysis)
	group.GET("/reports/stats/performance", h.GetPerformanceMetrics)

	group.POST("/reports/trends/analysis", h.GetTrendAnalysis)
	group.POST("/reports/trends/generate", h.GenerateTrendReport)
	group.POST("/reports/trends/predictions", h.GetTrendPredictions)
	group.POST("/reports/trends/anomalies", h.GetTrendAnomalies)

	group.POST("/reports/statistics/data", h.GetStatisticsData)
	group.POST("/reports/statistics/kpi", h.GetStatisticsKPI)
	group.POST("/reports/statistics/rankings", h.GetStatisticsRankings)
	group.POST("/reports/statistics/generate", h.GenerateStatisticsReport)
	group.GET("/reports/statistics/devices", h.GetDeviceStatistics)
	group.GET("/reports/statistics/alerts", h.GetAlertStatistics)
	group.GET("/reports/statistics/inspections", h.GetInspectionStatistics)

	group.POST("/reports/inspection/generate", h.GenerateInspectionReport)
	group.POST("/reports/inspection/data", h.GetInspectionReportData)
	group.POST("/reports/inspection/compare", h.CompareInspectionReports)

	group.GET("/reports/custom/configs", h.ListCustomConfigs)
	group.GET("/reports/custom/configs/:config_id", h.GetCustomConfig)
	group.POST("/reports/custom/configs", h.CreateCustomConfig)
	group.PUT("/reports/custom/configs/:config_id", h.UpdateCustomConfig)
	group.DELETE("/reports/custom/configs/:config_id", h.DeleteCustomConfig)
	group.POST("/reports/custom/configs/:config_id/generate", h.GenerateFromCustomConfig)
	group.POST("/reports/custom/configs/:config_id/preview", h.PreviewCustomConfig)

	group.GET("/reports/templates", h.ListTemplates)
	group.GET("/reports/templates/:template_id", h.GetTemplate)
	group.POST("/reports/templates", h.CreateTemplate)
	group.PUT("/reports/templates/:template_id", h.UpdateTemplate)
	group.DELETE("/reports/templates/:template_id", h.DeleteTemplate)
	group.POST("/reports/templates/:template_id/clone", h.CloneTemplate)

	group.POST("/reports/export/excel", h.ExportExcel)
	group.POST("/reports/export/pdf", h.ExportPDF)
	group.POST("/reports/export/word", h.ExportWord)

	group.GET("/reports/scheduled", h.ListScheduledReports)
	group.POST("/reports/scheduled", h.CreateScheduledReport)
	group.DELETE("/reports/scheduled/:report_id", h.DeleteScheduledReport)

	group.GET("/reports/files/:filename", h.DownloadReportFile)
}

type reportScheduleRequest struct {
	Enabled    *bool    `json:"enabled"`
	Frequency  string   `json:"frequency"`
	DayOfWeek  *int     `json:"dayOfWeek"`
	DayOfMonth *int     `json:"dayOfMonth"`
	Time       string   `json:"time"`
	Recipients []string `json:"recipients"`
}

type reportCreateRequest struct {
	Title       string                 `json:"title"`
	Description *string                `json:"description"`
	Type        string                 `json:"type"`
	Category    string                 `json:"category"`
	Format      string                 `json:"format"`
	Parameters  map[string]interface{} `json:"parameters"`
	Schedule    *reportScheduleRequest `json:"schedule"`
}

type reportGenerateRequest struct {
	Name           string                 `json:"name"`
	ReportType     string                 `json:"report_type"`
	StartTime      string                 `json:"start_time"`
	EndTime        string                 `json:"end_time"`
	DeviceIDs      []int                  `json:"device_ids"`
	IncludeCharts  *bool                  `json:"include_charts"`
	IncludeDetails *bool                  `json:"include_details"`
	CustomConfig   map[string]interface{} `json:"custom_config"`
	Format         string                 `json:"format"`
	Category       string                 `json:"category"`
}

type reportUpdateRequest struct {
	Title       *string                `json:"title"`
	Description *string                `json:"description"`
	Type        *string                `json:"type"`
	Category    *string                `json:"category"`
	Format      *string                `json:"format"`
	Status      *string                `json:"status"`
	Parameters  map[string]interface{} `json:"parameters"`
}

type reportTemplateRequest struct {
	Name        string                   `json:"name"`
	Description *string                  `json:"description"`
	Type        string                   `json:"type"`
	ReportType  *string                  `json:"report_type"`
	Sections    []map[string]interface{} `json:"sections"`
	Styles      map[string]interface{}   `json:"styles"`
	Config      map[string]interface{}   `json:"config"`
}

type customConfigRequest struct {
	Name        string                   `json:"name"`
	Description *string                  `json:"description"`
	Template    map[string]interface{}   `json:"template"`
	Parameters  map[string]interface{}   `json:"parameters"`
	Charts      []map[string]interface{} `json:"charts"`
	Tables      []map[string]interface{} `json:"tables"`
	Filters     []map[string]interface{} `json:"filters"`
	Layout      map[string]interface{}   `json:"layout"`
}

func (h ReportsHandler) ListReports(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}

	reportType := firstNonEmpty(c.QueryParam("type"), c.QueryParam("report_type"))
	status := strings.TrimSpace(c.QueryParam("status"))
	createdBy := strings.TrimSpace(c.QueryParam("created_by"))
	startDate, _ := parseTimeOptional(c.QueryParam("start_date"))
	endDate, _ := parseTimeOptional(c.QueryParam("end_date"))

	page := parseIntWithDefault(c.QueryParam("page"), 1)
	pageSize := parseIntWithDefault(firstNonEmpty(c.QueryParam("page_size"), c.QueryParam("pageSize")), 20)
	if page < 1 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	// status=scheduled：对外语义为“已配置定时，但尚未生成完成”，内部存储为 pending 且 schedule_id 非空。
	// 若仅将 scheduled 映射为 pending，会导致 total/pages 不准确（包含未绑定 schedule 的 pending 报表）。
	if strings.EqualFold(status, "scheduled") {
		db := h.Service.DB()
		if db == nil {
			return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
		}

		query := db.WithContext(c.Request().Context()).Model(&reports.Report{}).
			Where("status = ?", "pending").
			Where("schedule_id IS NOT NULL")

		if strings.TrimSpace(reportType) != "" {
			normalized := normalizeReportType(reportType)
			query = query.Where("report_type = ?", normalized)
		}
		if createdBy != "" {
			query = query.Where("generated_by = ?", createdBy)
		}
		if startDate != nil {
			query = query.Where("created_at >= ?", *startDate)
		}
		if endDate != nil {
			query = query.Where("created_at <= ?", *endDate)
		}

		var total int64
		if err := query.Count(&total).Error; err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to load reports")
		}

		list := make([]reports.Report, 0)
		if err := query.Order("created_at desc").
			Offset((page - 1) * pageSize).
			Limit(pageSize).
			Find(&list).Error; err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to load reports")
		}

		result := make([]map[string]interface{}, 0, len(list))
		for _, item := range list {
			result = append(result, buildReportResponse(item, nil, h.OutputDir))
		}

		pages := 0
		if pageSize > 0 {
			pages = int((total + int64(pageSize) - 1) / int64(pageSize))
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"reports": result,
				"total":   total,
				"pages":   pages,
			},
		})
	}

	filter := reports.ListReportsFilter{
		Page:     page,
		PageSize: pageSize,
	}
	if reportType != "" {
		normalized := normalizeReportType(reportType)
		filter.ReportType = &normalized
	}
	if status != "" {
		filter.Status = &status
	}
	if createdBy != "" {
		filter.CreatedBy = &createdBy
	}
	if startDate != nil {
		filter.StartDate = startDate
	}
	if endDate != nil {
		filter.EndDate = endDate
	}

	list, total, err := h.Service.ListReports(c.Request().Context(), filter)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load reports")
	}

	result := make([]map[string]interface{}, 0, len(list))
	for _, item := range list {
		result = append(result, buildReportResponse(item, nil, h.OutputDir))
	}

	pages := 0
	if pageSize > 0 {
		pages = int((total + int64(pageSize) - 1) / int64(pageSize))
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"reports": result,
			"total":   total,
			"pages":   pages,
		},
	})
}

func (h ReportsHandler) GetReport(c echo.Context) error {
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

	var schedule *reports.ReportSchedule
	if report.ScheduleID != nil {
		if row, err := h.Service.GetSchedule(c.Request().Context(), *report.ScheduleID); err == nil {
			schedule = &row
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    buildReportResponse(report, schedule, h.OutputDir),
	})
}

func (h ReportsHandler) CreateReport(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	user, err := requirePermission(c, h.Auth, "reports:create")
	if err != nil {
		return err
	}

	var req reportCreateRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if strings.TrimSpace(req.Title) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "title is required")
	}

	reportType := normalizeReportType(req.Type)
	category := normalizeReportCategory(req.Category)
	format := normalizeReportFormat(req.Format)
	startTime, endTime := resolveDateRange(req.Parameters)

	filtersJSON, err := encodeJSON(req.Parameters)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid parameters")
	}

	fileFormats, err := encodeJSON([]string{format})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to encode format")
	}

	report := reports.Report{
		Title:         req.Title,
		Description:   req.Description,
		ReportType:    reportType,
		Category:      &category,
		StartDate:     startTime,
		EndDate:       endTime,
		DeviceFilters: filtersJSON,
		Status:        "pending",
		FileFormats:   fileFormats,
		FilePaths:     datatypes.JSON([]byte("{}")),
		FileSizes:     datatypes.JSON([]byte("{}")),
	}
	if user != nil {
		report.GeneratedBy = &user.ID
	}

	var schedule *reports.ReportSchedule
	if req.Schedule != nil {
		scheduleRow, err := h.createScheduleForReport(c, req.Title, req.Schedule, reportType, format, req.Parameters)
		if err != nil {
			return err
		}
		report.ScheduleID = &scheduleRow.ID
		report.TemplateID = &scheduleRow.TemplateID
		schedule = &scheduleRow
		report.Status = "pending"
	}

	if err := h.Service.CreateReport(c.Request().Context(), &report); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create report")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    buildReportResponse(report, schedule, h.OutputDir),
	})
}

func (h ReportsHandler) UpdateReport(c echo.Context) error {
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

	var req reportUpdateRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	updates := map[string]interface{}{}
	if req.Title != nil {
		updates["title"] = strings.TrimSpace(*req.Title)
	}
	if req.Description != nil {
		updates["description"] = req.Description
	}
	if req.Type != nil {
		updates["report_type"] = normalizeReportType(*req.Type)
	}
	if req.Category != nil {
		updates["category"] = normalizeReportCategory(*req.Category)
	}
	if req.Format != nil {
		format := normalizeReportFormat(*req.Format)
		formatsJSON, err := encodeJSON([]string{format})
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to encode format")
		}
		updates["file_formats"] = formatsJSON
	}
	if req.Status != nil {
		updates["status"] = strings.TrimSpace(*req.Status)
	}
	if req.Parameters != nil {
		startTime, endTime := resolveDateRange(req.Parameters)
		updates["start_date"] = startTime
		updates["end_date"] = endTime
		filtersJSON, err := encodeJSON(req.Parameters)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid parameters")
		}
		updates["device_filters"] = filtersJSON
	}

	report, err := h.Service.UpdateReport(c.Request().Context(), reportID, updates)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Report not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to update report")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    buildReportResponse(report, nil, h.OutputDir),
	})
}

func (h ReportsHandler) DeleteReport(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:delete"); err != nil {
		return err
	}

	reportID, err := parseIDParam(c, "report_id")
	if err != nil {
		return err
	}

	if err := h.Service.DeleteReport(c.Request().Context(), reportID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Report not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete report")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Report deleted successfully",
	})
}

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

var safeReportFilenamePattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]*$`)

func isSafeReportFilename(filename string) bool {
	filename = strings.TrimSpace(filename)
	if filename == "" {
		return false
	}
	if filepath.VolumeName(filename) != "" {
		// Windows 盘符/UNC 路径等均拒绝，避免 filepath.Join 被绝对路径覆盖。
		return false
	}
	if strings.ContainsAny(filename, `/\`) {
		return false
	}
	if strings.Contains(filename, "..") {
		return false
	}
	if filepath.Base(filename) != filename {
		return false
	}
	return safeReportFilenamePattern.MatchString(filename)
}

func (h ReportsHandler) ExportExcel(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:create"); err != nil {
		return err
	}

	var req struct {
		Title  string `json:"title"`
		Sheets []struct {
			Name    string                   `json:"name"`
			Data    []map[string]interface{} `json:"data"`
			Columns []struct {
				Header string `json:"header"`
				Key    string `json:"key"`
			} `json:"columns"`
		} `json:"sheets"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	if strings.TrimSpace(h.OutputDir) == "" {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report output not configured")
	}
	if err := os.MkdirAll(h.OutputDir, 0o755); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create output dir")
	}

	filename := fmt.Sprintf("export-%s.csv", time.Now().UTC().Format("20060102-150405"))
	fullPath := filepath.Join(h.OutputDir, filename)

	file, err := os.Create(fullPath)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create export file")
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	for _, sheet := range req.Sheets {
		if sheet.Name != "" {
			_ = writer.Write([]string{sheet.Name})
		}
		headers := make([]string, 0, len(sheet.Columns))
		keys := make([]string, 0, len(sheet.Columns))
		for _, col := range sheet.Columns {
			headers = append(headers, col.Header)
			keys = append(keys, col.Key)
		}
		if len(headers) > 0 {
			_ = writer.Write(headers)
		}
		for _, row := range sheet.Data {
			values := make([]string, 0, len(keys))
			for _, key := range keys {
				values = append(values, fmt.Sprint(row[key]))
			}
			_ = writer.Write(values)
		}
		_ = writer.Write([]string{})
	}
	writer.Flush()

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"download_url": buildDownloadURL(filename),
		},
	})
}

func (h ReportsHandler) ExportPDF(c echo.Context) error {
	return h.exportTextBased(c, "pdf")
}

func (h ReportsHandler) ExportWord(c echo.Context) error {
	return h.exportTextBased(c, "word")
}

func (h ReportsHandler) exportTextBased(c echo.Context, format string) error {
	if _, err := requirePermission(c, h.Auth, "reports:create"); err != nil {
		return err
	}

	var req struct {
		Title    string `json:"title"`
		Content  string `json:"content"`
		Sections []struct {
			Title   string `json:"title"`
			Content string `json:"content"`
			Type    string `json:"type"`
		} `json:"sections"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	if strings.TrimSpace(h.OutputDir) == "" {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report output not configured")
	}
	if err := os.MkdirAll(h.OutputDir, 0o755); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create output dir")
	}

	ext := "txt"
	if format == "pdf" {
		ext = "pdf"
	} else if format == "word" {
		ext = "doc"
	}

	filename := fmt.Sprintf("export-%s.%s", time.Now().UTC().Format("20060102-150405"), ext)
	fullPath := filepath.Join(h.OutputDir, filename)

	builder := &strings.Builder{}
	builder.WriteString(req.Title)
	builder.WriteString("\n\n")
	if req.Content != "" {
		builder.WriteString(req.Content)
		builder.WriteString("\n\n")
	}
	for _, section := range req.Sections {
		if section.Title != "" {
			builder.WriteString(section.Title)
			builder.WriteString("\n")
		}
		if section.Content != "" {
			builder.WriteString(section.Content)
			builder.WriteString("\n")
		}
		builder.WriteString("\n")
	}

	if err := os.WriteFile(fullPath, []byte(builder.String()), 0o644); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create export file")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"download_url": buildDownloadURL(filename),
		},
	})
}

func (h ReportsHandler) GetReportStats(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	var total int64
	_ = db.WithContext(c.Request().Context()).Model(&reports.Report{}).Count(&total)

	startOfDay := time.Now().UTC().Truncate(24 * time.Hour)
	var generatedToday int64
	_ = db.WithContext(c.Request().Context()).Model(&reports.Report{}).
		Where("created_at >= ?", startOfDay).
		Count(&generatedToday)

	var scheduledCount int64
	_ = db.WithContext(c.Request().Context()).Model(&reports.ReportSchedule{}).Count(&scheduledCount)

	var failedCount int64
	_ = db.WithContext(c.Request().Context()).Model(&reports.Report{}).
		Where("status = ?", "failed").
		Count(&failedCount)

	type avgRow struct {
		Avg float64 `gorm:"column:avg_generation_time"`
	}
	var avg avgRow
	_ = db.WithContext(c.Request().Context()).Model(&reports.Report{}).
		Select("AVG(generation_time) AS avg_generation_time").
		Scan(&avg)

	usage, _ := h.computeFormatUsage(c.Request().Context(), db)
	mostUsed := "pdf"
	maxCount := 0
	for format, count := range usage {
		if count > maxCount {
			maxCount = count
			mostUsed = format
		}
	}

	storageUsed, _ := h.computeStorageUsage(c.Request().Context(), db)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"totalReports":      total,
			"generatedToday":    generatedToday,
			"scheduledReports":  scheduledCount,
			"failedReports":     failedCount,
			"avgGenerationTime": avg.Avg,
			"mostUsedFormat":    mostUsed,
			"storageUsed":       storageUsed,
		},
	})
}

func (h ReportsHandler) GetUsageAnalysis(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}

	var req struct {
		DateRange map[string]string `json:"dateRange"`
	}
	_ = c.Bind(&req)

	start, end := resolveDateRangeFromMap(req.DateRange)
	if start.IsZero() || end.IsZero() {
		end = time.Now().UTC()
		start = end.AddDate(0, 0, -7)
	}

	db := h.Service.DB()
	type dailyRow struct {
		Date  time.Time `gorm:"column:date"`
		Count int       `gorm:"column:count"`
	}
	rows := make([]dailyRow, 0)
	_ = db.WithContext(c.Request().Context()).
		Model(&reports.Report{}).
		Select("DATE(created_at) AS date, COUNT(*) AS count").
		Where("created_at >= ? AND created_at <= ?", start, end).
		Group("DATE(created_at)").
		Order("date").
		Scan(&rows)

	daily := make([]map[string]interface{}, 0, len(rows))
	for _, row := range rows {
		daily = append(daily, map[string]interface{}{
			"date":  row.Date.Format("2006-01-02"),
			"count": row.Count,
		})
	}

	type typeRow struct {
		ReportType string `gorm:"column:report_type"`
		Count      int    `gorm:"column:count"`
	}
	typeRows := make([]typeRow, 0)
	_ = db.WithContext(c.Request().Context()).
		Model(&reports.Report{}).
		Select("report_type, COUNT(*) AS count").
		Group("report_type").
		Scan(&typeRows)

	byType := map[string]int{}
	for _, row := range typeRows {
		byType[row.ReportType] = row.Count
	}

	byFormat, _ := h.computeFormatUsage(c.Request().Context(), db)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"dailyUsage": daily,
			"byType":     byType,
			"byFormat":   byFormat,
		},
	})
}

func (h ReportsHandler) GetPerformanceMetrics(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	metrics, benchmarks, err := buildPerformanceMetrics(c.Request().Context(), db)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load performance metrics")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"metrics":    metrics,
			"benchmarks": benchmarks,
		},
	})
}

func (h ReportsHandler) GetTrendAnalysis(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	var req map[string]interface{}
	_ = c.Bind(&req)

	metrics := readStringSlice(req, "metrics")
	if len(metrics) == 0 {
		metrics = []string{"availability", "performance", "errors", "capacity"}
	}
	granularity := normalizeGranularity(readString(req, "granularity"))
	deviceIDs := parseIntSlice(req["device_ids"])
	if len(deviceIDs) == 0 {
		deviceIDs = parseIntSlice(req["devices"])
	}

	start, end := resolveDateRangeFromPayload(req)
	if start.IsZero() || end.IsZero() {
		now := time.Now().UTC()
		start = now.AddDate(0, 0, -7)
		end = now
	}

	series, err := loadTrendSeries(c.Request().Context(), db, metrics, start, end, granularity, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load trend data")
	}

	payload := make([]map[string]interface{}, 0, len(series))
	for _, item := range series {
		payload = append(payload, buildTrendMetricPayload(item))
	}

	timeframe := timeframeForRange(start, end)
	predictions := buildTrendPredictions(series, predictionSteps(timeframe, granularity), timeframe)
	alerts := buildTrendAlerts(series, "medium", 50)

	dateRange := map[string]interface{}{
		"startDate": start.Format(time.RFC3339),
		"endDate":   end.Format(time.RFC3339),
	}
	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"timeRange":   dateRange,
			"metrics":     payload,
			"predictions": predictions,
			"alerts":      alerts,
		},
	})
}

func (h ReportsHandler) GenerateTrendReport(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:create"); err != nil {
		return err
	}
	return h.GenerateReportFromRequest(c)
}

func (h ReportsHandler) GetTrendPredictions(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	var req map[string]interface{}
	_ = c.Bind(&req)

	metrics := readStringSlice(req, "metrics")
	if len(metrics) == 0 {
		metrics = []string{"availability", "performance"}
	}
	timeframe := normalizeTimeframe(readString(req, "timeframe"))
	deviceIDs := parseIntSlice(req["device_ids"])
	if len(deviceIDs) == 0 {
		deviceIDs = parseIntSlice(req["devices"])
	}

	end := time.Now().UTC()
	start := end.Add(-timeframeDuration(timeframe))
	granularity := "day"

	series, err := loadTrendSeries(c.Request().Context(), db, metrics, start, end, granularity, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load prediction data")
	}
	predictions := buildTrendPredictions(series, predictionSteps(timeframe, granularity), timeframe)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"predictions": predictions,
		},
	})
}

func (h ReportsHandler) GetTrendAnomalies(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	var req map[string]interface{}
	_ = c.Bind(&req)

	metrics := readStringSlice(req, "metrics")
	if len(metrics) == 0 {
		metrics = []string{"availability", "performance", "errors", "capacity"}
	}
	sensitivity := readString(req, "sensitivity")
	if sensitivity == "" {
		sensitivity = "medium"
	}
	deviceIDs := parseIntSlice(req["device_ids"])
	if len(deviceIDs) == 0 {
		deviceIDs = parseIntSlice(req["devices"])
	}

	start, end := resolveDateRangeFromPayload(req)
	if start.IsZero() || end.IsZero() {
		end = time.Now().UTC()
		start = end.AddDate(0, 0, -7)
	}
	granularity := "day"
	if end.Sub(start) <= 48*time.Hour {
		granularity = "hour"
	}

	series, err := loadTrendSeries(c.Request().Context(), db, metrics, start, end, granularity, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load anomaly data")
	}

	anomalies := make([]map[string]interface{}, 0)
	summary := map[string]int{}
	for _, item := range series {
		items := detectAnomalies(item, sensitivity)
		for _, anomaly := range items {
			anomalies = append(anomalies, map[string]interface{}{
				"id":           fmt.Sprintf("%s-%s", anomaly.MetricName, anomaly.Timestamp.Format("20060102150405")),
				"metric":       anomaly.MetricName,
				"display_name": anomaly.DisplayName,
				"timestamp":    anomaly.Timestamp.Format(time.RFC3339),
				"value":        roundFloat(anomaly.Value, 2),
				"expected":     roundFloat(anomaly.Expected, 2),
				"score":        roundFloat(anomaly.Score, 2),
				"severity":     anomaly.Severity,
			})
			summary[anomaly.MetricName]++
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"anomalies": anomalies,
			"summary":   summary,
		},
	})
}

func (h ReportsHandler) GetStatisticsData(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	payload := map[string]interface{}{}
	_ = c.Bind(&payload)

	filters := parseStatisticsFilters(payload)
	ctx := c.Request().Context()

	devicesList, err := loadDeviceSnapshots(ctx, db, filters)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load devices")
	}
	deviceIDs := extractDeviceIDs(devicesList)

	statusCounts := countDeviceStatuses(devicesList)
	overview := map[string]interface{}{
		"total_devices":   len(devicesList),
		"online_devices":  statusCounts["online"],
		"offline_devices": statusCounts["offline"],
		"warning_devices": statusCounts["warning"],
		"error_devices":   statusCounts["error"],
		"avg_uptime":      roundFloat(computeAverageUptime(devicesList), 2),
	}

	inspectionAgg, err := queryInspectionAggregate(ctx, db, filters.Start, filters.End, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inspection statistics")
	}
	avgScore, err := queryAverageInspectionScore(ctx, db, filters.Start, filters.End, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inspection scores")
	}
	overview["total_executions"] = inspectionAgg.TotalExecutions
	overview["avg_score"] = roundFloat(avgScore, 2)

	deviceDistribution, err := buildDeviceDistribution(ctx, db, devicesList)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to build device distribution")
	}
	deviceDistribution["by_status"] = statusCounts

	perfList, perfAgg, err := computeDevicePerformance(ctx, db, devicesList, deviceIDs, filters.Start, filters.End, "performance")
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load performance stats")
	}

	complianceStats, err := buildComplianceStats(ctx, db, filters.Start, filters.End, deviceIDs, inspectionAgg)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load compliance stats")
	}

	historicalComparison, err := buildHistoricalComparison(ctx, db, filters, deviceIDs, devicesList)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load historical comparison")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"overview":            overview,
			"device_distribution": deviceDistribution,
			"performance_stats": map[string]interface{}{
				"by_device":  buildPerformancePayload(perfList),
				"aggregated": buildPerformanceAggregatePayload(perfAgg),
			},
			"compliance_stats":      complianceStats,
			"historical_comparison": historicalComparison,
		},
	})
}

func (h ReportsHandler) GetStatisticsKPI(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	payload := map[string]interface{}{}
	_ = c.Bind(&payload)

	start, end := parseStatisticsRange(payload)
	deviceTypes := readStringSlice(payload, "device_types", "deviceTypes")
	filters := statisticsFilters{
		Start:       start,
		End:         end,
		DeviceTypes: deviceTypes,
	}

	ctx := c.Request().Context()
	devicesList, err := loadDeviceSnapshots(ctx, db, filters)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load devices")
	}
	deviceIDs := extractDeviceIDs(devicesList)

	currentMetrics, err := computeKpiMetrics(ctx, db, filters, devicesList, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to compute KPI metrics")
	}

	comparisonPeriod := readString(payload, "comparison_period", "comparisonPeriod")
	prevStart, prevEnd := resolveComparisonRange(start, end, comparisonPeriod)
	previousMetrics := kpiMetrics{}
	if !prevStart.IsZero() && !prevEnd.IsZero() {
		prevFilters := filters
		prevFilters.Start = prevStart
		prevFilters.End = prevEnd
		previousMetrics, _ = computeKpiMetrics(ctx, db, prevFilters, devicesList, deviceIDs)
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"inspection_completion_rate_change": formatPercentDelta(currentMetrics.CompletionRate, previousMetrics.CompletionRate),
			"device_availability_change":        formatPercentDelta(currentMetrics.Availability, previousMetrics.Availability),
			"avg_health_score_change":           formatNumberDelta(currentMetrics.AvgScore, previousMetrics.AvgScore),
			"severe_issue_count_change":         formatIntDelta(currentMetrics.SevereIssues, previousMetrics.SevereIssues),
		},
	})
}

func (h ReportsHandler) GetStatisticsRankings(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	payload := map[string]interface{}{}
	_ = c.Bind(&payload)

	filters := parseStatisticsFilters(payload)
	rankingType := readString(payload, "ranking_type", "rankingType")
	if rankingType == "" {
		rankingType = "performance"
	}
	topN, ok := readInt(payload, "top_n", "topN")
	if !ok || topN <= 0 {
		topN = 10
	}
	includeBottom := false
	if value, ok := readBool(payload, "include_bottom", "includeBottom"); ok {
		includeBottom = value
	}

	ctx := c.Request().Context()
	devicesList, err := loadDeviceSnapshots(ctx, db, filters)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load devices")
	}
	deviceIDs := extractDeviceIDs(devicesList)

	perfList, _, err := computeDevicePerformance(ctx, db, devicesList, deviceIDs, filters.Start, filters.End, rankingType)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to compute rankings")
	}

	ranked := append([]devicePerformance{}, perfList...)
	sort.Slice(ranked, func(i, j int) bool {
		return ranked[i].Ranking > ranked[j].Ranking
	})

	topItems := ranked
	if len(topItems) > topN {
		topItems = topItems[:topN]
	}

	result := make([]map[string]interface{}, 0, len(topItems))
	result = append(result, buildRankingPayload(topItems)...)

	if includeBottom && len(ranked) > topN {
		bottomItems := ranked
		if len(bottomItems) > topN {
			bottomItems = bottomItems[len(bottomItems)-topN:]
		}
		result = append(result, buildRankingPayload(bottomItems)...)
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    result,
	})
}

func (h ReportsHandler) GenerateStatisticsReport(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:create"); err != nil {
		return err
	}
	return h.GenerateReportFromRequest(c)
}

func (h ReportsHandler) GetDeviceStatistics(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	startTime, endTime, granularity := parseTrendRangeFromQuery(c)

	var totalDevices int64
	_ = db.WithContext(c.Request().Context()).Table("devices").Count(&totalDevices)

	type statusRow struct {
		Status string `gorm:"column:status"`
		Count  int    `gorm:"column:count"`
	}
	rows := make([]statusRow, 0)
	_ = db.WithContext(c.Request().Context()).
		Table("devices").
		Select("status, COUNT(*) AS count").
		Group("status").
		Scan(&rows)

	byStatus := map[string]int{}
	onlineCount := 0
	for _, row := range rows {
		byStatus[row.Status] = row.Count
		if row.Status == "online" {
			onlineCount = row.Count
		}
	}

	onlineRate := 0.0
	if totalDevices > 0 {
		onlineRate = float64(onlineCount) / float64(totalDevices) * 100
	}

	typeRow := make([]struct {
		DeviceType string `gorm:"column:device_type"`
		Count      int    `gorm:"column:count"`
	}, 0)
	_ = db.WithContext(c.Request().Context()).
		Table("devices").
		Select("device_type, COUNT(*) AS count").
		Group("device_type").
		Scan(&typeRow)

	byType := map[string]int{}
	for _, row := range typeRow {
		byType[row.DeviceType] = row.Count
	}

	var avgResponse float64
	_ = db.WithContext(c.Request().Context()).
		Table("devices").
		Select("AVG(response_time) AS avg_response_time").
		Scan(&avgResponse)

	trendData := []map[string]interface{}{}
	if exists, err := tableExists(c.Request().Context(), db, "device_status_history"); err == nil && exists {
		type trendRow struct {
			Bucket time.Time `gorm:"column:bucket"`
			Online int64     `gorm:"column:online"`
			Total  int64     `gorm:"column:total"`
		}
		rows := make([]trendRow, 0)
		bucketExpr := bucketExpression(granularity, "collected_at")
		selectExpr := fmt.Sprintf("%s AS bucket, SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) AS online, COUNT(*) AS total", bucketExpr)
		_ = db.WithContext(c.Request().Context()).
			Table("device_status_history").
			Select(selectExpr).
			Where("collected_at >= ? AND collected_at <= ?", startTime, endTime).
			Group("bucket").
			Order("bucket").
			Scan(&rows)

		for _, row := range rows {
			rate := 0.0
			if row.Total > 0 {
				rate = float64(row.Online) / float64(row.Total) * 100
			}
			trendData = append(trendData, map[string]interface{}{
				"date":           row.Bucket.Format(time.RFC3339),
				"online_devices": row.Online,
				"total_devices":  row.Total,
				"online_rate":    roundFloat(rate, 2),
			})
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"total_devices":     totalDevices,
			"online_rate":       onlineRate,
			"avg_response_time": avgResponse,
			"by_type":           byType,
			"by_status":         byStatus,
			"trend_data":        trendData,
		},
	})
}

func (h ReportsHandler) GetAlertStatistics(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	startTime, endTime, granularity := parseTrendRangeFromQuery(c)

	var totalAlerts int64
	_ = db.WithContext(c.Request().Context()).Table("alerts").Count(&totalAlerts)

	severityRows := make([]struct {
		Severity string `gorm:"column:severity"`
		Count    int    `gorm:"column:count"`
	}, 0)
	_ = db.WithContext(c.Request().Context()).
		Table("alerts").
		Select("severity, COUNT(*) AS count").
		Group("severity").
		Scan(&severityRows)

	bySeverity := map[string]int{}
	for _, row := range severityRows {
		bySeverity[row.Severity] = row.Count
	}

	deviceRows := make([]struct {
		DeviceID int `gorm:"column:device_id"`
		Count    int `gorm:"column:count"`
	}, 0)
	_ = db.WithContext(c.Request().Context()).
		Table("alerts").
		Select("device_id, COUNT(*) AS count").
		Group("device_id").
		Scan(&deviceRows)

	byDevice := map[string]int{}
	for _, row := range deviceRows {
		byDevice[strconv.Itoa(row.DeviceID)] = row.Count
	}

	avgResolutionTime := 0.0
	var avgRow struct {
		AvgResolution float64 `gorm:"column:avg_resolution_time"`
	}
	err := db.WithContext(c.Request().Context()).
		Table("alerts").
		Select("COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at, closed_at) - created_at)) / 3600.0), 0) AS avg_resolution_time").
		Where("created_at IS NOT NULL").
		Where("COALESCE(resolved_at, closed_at) IS NOT NULL").
		Where("status IN ?", []string{"resolved", "closed"}).
		Scan(&avgRow).Error
	if err == nil {
		avgResolutionTime = roundFloat(avgRow.AvgResolution, 2)
	}

	trendData := []map[string]interface{}{}
	type trendRow struct {
		Bucket   time.Time `gorm:"column:bucket"`
		Total    int64     `gorm:"column:total"`
		Resolved int64     `gorm:"column:resolved"`
		Severe   int64     `gorm:"column:severe"`
	}
	rows := make([]trendRow, 0)
	bucketExpr := bucketExpression(granularity, "created_at")
	selectExpr := fmt.Sprintf(`%s AS bucket,
        COUNT(*) AS total,
        SUM(CASE WHEN status IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS resolved,
        SUM(CASE WHEN severity IN ('critical', 'error', 'fatal') THEN 1 ELSE 0 END) AS severe`, bucketExpr)
	_ = db.WithContext(c.Request().Context()).
		Table("alerts").
		Select(selectExpr).
		Where("created_at >= ? AND created_at <= ?", startTime, endTime).
		Group("bucket").
		Order("bucket").
		Scan(&rows)
	for _, row := range rows {
		trendData = append(trendData, map[string]interface{}{
			"date":     row.Bucket.Format(time.RFC3339),
			"total":    row.Total,
			"resolved": row.Resolved,
			"severe":   row.Severe,
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"total_alerts":        totalAlerts,
			"by_severity":         bySeverity,
			"by_device":           byDevice,
			"avg_resolution_time": avgResolutionTime,
			"trend_data":          trendData,
		},
	})
}

func (h ReportsHandler) GetInspectionStatistics(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	startTime, endTime, granularity := parseTrendRangeFromQuery(c)

	var totalTasks int64
	var completedTasks int64
	_ = db.WithContext(c.Request().Context()).Table("inspections").Count(&totalTasks)
	_ = db.WithContext(c.Request().Context()).Table("inspections").Where("status = ?", "completed").Count(&completedTasks)

	passRate := 0.0
	if totalTasks > 0 {
		passRate = float64(completedTasks) / float64(totalTasks) * 100
	}

	deviceTypeRows := make([]struct {
		DeviceType string `gorm:"column:device_type"`
		Count      int    `gorm:"column:count"`
	}, 0)
	_ = db.WithContext(c.Request().Context()).
		Table("inspections AS i").
		Select("COALESCE(NULLIF(d.device_type, ''), '未设置') AS device_type, COUNT(*) AS count").
		Joins("LEFT JOIN devices d ON d.id = i.device_id").
		Group("device_type").
		Scan(&deviceTypeRows)

	byDeviceType := map[string]int{}
	for _, row := range deviceTypeRows {
		deviceType := strings.TrimSpace(row.DeviceType)
		if deviceType == "" {
			deviceType = "未设置"
		}
		byDeviceType[deviceType] = row.Count
	}

	trendData := []map[string]interface{}{}
	type trendRow struct {
		Bucket    time.Time `gorm:"column:bucket"`
		Total     int64     `gorm:"column:total"`
		Completed int64     `gorm:"column:completed"`
		Failed    int64     `gorm:"column:failed"`
	}
	rows := make([]trendRow, 0)
	timeExpr := bucketExpression(granularity, "COALESCE(started_at, created_at)")
	selectExpr := fmt.Sprintf(`%s AS bucket,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed`, timeExpr)
	_ = db.WithContext(c.Request().Context()).
		Table("inspections").
		Select(selectExpr).
		Where("COALESCE(started_at, created_at) >= ? AND COALESCE(started_at, created_at) <= ?", startTime, endTime).
		Group("bucket").
		Order("bucket").
		Scan(&rows)
	for _, row := range rows {
		trendData = append(trendData, map[string]interface{}{
			"date":      row.Bucket.Format(time.RFC3339),
			"total":     row.Total,
			"completed": row.Completed,
			"failed":    row.Failed,
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"total_tasks":     totalTasks,
			"completed_tasks": completedTasks,
			"pass_rate":       passRate,
			"by_device_type":  byDeviceType,
			"trend_data":      trendData,
		},
	})
}

func (h ReportsHandler) GenerateInspectionReport(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:create"); err != nil {
		return err
	}
	return h.GenerateReportFromRequest(c)
}

func (h ReportsHandler) GetInspectionReportData(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	payload := map[string]interface{}{}
	_ = c.Bind(&payload)

	filters := parseInspectionReportFilters(payload)
	ctx := c.Request().Context()

	rows, err := loadInspectionRows(ctx, db, filters)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inspections")
	}

	summary, latestByDevice, latestTimes := summarizeInspectionRows(rows)
	if len(filters.DeviceIDs) > 0 {
		summary.TotalDevices = len(filters.DeviceIDs)
	}

	deviceIDs := make([]int, 0, len(latestByDevice))
	inspectionIDs := make([]int, 0, len(latestByDevice))
	for deviceID, row := range latestByDevice {
		deviceIDs = append(deviceIDs, deviceID)
		inspectionIDs = append(inspectionIDs, row.ID)
	}
	if len(deviceIDs) == 0 && len(filters.DeviceIDs) > 0 {
		deviceIDs = filters.DeviceIDs
	}

	deviceInfo, err := loadInspectionDeviceInfo(ctx, db, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load devices")
	}

	resultsByInspection, err := loadInspectionResults(ctx, db, inspectionIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inspection results")
	}

	availabilityMap, _ := queryDeviceAvailability(ctx, db, filters.Start, filters.End, deviceIDs)
	responseStats, err := queryMetricSummary(ctx, db, "response_time", filters.Start, filters.End, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load response metrics")
	}
	cpuStats, err := queryMetricSummary(ctx, db, "cpu_usage", filters.Start, filters.End, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load cpu metrics")
	}
	memoryStats, err := queryMetricSummary(ctx, db, "memory_usage", filters.Start, filters.End, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load memory metrics")
	}
	diskStats, err := queryMetricSummary(ctx, db, "disk_usage", filters.Start, filters.End, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load disk metrics")
	}
	utilStats, err := queryMetricSummary(ctx, db, "bandwidth_utilization", filters.Start, filters.End, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load utilization metrics")
	}
	inboundStats, err := queryMetricSummaryFallback(ctx, db, []string{"bandwidth_in", "network_bytes_in", "throughput_in"}, filters.Start, filters.End, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inbound metrics")
	}
	outboundStats, err := queryMetricSummaryFallback(ctx, db, []string{"bandwidth_out", "network_bytes_out", "throughput_out"}, filters.Start, filters.End, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load outbound metrics")
	}

	avgScore, err := queryInspectionAverageScore(ctx, db, filters)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inspection scores")
	}

	successRate := 0.0
	if summary.TotalChecks > 0 {
		successRate = float64(summary.PassedChecks) / float64(summary.TotalChecks) * 100
	}

	deviceResults := make([]map[string]interface{}, 0, len(deviceIDs))
	sort.Ints(deviceIDs)
	for _, deviceID := range deviceIDs {
		info, ok := deviceInfo[deviceID]
		if !ok {
			continue
		}
		row, hasInspection := latestByDevice[deviceID]
		inspectedAt := latestTimes[deviceID]
		results := []inspectionResultRow{}
		if hasInspection {
			results = resultsByInspection[row.ID]
		}

		totalChecks := int(row.TotalChecks.Int64)
		passedChecks := int(row.PassedChecks.Int64)
		failedChecks := int(row.FailedChecks.Int64)
		warningChecks := int(row.WarningChecks.Int64)
		if totalChecks == 0 && len(results) > 0 {
			for _, item := range results {
				totalChecks++
				switch strings.ToLower(strings.TrimSpace(item.Status)) {
				case "pass":
					passedChecks++
				case "warning":
					warningChecks++
				default:
					failedChecks++
				}
			}
		}
		score := 0.0
		if totalChecks > 0 {
			score = float64(passedChecks) / float64(totalChecks) * 100
		}

		availability := availabilityMap[deviceID]
		if availability == 0 {
			availability = fallbackAvailability(info.Status)
		}

		responseAvg := responseStats[deviceID].Avg
		if responseAvg == 0 && info.ResponseTime.Valid {
			responseAvg = info.ResponseTime.Float64
		}

		cpuCurrent := valueOrFallback(info.CPUUsage, cpuStats[deviceID].Avg)
		cpuAverage := cpuStats[deviceID].Avg
		cpuPeak := cpuStats[deviceID].Max
		memoryCurrent := valueOrFallback(info.MemoryUsage, memoryStats[deviceID].Avg)
		memoryAverage := memoryStats[deviceID].Avg
		memoryPeak := memoryStats[deviceID].Max

		diskPercent := diskStats[deviceID].Avg
		diskTotal := 0.0
		if diskPercent > 0 {
			diskTotal = 100
		}

		inbound := inboundStats[deviceID].Avg / 1_000_000.0
		outbound := outboundStats[deviceID].Avg / 1_000_000.0
		utilization := utilStats[deviceID].Avg

		groupName := strings.TrimSpace(info.GroupName.String)
		if groupName == "" {
			groupName = "未分组"
		}

		lastCheckTime := ""
		if !inspectedAt.IsZero() {
			lastCheckTime = inspectedAt.Format(time.RFC3339)
		}

		deviceResults = append(deviceResults, map[string]interface{}{
			"device_id":         deviceID,
			"device_name":       info.Name,
			"device_type":       info.DeviceType,
			"device_group":      groupName,
			"status":            normalizeDeviceStatus(info.Status),
			"total_checks":      totalChecks,
			"passed_checks":     passedChecks,
			"failed_checks":     failedChecks,
			"warning_checks":    warningChecks,
			"score":             roundFloat(score, 2),
			"uptime":            roundFloat(availability, 2),
			"avg_response_time": roundFloat(responseAvg, 2),
			"last_check_time":   lastCheckTime,
			"issues":            buildInspectionIssues(results),
			"performance_metrics": map[string]interface{}{
				"cpu": map[string]interface{}{
					"current": roundFloat(cpuCurrent, 2),
					"average": roundFloat(cpuAverage, 2),
					"peak":    roundFloat(cpuPeak, 2),
				},
				"memory": map[string]interface{}{
					"current": roundFloat(memoryCurrent, 2),
					"average": roundFloat(memoryAverage, 2),
					"peak":    roundFloat(memoryPeak, 2),
				},
				"disk_space": map[string]interface{}{
					"used":       roundFloat(diskPercent, 2),
					"total":      roundFloat(diskTotal, 2),
					"percentage": roundFloat(diskPercent, 2),
				},
				"network_traffic": map[string]interface{}{
					"inbound":     roundFloat(inbound, 2),
					"outbound":    roundFloat(outbound, 2),
					"utilization": roundFloat(utilization, 2),
				},
			},
		})
	}

	executionTrends, err := buildExecutionTrends(ctx, db, filters)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load execution trends")
	}

	problemAnalysis, err := buildProblemAnalysis(ctx, db, filters)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load problem analysis")
	}

	data := map[string]interface{}{
		"summary": map[string]interface{}{
			"total_devices":    summary.TotalDevices,
			"total_executions": summary.TotalExecutions,
			"total_checks":     summary.TotalChecks,
			"passed_checks":    summary.PassedChecks,
			"failed_checks":    summary.FailedChecks,
			"warning_checks":   summary.WarningChecks,
			"avg_score":        roundFloat(avgScore, 2),
			"success_rate":     roundFloat(successRate, 2),
		},
		"device_results":   deviceResults,
		"execution_trends": executionTrends,
		"problem_analysis": problemAnalysis,
		"recommendations":  []map[string]interface{}{},
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    data,
	})
}

func (h ReportsHandler) CompareInspectionReports(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	payload := map[string]interface{}{}
	_ = c.Bind(&payload)

	filters := parseInspectionReportFilters(payload)
	if len(filters.DeviceIDs) == 0 {
		deviceIDs := parseIntSlice(payload["deviceIds"])
		if len(deviceIDs) == 0 {
			deviceIDs = parseIntSlice(payload["devices"])
		}
		filters.DeviceIDs = uniqueIntSlice(deviceIDs)
	}

	devices, comparisons, err := buildInspectionComparisonData(c.Request().Context(), db, filters)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to compare inspection reports")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"devices":     devices,
			"comparisons": comparisons,
			"differences": comparisons,
		},
	})
}

func (h ReportsHandler) ListCustomConfigs(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}

	reportType := "custom"
	templates, err := h.Service.ListTemplates(c.Request().Context(), &reportType)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load configs")
	}

	result := make([]map[string]interface{}, 0, len(templates))
	for _, tpl := range templates {
		result = append(result, buildCustomConfigResponse(tpl))
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    result,
	})
}

func (h ReportsHandler) GetCustomConfig(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}

	configID, err := parseIDParam(c, "config_id")
	if err != nil {
		return err
	}

	template, err := h.Service.GetTemplate(c.Request().Context(), configID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Config not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load config")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    buildCustomConfigResponse(template),
	})
}

func (h ReportsHandler) CreateCustomConfig(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:create"); err != nil {
		return err
	}

	var req customConfigRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if strings.TrimSpace(req.Name) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name is required")
	}

	config := map[string]interface{}{
		"template":   req.Template,
		"parameters": req.Parameters,
		"charts":     req.Charts,
		"tables":     req.Tables,
		"filters":    req.Filters,
		"layout":     req.Layout,
	}

	configJSON, err := encodeJSON(config)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid config payload")
	}

	template := reports.ReportTemplate{
		Name:        req.Name,
		Description: req.Description,
		ReportType:  "custom",
		Config:      configJSON,
		IsActive:    true,
	}

	if err := h.Service.CreateTemplate(c.Request().Context(), &template); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create config")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    buildCustomConfigResponse(template),
	})
}

func (h ReportsHandler) UpdateCustomConfig(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:update"); err != nil {
		return err
	}

	configID, err := parseIDParam(c, "config_id")
	if err != nil {
		return err
	}

	var req customConfigRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	updates := map[string]interface{}{}
	if strings.TrimSpace(req.Name) != "" {
		updates["name"] = req.Name
	}
	if req.Description != nil {
		updates["description"] = req.Description
	}

	configUpdates := map[string]interface{}{}
	if req.Template != nil {
		configUpdates["template"] = req.Template
	}
	if req.Parameters != nil {
		configUpdates["parameters"] = req.Parameters
	}
	if req.Charts != nil {
		configUpdates["charts"] = req.Charts
	}
	if req.Tables != nil {
		configUpdates["tables"] = req.Tables
	}
	if req.Filters != nil {
		configUpdates["filters"] = req.Filters
	}
	if req.Layout != nil {
		configUpdates["layout"] = req.Layout
	}

	if len(configUpdates) > 0 {
		// 仅当请求显式携带配置字段时才更新 config，并与历史配置合并，避免“只改名称却把配置清空”的数据破坏。
		existing, err := h.Service.GetTemplate(c.Request().Context(), configID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return echo.NewHTTPError(http.StatusNotFound, "Config not found")
			}
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to load config")
		}

		config := decodeJSONMap(existing.Config)
		for key, value := range configUpdates {
			config[key] = value
		}

		configJSON, err := encodeJSON(config)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid config payload")
		}
		updates["config"] = configJSON
	}

	template, err := h.Service.UpdateTemplate(c.Request().Context(), configID, updates)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Config not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to update config")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    buildCustomConfigResponse(template),
	})
}

func (h ReportsHandler) DeleteCustomConfig(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:delete"); err != nil {
		return err
	}

	configID, err := parseIDParam(c, "config_id")
	if err != nil {
		return err
	}

	if err := h.Service.DeleteTemplate(c.Request().Context(), configID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Config not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete config")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Config deleted successfully",
	})
}

func (h ReportsHandler) GenerateFromCustomConfig(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	user, err := requirePermission(c, h.Auth, "reports:create")
	if err != nil {
		return err
	}

	configID, err := parseIDParam(c, "config_id")
	if err != nil {
		return err
	}

	template, err := h.Service.GetTemplate(c.Request().Context(), configID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Config not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load config")
	}

	var req struct {
		Parameters map[string]interface{} `json:"parameters"`
		Format     string                 `json:"format"`
	}
	_ = c.Bind(&req)

	format := normalizeReportFormat(req.Format)
	params := req.Parameters
	if params == nil {
		params = map[string]interface{}{}
	}

	// 将模板配置与本次生成参数合并写入 DeviceFilters，便于后续生成器读取。
	config := decodeJSONMap(template.Config)
	config["parameters"] = params

	// 自定义报表当前走通用渲染器：注入一份 report_data，避免生成“空报表”。
	chartCount := 0
	if items, ok := config["charts"].([]interface{}); ok {
		chartCount = len(items)
	}
	tableCount := 0
	if items, ok := config["tables"].([]interface{}); ok {
		tableCount = len(items)
	}
	filterCount := 0
	if items, ok := config["filters"].([]interface{}); ok {
		filterCount = len(items)
	}
	layoutColumns := 0
	if layoutMap, ok := config["layout"].(map[string]interface{}); ok {
		if value, ok := readInt(layoutMap, "columns"); ok {
			layoutColumns = value
		}
	}

	configJSON, err := encodeJSON(config)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid parameters")
	}

	start, end := resolveDateRangeFromPayload(params)
	if start.IsZero() || end.IsZero() {
		now := time.Now().UTC()
		start = now.AddDate(0, 0, -7)
		end = now
	}

	config["report_data"] = map[string]interface{}{
		"report_name":  template.Name,
		"range":        fmt.Sprintf("%s ~ %s", start.Format("2006-01-02"), end.Format("2006-01-02")),
		"generated_at": time.Now().UTC().Format(time.RFC3339),
		"summary": map[string]interface{}{
			"charts":         chartCount,
			"tables":         tableCount,
			"filters":        filterCount,
			"layout_columns": layoutColumns,
		},
		"parameters": params,
		"charts":     config["charts"],
		"tables":     config["tables"],
		"filters":    config["filters"],
		"layout":     config["layout"],
		"notes":      "该自定义报表为“配置摘要版”。当前后端未实现按配置动态取数渲染，后续可扩展为真正的数据预览/渲染。",
	}

	// 重新编码（写入 report_data 后）用于生成器落盘。
	configJSON, err = encodeJSON(config)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid parameters")
	}

	formatJSON, err := encodeJSON([]string{format})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to encode format")
	}

	report := reports.Report{
		Title:         template.Name,
		ReportType:    "custom",
		Category:      stringPtr("custom"),
		TemplateID:    &template.ID,
		StartDate:     start,
		EndDate:       end,
		DeviceFilters: configJSON,
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

func (h ReportsHandler) PreviewCustomConfig(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}

	configID, err := parseIDParam(c, "config_id")
	if err != nil {
		return err
	}

	template, err := h.Service.GetTemplate(c.Request().Context(), configID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Config not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load config")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    buildCustomConfigResponse(template),
	})
}

func (h ReportsHandler) ListTemplates(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}

	templates, err := h.Service.ListTemplates(c.Request().Context(), nil)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load templates")
	}

	result := make([]map[string]interface{}, 0, len(templates))
	for _, tpl := range templates {
		result = append(result, buildReportTemplateResponse(tpl))
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    result,
	})
}

func (h ReportsHandler) GetTemplate(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}

	templateID, err := parseIDParam(c, "template_id")
	if err != nil {
		return err
	}

	template, err := h.Service.GetTemplate(c.Request().Context(), templateID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Template not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load template")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    buildReportTemplateResponse(template),
	})
}

func (h ReportsHandler) CreateTemplate(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:create"); err != nil {
		return err
	}

	var req reportTemplateRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if strings.TrimSpace(req.Name) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name is required")
	}

	config := req.Config
	if config == nil {
		config = map[string]interface{}{}
	}
	if len(req.Sections) > 0 {
		config["sections"] = req.Sections
	}
	if len(req.Styles) > 0 {
		config["styles"] = req.Styles
	}
	if req.Type != "" {
		config["template_type"] = req.Type
	}

	configJSON, err := encodeJSON(config)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid config")
	}

	reportType := "custom"
	if req.ReportType != nil {
		reportType = normalizeReportType(*req.ReportType)
	}

	template := reports.ReportTemplate{
		Name:        req.Name,
		Description: req.Description,
		ReportType:  reportType,
		Config:      configJSON,
		IsActive:    true,
	}

	if err := h.Service.CreateTemplate(c.Request().Context(), &template); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create template")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    buildReportTemplateResponse(template),
	})
}

func (h ReportsHandler) UpdateTemplate(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:update"); err != nil {
		return err
	}

	templateID, err := parseIDParam(c, "template_id")
	if err != nil {
		return err
	}

	var req reportTemplateRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	updates := map[string]interface{}{}
	if strings.TrimSpace(req.Name) != "" {
		updates["name"] = req.Name
	}
	if req.Description != nil {
		updates["description"] = req.Description
	}
	if req.ReportType != nil {
		updates["report_type"] = normalizeReportType(*req.ReportType)
	}

	if len(req.Config) > 0 || len(req.Sections) > 0 || len(req.Styles) > 0 {
		config := req.Config
		if config == nil {
			config = map[string]interface{}{}
		}
		if len(req.Sections) > 0 {
			config["sections"] = req.Sections
		}
		if len(req.Styles) > 0 {
			config["styles"] = req.Styles
		}
		if req.Type != "" {
			config["template_type"] = req.Type
		}
		configJSON, err := encodeJSON(config)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid config")
		}
		updates["config"] = configJSON
	}

	template, err := h.Service.UpdateTemplate(c.Request().Context(), templateID, updates)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Template not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to update template")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    buildReportTemplateResponse(template),
	})
}

func (h ReportsHandler) DeleteTemplate(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:delete"); err != nil {
		return err
	}

	templateID, err := parseIDParam(c, "template_id")
	if err != nil {
		return err
	}

	if err := h.Service.DeleteTemplate(c.Request().Context(), templateID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Template not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete template")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Template deleted successfully",
	})
}

func (h ReportsHandler) CloneTemplate(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:create"); err != nil {
		return err
	}

	templateID, err := parseIDParam(c, "template_id")
	if err != nil {
		return err
	}

	var payload struct {
		Name string `json:"name"`
	}
	_ = c.Bind(&payload)

	name := strings.TrimSpace(payload.Name)
	if name == "" {
		name = "复制模板"
	}

	template, err := h.Service.CloneTemplate(c.Request().Context(), templateID, name)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Template not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to clone template")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    buildReportTemplateResponse(template),
	})
}

func (h ReportsHandler) ListScheduledReports(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}

	schedules, err := h.Service.ListSchedules(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load schedules")
	}

	result := make([]map[string]interface{}, 0, len(schedules))
	for _, schedule := range schedules {
		result = append(result, buildScheduleResponse(schedule))
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    result,
	})
}

func (h ReportsHandler) CreateScheduledReport(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	user, err := requirePermission(c, h.Auth, "reports:create")
	if err != nil {
		return err
	}

	var req struct {
		Name           string                 `json:"name"`
		ReportType     string                 `json:"report_type"`
		ScheduleType   string                 `json:"schedule_type"`
		ScheduleConfig map[string]interface{} `json:"schedule_config"`
		Recipients     []string               `json:"recipients"`
		ExportFormat   string                 `json:"export_format"`
		Enabled        *bool                  `json:"enabled"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if strings.TrimSpace(req.Name) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name is required")
	}

	frequency := strings.ToLower(strings.TrimSpace(req.ScheduleType))
	if frequency == "" {
		frequency = "daily"
	}
	cronExpr, err := buildCronExpression(frequency, nil, nil, "")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	outputFormats, err := encodeJSON([]string{normalizeReportFormat(req.ExportFormat)})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to encode format")
	}
	recipientsJSON, err := encodeJSON(req.Recipients)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to encode recipients")
	}

	dataRangeJSON, err := encodeJSON(req.ScheduleConfig)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid schedule config")
	}

	template := reports.ReportTemplate{
		Name:       fmt.Sprintf("%s 模板", req.Name),
		ReportType: normalizeReportType(req.ReportType),
		Config:     dataRangeJSON,
		IsActive:   true,
	}
	if err := h.Service.CreateTemplate(c.Request().Context(), &template); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create template")
	}

	schedule := reports.ReportSchedule{
		Name:           req.Name,
		TemplateID:     template.ID,
		CronExpression: cronExpr,
		DataRange:      dataRangeJSON,
		OutputFormats:  outputFormats,
		Recipients:     recipientsJSON,
		IsActive:       defaultBool(req.Enabled, true),
	}
	if user != nil {
		schedule.CreatedBy = &user.ID
	}

	if err := h.Service.CreateSchedule(c.Request().Context(), &schedule); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create schedule")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    buildScheduleResponse(schedule),
	})
}

func (h ReportsHandler) DeleteScheduledReport(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:delete"); err != nil {
		return err
	}

	scheduleID, err := parseIDParam(c, "report_id")
	if err != nil {
		return err
	}

	if err := h.Service.DeleteSchedule(c.Request().Context(), scheduleID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Schedule not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete schedule")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Schedule deleted successfully",
	})
}

func (h ReportsHandler) generateReportByID(c echo.Context, permission string) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, permission); err != nil {
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

	format := resolveReportFormat(report)
	report.Status = "generating"
	updated, _ := h.Service.UpdateReport(c.Request().Context(), report.ID, map[string]interface{}{
		"status": "generating",
	})
	report = updated

	report, _ = h.completeReportGeneration(c, report, format)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    buildReportResponse(report, nil, h.OutputDir),
	})
}

func (h ReportsHandler) completeReportGeneration(c echo.Context, report reports.Report, format string) (reports.Report, error) {
	filePath, err := reports.GenerateReportFile(c.Request().Context(), h.Service.DB(), h.OutputDir, report, format)
	if err != nil {
		updates := map[string]interface{}{
			"status":        "failed",
			"error_message": err.Error(),
		}
		updated, _ := h.Service.UpdateReport(c.Request().Context(), report.ID, updates)
		return updated, err
	}

	paths := map[string]string{format: filePath}

	var size int64
	if info, statErr := os.Stat(filePath); statErr == nil {
		size = info.Size()
	}

	sizes := map[string]int64{format: size}

	// 预览优先使用 HTML（观感更佳），因此在主格式生成成功后，尽量补一份 HTML 文件。
	// HTML 生成失败不影响主报表状态，只是没有 preview_url。
	if format != "html" {
		htmlPath, htmlErr := reports.GenerateReportFile(c.Request().Context(), h.Service.DB(), h.OutputDir, report, "html")
		if htmlErr == nil && strings.TrimSpace(htmlPath) != "" {
			paths["html"] = htmlPath
			if info, statErr := os.Stat(htmlPath); statErr == nil {
				sizes["html"] = info.Size()
			}
		} else if htmlErr != nil {
			c.Logger().Warnf("generate report html preview failed: report_id=%d err=%v", report.ID, htmlErr)
		}
	}

	fileFormats := []string{format}
	formatsJSON, _ := encodeJSON(fileFormats)
	pathsJSON, _ := encodeJSON(paths)
	sizesJSON, _ := encodeJSON(sizes)

	updates := map[string]interface{}{
		"status":       "completed",
		"generated_at": time.Now().UTC(),
		"file_formats": formatsJSON,
		"file_paths":   pathsJSON,
		"file_sizes":   sizesJSON,
	}
	updated, updateErr := h.Service.UpdateReport(c.Request().Context(), report.ID, updates)
	if updateErr != nil {
		return report, updateErr
	}
	return updated, nil
}

func (h ReportsHandler) createScheduleForReport(c echo.Context, name string, schedule *reportScheduleRequest, reportType string, format string, parameters map[string]interface{}) (reports.ReportSchedule, error) {
	if schedule == nil {
		return reports.ReportSchedule{}, fmt.Errorf("schedule is nil")
	}

	cronExpr, err := buildCronExpression(schedule.Frequency, schedule.DayOfWeek, schedule.DayOfMonth, schedule.Time)
	if err != nil {
		return reports.ReportSchedule{}, echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	outputFormats, err := encodeJSON([]string{format})
	if err != nil {
		return reports.ReportSchedule{}, echo.NewHTTPError(http.StatusInternalServerError, "failed to encode output format")
	}

	recipientsJSON, err := encodeJSON(schedule.Recipients)
	if err != nil {
		return reports.ReportSchedule{}, echo.NewHTTPError(http.StatusInternalServerError, "failed to encode recipients")
	}

	dataRangeJSON, err := encodeJSON(parameters)
	if err != nil {
		return reports.ReportSchedule{}, echo.NewHTTPError(http.StatusBadRequest, "invalid parameters")
	}

	template := reports.ReportTemplate{
		Name:       fmt.Sprintf("%s 模板", name),
		ReportType: reportType,
		Config:     dataRangeJSON,
		IsActive:   true,
	}
	if err := h.Service.CreateTemplate(c.Request().Context(), &template); err != nil {
		return reports.ReportSchedule{}, echo.NewHTTPError(http.StatusInternalServerError, "failed to create template")
	}

	scheduleRow := reports.ReportSchedule{
		Name:           name,
		TemplateID:     template.ID,
		CronExpression: cronExpr,
		DataRange:      dataRangeJSON,
		OutputFormats:  outputFormats,
		Recipients:     recipientsJSON,
		IsActive:       defaultBool(schedule.Enabled, true),
	}

	if err := h.Service.CreateSchedule(c.Request().Context(), &scheduleRow); err != nil {
		return reports.ReportSchedule{}, echo.NewHTTPError(http.StatusInternalServerError, "failed to create schedule")
	}
	return scheduleRow, nil
}

func buildReportResponse(report reports.Report, schedule *reports.ReportSchedule, outputDir string) map[string]interface{} {
	parameters := decodeJSONMap(report.DeviceFilters)
	parameters = ensureDateRange(parameters, report.StartDate, report.EndDate)

	format := resolveReportFormat(report)
	filePath, fileSize := resolveReportFile(report, format)
	downloadURL := ""
	if filePath != "" {
		downloadURL = buildDownloadURL(filepath.Base(filePath))
	}

	paths := decodeJSONMap(report.FilePaths)
	previewURL := ""
	if value, ok := paths["html"]; ok {
		htmlPath := fmt.Sprint(value)
		if strings.TrimSpace(htmlPath) != "" {
			previewURL = buildDownloadURL(filepath.Base(htmlPath))
		}
	}

	// available_formats：主格式优先，其次 html，其余按字母序，便于前端稳定展示/切换。
	availableFormats := make([]string, 0, len(paths))
	seen := map[string]bool{}
	if _, ok := paths[format]; ok {
		availableFormats = append(availableFormats, format)
		seen[format] = true
	}
	if _, ok := paths["html"]; ok && !seen["html"] {
		availableFormats = append(availableFormats, "html")
		seen["html"] = true
	}
	rest := make([]string, 0, len(paths))
	for key := range paths {
		if seen[key] {
			continue
		}
		rest = append(rest, key)
	}
	sort.Strings(rest)
	availableFormats = append(availableFormats, rest...)

	status := report.Status
	if report.ScheduleID != nil && status == "pending" {
		status = "scheduled"
	}

	result := map[string]interface{}{
		"id":                report.ID,
		"name":              report.Title,
		"title":             report.Title,
		"description":       report.Description,
		"report_type":       report.ReportType,
		"type":              report.ReportType,
		"category":          defaultStringPtr(report.Category, "custom"),
		"status":            status,
		"start_time":        report.StartDate,
		"end_time":          report.EndDate,
		"format":            format,
		"created_by":        report.GeneratedBy,
		"created_at":        report.CreatedAt,
		"updated_at":        report.UpdatedAt,
		"completed_at":      report.GeneratedAt,
		"generated_by":      report.GeneratedBy,
		"error_message":     report.ErrorMessage,
		"file_path":         filePath,
		"file_size":         fileSize,
		"download_url":      downloadURL,
		"preview_url":       previewURL,
		"available_formats": availableFormats,
		"parameters":        parameters,
	}

	if schedule != nil {
		result["schedule"] = buildScheduleResponse(*schedule)
	}

	return result
}

func buildScheduleResponse(schedule reports.ReportSchedule) map[string]interface{} {
	frequency, dayOfWeek, dayOfMonth, timeValue := parseCronExpression(schedule.CronExpression)
	recipients := decodeJSONStringSlice(schedule.Recipients)
	return map[string]interface{}{
		"id":           schedule.ID,
		"name":         schedule.Name,
		"enabled":      schedule.IsActive,
		"frequency":    frequency,
		"day_of_week":  dayOfWeek,
		"day_of_month": dayOfMonth,
		"time":         timeValue,
		"recipients":   recipients,
		"last_run":     schedule.LastRun,
		"next_run":     schedule.NextRun,
	}
}

func buildReportTemplateResponse(template reports.ReportTemplate) map[string]interface{} {
	config := common.DecodeJSONMap(template.Config)
	return map[string]interface{}{
		"id":       template.ID,
		"name":     template.Name,
		"type":     config["template_type"],
		"sections": config["sections"],
		"styles":   config["styles"],
		"config":   config,
	}
}

func buildCustomConfigResponse(template reports.ReportTemplate) map[string]interface{} {
	config := decodeJSONMap(template.Config)
	tplType := "custom"
	if template.IsDefault {
		tplType = "template"
	}
	return map[string]interface{}{
		"id":          template.ID,
		"name":        template.Name,
		"type":        tplType,
		"description": template.Description,
		"is_default":  template.IsDefault,
		"is_active":   template.IsActive,
		"created_by":  template.CreatedBy,
		"created_at":  template.CreatedAt,
		"updated_at":  template.UpdatedAt,
		"template":    config["template"],
		"parameters":  config["parameters"],
		"charts":      config["charts"],
		"tables":      config["tables"],
		"filters":     config["filters"],
		"layout":      config["layout"],
	}
}

func resolveReportFormat(report reports.Report) string {
	formats := decodeJSONStringSlice(report.FileFormats)
	if len(formats) > 0 {
		return formats[0]
	}
	return "pdf"
}

func resolveReportFile(report reports.Report, format string) (string, int64) {
	if format == "" {
		format = resolveReportFormat(report)
	}

	paths := decodeJSONMap(report.FilePaths)
	sizes := decodeJSONMap(report.FileSizes)

	if value, ok := paths[format]; ok {
		filePath := fmt.Sprint(value)
		size := toInt64(sizes[format])
		return filePath, size
	}

	for key, value := range paths {
		filePath := fmt.Sprint(value)
		size := toInt64(sizes[key])
		return filePath, size
	}

	return "", 0
}

func encodeJSON(value interface{}) (datatypes.JSON, error) {
	if value == nil {
		return datatypes.JSON([]byte("null")), nil
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return datatypes.JSON(raw), nil
}

func decodeJSONStringSlice(raw datatypes.JSON) []string {
	if len(raw) == 0 {
		return []string{}
	}
	var result []string
	if err := json.Unmarshal(raw, &result); err != nil {
		return []string{}
	}
	return result
}

func ensureDateRange(params map[string]interface{}, start, end time.Time) map[string]interface{} {
	if params == nil {
		params = map[string]interface{}{}
	}
	rangeValue, ok := params["dateRange"].(map[string]interface{})
	if !ok {
		rangeValue = map[string]interface{}{}
	}
	if _, ok := rangeValue["startDate"]; !ok {
		rangeValue["startDate"] = start.Format(time.RFC3339)
	}
	if _, ok := rangeValue["endDate"]; !ok {
		rangeValue["endDate"] = end.Format(time.RFC3339)
	}
	params["dateRange"] = rangeValue
	return params
}

func resolveDateRange(parameters map[string]interface{}) (time.Time, time.Time) {
	if parameters == nil {
		now := time.Now().UTC()
		return now.Add(-24 * time.Hour), now
	}
	if dateRange, ok := parameters["dateRange"].(map[string]interface{}); ok {
		startStr := fmt.Sprint(dateRange["startDate"])
		endStr := fmt.Sprint(dateRange["endDate"])
		start, _ := parseTimeOptional(startStr)
		end, _ := parseTimeOptional(endStr)
		if start != nil && end != nil {
			return *start, *end
		}
	}
	now := time.Now().UTC()
	return now.Add(-24 * time.Hour), now
}

func resolveDateRangeFromMap(rangeMap map[string]string) (time.Time, time.Time) {
	startStr := strings.TrimSpace(rangeMap["startDate"])
	endStr := strings.TrimSpace(rangeMap["endDate"])
	start, _ := parseTimeOptional(startStr)
	end, _ := parseTimeOptional(endStr)
	if start == nil || end == nil {
		return time.Time{}, time.Time{}
	}
	return *start, *end
}

func resolveDateRangeFromPayload(payload map[string]interface{}) (time.Time, time.Time) {
	if payload == nil {
		return time.Time{}, time.Time{}
	}
	rangeValue, ok := payload["dateRange"].(map[string]interface{})
	if !ok {
		rangeValue, _ = payload["date_range"].(map[string]interface{})
	}
	startStr := fmt.Sprint(rangeValue["startDate"])
	if startStr == "" {
		startStr = fmt.Sprint(rangeValue["start_date"])
	}
	endStr := fmt.Sprint(rangeValue["endDate"])
	if endStr == "" {
		endStr = fmt.Sprint(rangeValue["end_date"])
	}
	start, _ := parseTimeOptional(startStr)
	end, _ := parseTimeOptional(endStr)
	if start == nil || end == nil {
		return time.Time{}, time.Time{}
	}
	return *start, *end
}

func parseGenerateRange(startStr, endStr string) (time.Time, time.Time) {
	start, _ := parseTimeOptional(startStr)
	end, _ := parseTimeOptional(endStr)
	if start != nil && end != nil {
		return *start, *end
	}
	now := time.Now().UTC()
	return now.Add(-24 * time.Hour), now
}

func parseDateRangeFromPayload(payload map[string]interface{}) map[string]interface{} {
	start, end := resolveDateRangeFromPayload(payload)
	if start.IsZero() || end.IsZero() {
		now := time.Now().UTC()
		start = now.AddDate(0, 0, -7)
		end = now
	}
	return map[string]interface{}{
		"startDate": start.Format(time.RFC3339),
		"endDate":   end.Format(time.RFC3339),
	}
}

func parseIDParam(c echo.Context, name string) (int, error) {
	raw := strings.TrimSpace(c.Param(name))
	if raw == "" {
		return 0, echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	id, err := strconv.Atoi(raw)
	if err != nil || id <= 0 {
		return 0, echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	return id, nil
}

func normalizeReportType(raw string) string {
	normalized := strings.ToLower(strings.TrimSpace(raw))
	switch normalized {
	case "device_status":
		return "availability"
	case "alert_summary":
		return "alert"
	case "inspection_summary":
		return "inspection"
	case "performance", "availability", "alert", "inspection", "trend", "statistics", "custom":
		return normalized
	default:
		return "custom"
	}
}

func normalizeReportCategory(raw string) string {
	normalized := strings.ToLower(strings.TrimSpace(raw))
	switch normalized {
	case "daily", "weekly", "monthly", "quarterly", "yearly", "custom":
		return normalized
	default:
		return "custom"
	}
}

func normalizeReportFormat(raw string) string {
	normalized := strings.ToLower(strings.TrimSpace(raw))
	switch normalized {
	case "pdf", "excel", "html", "word", "csv", "json":
		return normalized
	default:
		return "pdf"
	}
}

func parseTimeOptional(value string) (*time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return &parsed, nil
	}
	if parsed, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return &parsed, nil
	}
	if parsed, err := time.Parse("2006-01-02", value); err == nil {
		return &parsed, nil
	}
	return nil, fmt.Errorf("invalid time format")
}

func parseIntWithDefault(value string, fallback int) int {
	if value == "" {
		return fallback
	}
	if parsed, err := strconv.Atoi(value); err == nil {
		return parsed
	}
	return fallback
}

func defaultString(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func defaultStringPtr(value *string, fallback string) string {
	if value == nil || strings.TrimSpace(*value) == "" {
		return fallback
	}
	return *value
}

func defaultBool(value *bool, fallback bool) bool {
	if value == nil {
		return fallback
	}
	return *value
}

func toInt64(value interface{}) int64 {
	switch v := value.(type) {
	case int64:
		return v
	case int:
		return int64(v)
	case float64:
		return int64(v)
	case string:
		if parsed, err := strconv.ParseInt(v, 10, 64); err == nil {
			return parsed
		}
	default:
		return 0
	}
	return 0
}

func stringPtr(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return &value
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func buildCronExpression(frequency string, dayOfWeek *int, dayOfMonth *int, timeValue string) (string, error) {
	frequency = strings.ToLower(strings.TrimSpace(frequency))
	hour, minute, err := parseHourMinute(timeValue)
	if err != nil {
		return "", err
	}

	switch frequency {
	case "weekly":
		weekday := 1
		if dayOfWeek != nil {
			weekday = *dayOfWeek
		}
		return fmt.Sprintf("0 %d %d * * %d", minute, hour, weekday), nil
	case "monthly":
		day := 1
		if dayOfMonth != nil {
			day = *dayOfMonth
		}
		return fmt.Sprintf("0 %d %d %d * *", minute, hour, day), nil
	case "daily", "":
		return fmt.Sprintf("0 %d %d * * *", minute, hour), nil
	default:
		return "", fmt.Errorf("unsupported frequency")
	}
}

func parseCronExpression(expr string) (string, *int, *int, string) {
	parts := strings.Fields(expr)
	if len(parts) < 6 {
		return "daily", nil, nil, "00:00"
	}
	minute, _ := strconv.Atoi(parts[1])
	hour, _ := strconv.Atoi(parts[2])
	timeValue := fmt.Sprintf("%02d:%02d", hour, minute)

	dayOfMonth := parts[3]
	dayOfWeek := parts[5]

	if dayOfWeek != "*" {
		value, err := strconv.Atoi(dayOfWeek)
		if err == nil {
			return "weekly", &value, nil, timeValue
		}
	}
	if dayOfMonth != "*" {
		value, err := strconv.Atoi(dayOfMonth)
		if err == nil {
			return "monthly", nil, &value, timeValue
		}
	}

	return "daily", nil, nil, timeValue
}

func parseHourMinute(value string) (int, int, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, 0, nil
	}
	parts := strings.Split(value, ":")
	if len(parts) < 2 {
		return 0, 0, fmt.Errorf("invalid time format")
	}
	hour, err := strconv.Atoi(parts[0])
	if err != nil {
		return 0, 0, fmt.Errorf("invalid time format")
	}
	minute, err := strconv.Atoi(parts[1])
	if err != nil {
		return 0, 0, fmt.Errorf("invalid time format")
	}
	return hour, minute, nil
}

func buildDownloadURL(filename string) string {
	return fmt.Sprintf("/api/v1/reports/files/%s", filename)
}

func (h ReportsHandler) computeFormatUsage(ctx context.Context, db *gorm.DB) (map[string]int, error) {
	rows := make([]reports.Report, 0)
	if err := db.WithContext(ctx).Select("id, file_formats").Find(&rows).Error; err != nil {
		return map[string]int{}, err
	}

	result := map[string]int{}
	for _, row := range rows {
		formats := decodeJSONStringSlice(row.FileFormats)
		for _, format := range formats {
			result[format]++
		}
	}
	return result, nil
}

func (h ReportsHandler) computeStorageUsage(ctx context.Context, db *gorm.DB) (int64, error) {
	rows := make([]reports.Report, 0)
	if err := db.WithContext(ctx).Select("id, file_sizes").Find(&rows).Error; err != nil {
		return 0, err
	}

	var total int64
	for _, row := range rows {
		sizes := decodeJSONMap(row.FileSizes)
		for _, value := range sizes {
			total += toInt64(value)
		}
	}
	return total, nil
}
