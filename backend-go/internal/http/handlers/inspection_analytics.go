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
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

func (h InspectionHandler) GetStats(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not initialized")
	}

	var totalStrategies int64
	if err := db.WithContext(c.Request().Context()).
		Table("inspection_strategies").
		Count(&totalStrategies).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inspection stats")
	}

	var activeStrategies int64
	if err := db.WithContext(c.Request().Context()).
		Table("inspection_strategies").
		Where("enabled = ?", true).
		Count(&activeStrategies).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inspection stats")
	}

	start, end, hasExplicitRange := resolveRequestedAnalyticsRange(c)
	if !hasExplicitRange {
		start, end = resolveStatsRange(c.QueryParam("range"))
	}
	previousStart := start.Add(start.Sub(end))
	previousEnd := start

	current, err := computeStatsSummary(c.Request().Context(), db, "started_at", start, end)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inspection stats")
	}
	previous, err := computeStatsSummary(c.Request().Context(), db, "started_at", previousStart, previousEnd)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inspection stats")
	}
	recentExecutions, err := h.loadRecentCompletedExecutions(c.Request().Context(), start, end, 7)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inspection stats")
	}

	data := map[string]interface{}{
		"totalStrategies":  int(totalStrategies),
		"activeStrategies": int(activeStrategies),
		"executionCount":   current.TotalExecutions,
		"successRate":      current.SuccessRate,
		"avgScore":         current.AvgScore,
		"changes": map[string]interface{}{
			"executionsChange":  pctChange(current.TotalExecutions, previous.TotalExecutions),
			"successRateChange": deltaChange(current.SuccessRate, previous.SuccessRate),
			"avgScoreChange":    deltaChange(current.AvgScore, previous.AvgScore),
			"strategiesChange":  "0.0%",
		},
		"recentExecutions": recentExecutions,
	}
	if !hasExplicitRange {
		data["todayExecutions"] = current.TotalExecutions
	}

	return inspectionOK(c, data)
}

func (h InspectionHandler) GetTrends(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	period := strings.TrimSpace(c.QueryParam("period"))
	if period == "" {
		period = "week"
	}
	startDate, _ := parseOptionalDate(c.QueryParam("start_date"))
	endDate, _ := parseOptionalDate(c.QueryParam("end_date"))

	start, end := resolveTrendRange(period, startDate, endDate)

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not initialized")
	}

	type trendRow struct {
		Date       time.Time `gorm:"column:date"`
		Executions int       `gorm:"column:executions"`
		Success    int       `gorm:"column:success"`
		Failed     int       `gorm:"column:failed"`
		AvgScore   float64   `gorm:"column:avg_score"`
	}

	// 执行趋势统一以 started_at 为执行时间口径
	dateExpr := "date_trunc('week', started_at)"
	switch period {
	case "day":
		dateExpr = "date_trunc('day', started_at)"
	case "month":
		dateExpr = "date_trunc('month', started_at)"
	}

	rows := make([]trendRow, 0)

	timeCol := "started_at"

	if err := db.WithContext(c.Request().Context()).
		Table("inspections").
		Select(fmt.Sprintf("%s AS date, COUNT(*) AS executions, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS success, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed, AVG(CASE WHEN total_checks > 0 THEN passed_checks::float / total_checks * 100 ELSE NULL END) AS avg_score", dateExpr)).
		Where(fmt.Sprintf("%s >= ? AND %s <= ?", timeCol, timeCol), start, end).
		Group("date").
		Order("date ASC").
		Scan(&rows).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load trend data")
	}

	// 如果数据库有数据，使用 generateTrendTimeSeries 填充缺失的时间点
	if len(rows) > 0 {
		dataMap := make(map[string]trendDataPoint, len(rows))
		for _, row := range rows {
			key := row.Date.Format("2006-01-02")
			dataMap[key] = trendDataPoint{
				Date:       row.Date,
				Executions: row.Executions,
				Success:    row.Success,
				Failed:     row.Failed,
				AvgScore:   row.AvgScore,
			}
		}
		payload := generateTrendTimeSeries(start, end, period, dataMap)
		return inspectionOK(c, payload)
	}

	// 如果没有数据，生成空的时间序列
	payload := generateEmptyTrendTimeSeries(start, end, period)

	return inspectionOK(c, payload)
}

func (h InspectionHandler) GetDeviceDistribution(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not initialized")
	}

	type typeRow struct {
		Type  string `gorm:"column:device_type"`
		Count int    `gorm:"column:count"`
	}
	rows := make([]typeRow, 0)
	query := db.WithContext(c.Request().Context()).
		Table("inspections").
		Select("devices.device_type AS device_type, COUNT(DISTINCT inspections.device_id) AS count").
		Joins("JOIN devices ON devices.id = inspections.device_id")

	if start, end, ok := resolveRequestedAnalyticsRange(c); ok {
		query = query.Where("inspections.started_at >= ? AND inspections.started_at <= ?", start, end)
	}

	if err := query.
		Group("devices.device_type").
		Scan(&rows).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load device distribution")
	}

	colors := []string{"#5470C6", "#91CC75", "#FAC858", "#EE6666", "#73C0DE", "#3BA272", "#FC8452", "#9A60B4", "#EA7CCC"}
	payload := make([]map[string]interface{}, 0, len(rows))
	for i, row := range rows {
		name := strings.TrimSpace(row.Type)
		if name == "" {
			continue
		}
		color := colors[i%len(colors)]
		payload = append(payload, map[string]interface{}{
			"name":  name,
			"value": row.Count,
			"color": color,
		})
	}

	return inspectionOK(c, payload)
}

func (h InspectionHandler) GetProblemDistribution(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not initialized")
	}

	type row struct {
		Category string `gorm:"column:category"`
		Count    int    `gorm:"column:count"`
	}
	rows := make([]row, 0)
	query := db.WithContext(c.Request().Context()).
		Table("inspection_results").
		Select("inspection_results.check_item_type AS category, COUNT(*) AS count").
		Joins("JOIN inspections ON inspections.id = inspection_results.inspection_id")

	if start, end, ok := resolveRequestedAnalyticsRange(c); ok {
		query = query.Where("inspections.started_at >= ? AND inspections.started_at <= ?", start, end)
	}

	if err := query.
		Where("inspection_results.status IN ?", []string{"fail", "warning"}).
		Group("inspection_results.check_item_type").
		Order("COUNT(*) DESC").
		Scan(&rows).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load problem distribution")
	}

	categoryNames := map[string]string{
		"connectivity":     "网络连通性",
		"cpu_usage":        "CPU使用率",
		"memory_usage":     "内存使用率",
		"disk_usage":       "磁盘空间",
		"interface_status": "端口状态",
		"temperature":      "温度告警",
		"snmp":             "SNMP检查",
		"ssh":              "SSH检查",
		"http":             "HTTP检查",
		"ping":             "Ping检查",
		"script":           "脚本检查",
	}

	payload := make([]map[string]interface{}, 0, len(rows))
	for _, item := range rows {
		label := categoryNames[item.Category]
		if label == "" {
			label = item.Category
		}
		if strings.TrimSpace(label) == "" {
			label = "其他"
		}
		payload = append(payload, map[string]interface{}{
			"category": label,
			"count":    item.Count,
		})
	}

	return inspectionOK(c, payload)
}

func (h InspectionHandler) ExportAnalytics(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}
	if h.Reports == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if strings.TrimSpace(h.ReportOutputDir) == "" {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report output not configured")
	}

	period := strings.TrimSpace(c.QueryParam("period"))
	if period == "" {
		period = "week"
	}
	startDate, _ := parseOptionalDate(c.QueryParam("start_date"))
	endDate, _ := parseOptionalDate(c.QueryParam("end_date"))
	start, end := resolveTrendRange(period, startDate, endDate)

	format := strings.ToLower(strings.TrimSpace(c.QueryParam("format_type")))
	if format == "" {
		format = "excel"
	}

	params := map[string]interface{}{
		"dateRange": map[string]interface{}{
			"startDate": start.Format(time.RFC3339),
			"endDate":   end.Format(time.RFC3339),
		},
	}
	paramsJSON, _ := encodeJSON(params)

	report := reports.Report{
		ID:            int(time.Now().Unix()),
		Title:         "统计分析报告",
		ReportType:    "statistics",
		StartDate:     start,
		EndDate:       end,
		DeviceFilters: paramsJSON,
		Status:        "completed",
	}

	filePath, err := reports.GenerateReportFile(c.Request().Context(), h.Reports.DB(), h.ReportOutputDir, report, format)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to export analytics")
	}

	filename := filepath.Base(filePath)
	contentType := reportContentType(filepath.Ext(filename))
	c.Response().Header().Set(echo.HeaderContentType, contentType)
	c.Response().Header().Set(echo.HeaderContentDisposition, fmt.Sprintf("attachment; filename=\"%s\"", filename))
	return c.File(filePath)
}

func (h InspectionHandler) GenerateInspectionReport(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if h.Reports == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if strings.TrimSpace(h.ReportOutputDir) == "" {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report output not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	taskID, _ := readOptionalInt(payload, "task_id", "taskId")
	deviceIDs := readIntSlice(payload, "device_ids", "deviceIds")
	startDate, _ := readOptionalString(payload, "start_date", "startDate")
	endDate, _ := readOptionalString(payload, "end_date", "endDate")
	format := readString(payload, "format")
	if format == "" {
		format = "pdf"
	}

	start, _ := parseTimeOptional(stringValue(startDate))
	end, _ := parseTimeOptional(stringValue(endDate))
	if start == nil || end == nil {
		now := time.Now().UTC()
		start = ptrTime(now.Add(-24 * time.Hour))
		end = ptrTime(now)
	}

	params := map[string]interface{}{
		"dateRange": map[string]interface{}{
			"startDate": start.Format(time.RFC3339),
			"endDate":   end.Format(time.RFC3339),
		},
	}
	if taskID != nil {
		params["task_id"] = *taskID
	}
	if len(deviceIDs) > 0 {
		params["device_ids"] = deviceIDs
	}
	paramsJSON, _ := encodeJSON(params)

	report := reports.Report{
		Title:         "巡检报告",
		ReportType:    "inspection",
		StartDate:     *start,
		EndDate:       *end,
		DeviceFilters: paramsJSON,
		Status:        "generating",
	}

	if err := h.Reports.CreateReport(c.Request().Context(), &report); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create report")
	}

	filePath, err := reports.GenerateReportFile(c.Request().Context(), h.Reports.DB(), h.ReportOutputDir, report, format)
	if err != nil {
		_, _ = h.Reports.UpdateReport(c.Request().Context(), report.ID, map[string]interface{}{
			"status":        "failed",
			"error_message": err.Error(),
		})
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate report")
	}

	fileFormats, _ := encodeJSON([]string{format})
	filePaths, _ := encodeJSON(map[string]string{format: filePath})

	var fileSize int64
	if info, err := os.Stat(filePath); err == nil {
		fileSize = info.Size()
	}
	fileSizes, _ := encodeJSON(map[string]int64{format: fileSize})

	_, _ = h.Reports.UpdateReport(c.Request().Context(), report.ID, map[string]interface{}{
		"status":       "completed",
		"generated_at": time.Now().UTC(),
		"file_formats": fileFormats,
		"file_paths":   filePaths,
		"file_sizes":   fileSizes,
	})

	downloadURL := buildReportsDownloadURL(filepath.Base(filePath))
	return inspectionOK(c, map[string]interface{}{
		"report_id":    fmt.Sprintf("%d", report.ID),
		"download_url": downloadURL,
	})
}

func (h InspectionHandler) GetInspectionReportStatus(c echo.Context) error {
	if h.Reports == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	reportID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	report, err := h.Reports.GetReport(c.Request().Context(), reportID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "报告不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load report")
	}

	progress := 0
	switch report.Status {
	case "completed":
		progress = 100
	case "generating":
		progress = 50
	case "failed":
		progress = 0
	}

	downloadURL := ""
	if report.Status == "completed" {
		if filePath := resolveReportFilePath(report); filePath != "" {
			downloadURL = buildReportsDownloadURL(filepath.Base(filePath))
		}
	}

	return inspectionOK(c, map[string]interface{}{
		"status":       report.Status,
		"progress":     progress,
		"download_url": downloadURL,
	})
}

func (h InspectionHandler) GetInspectionReportDownload(c echo.Context) error {
	if h.Reports == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	reportID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	report, err := h.Reports.GetReport(c.Request().Context(), reportID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "报告不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load report")
	}

	filePath := resolveReportFilePath(report)
	if filePath == "" {
		return echo.NewHTTPError(http.StatusNotFound, "报告文件不存在")
	}

	downloadURL := buildReportsDownloadURL(filepath.Base(filePath))
	return inspectionOK(c, map[string]interface{}{
		"download_url": downloadURL,
	})
}
