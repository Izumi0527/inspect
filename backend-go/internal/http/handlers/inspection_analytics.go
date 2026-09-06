package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"go.uber.org/zap"
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
		h.logReportFailure("导出统计报表失败", report.ID, format, err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to export analytics").SetInternal(err)
	}

	filename := filepath.Base(filePath)
	contentType := reportContentType(filepath.Ext(filename))
	c.Response().Header().Set(echo.HeaderContentType, contentType)
	c.Response().Header().Set(echo.HeaderContentDisposition, fmt.Sprintf("attachment; filename=\"%s\"", filename))
	return c.File(filePath)
}

// resolveReportInspectionIDs 把报告生成载荷中的执行标识解析为整批 inspections 行 id。
// 优先读 execution_id（批次 UUID 或执行历史列表返回的代表行数字 id，均可能非数字）；
// 为空时兼容旧调用方，把 task_id 的十进制字符串同样当作执行 id 展开——
// task_id 语义早已是"单次执行"（可能多台设备），必须展开成整批而非单行。
// 未指定任何执行标识时返回 (nil, nil)，报告保持按时间窗/设备过滤的汇总口径。
func (h InspectionHandler) resolveReportInspectionIDs(ctx context.Context, payload map[string]interface{}) ([]int, error) {
	executionID := ""
	if value, ok := readOptionalString(payload, "execution_id", "executionId"); ok && value != nil {
		executionID = *value
	}
	if executionID == "" {
		if taskID, ok := readOptionalInt(payload, "task_id", "taskId"); ok && taskID != nil && *taskID > 0 {
			executionID = fmt.Sprintf("%d", *taskID)
		}
	}
	if executionID == "" {
		return nil, nil
	}
	if h.Service == nil || h.Service.DB() == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	rows, err := h.resolveExecutionBatchRows(ctx, h.Service.DB(), executionID)
	if err != nil {
		return nil, err
	}
	ids := make([]int, 0, len(rows))
	for _, item := range rows {
		ids = append(ids, item.ID)
	}
	return ids, nil
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

	// 评审 H2：执行历史导出的是「整批」报告。execution_id（批次 UUID 或代表行
	// 数字 id）展开为整批行 id 写入 params["inspection_ids"]，报告数据源据此
	// 精确取行；不再依赖前端把执行 id parseInt 成 task_id——批次 UUID 与回填
	// 后的 legacy-<id> 都不是数字，parseInt 落空会让报告退回 24h 时间窗，
	// 与所选批次完全无关。
	inspectionIDs, err := h.resolveReportInspectionIDs(c.Request().Context(), payload)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "执行记录不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to resolve execution for report")
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
	if len(inspectionIDs) > 0 {
		params["inspection_ids"] = inspectionIDs
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
		h.logReportFailure("创建巡检报告记录失败", report.ID, format, err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create report").SetInternal(err)
	}

	filePath, err := reports.GenerateReportFile(c.Request().Context(), h.Reports.DB(), h.ReportOutputDir, report, format)
	if err != nil {
		// 底层错误必须同时落到日志与数据库：历史教训是只写 reports.error_message，
		// 运维侧从日志完全看不到真实原因（如宿主机缺中文字体），排障只能靠查库。
		h.logReportFailure("生成巡检报告失败", report.ID, format, err)
		_, _ = h.Reports.UpdateReport(c.Request().Context(), report.ID, map[string]interface{}{
			"status":        "failed",
			"error_message": err.Error(),
		})
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate report").SetInternal(err)
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

// logReportFailure 统一记录报告生成失败的底层错误。Logger 可能为 nil
// （测试或未装配场景），此时静默跳过——错误仍会经 SetInternal 保留在
// echo 错误链与 reports.error_message 中。
func (h InspectionHandler) logReportFailure(action string, reportID int, format string, err error) {
	if h.Logger == nil {
		return
	}
	h.Logger.Error(action,
		zap.Int("report_id", reportID),
		zap.String("format", format),
		zap.Error(err),
	)
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
