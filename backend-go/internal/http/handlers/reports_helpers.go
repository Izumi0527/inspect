package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
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

func (h ReportsHandler) rerenderReportFormat(c echo.Context, report reports.Report, format string) (reports.Report, string, error) {
	normalized := normalizeReportFormat(format)
	filePath, err := reports.GenerateReportFile(c.Request().Context(), h.Service.DB(), h.OutputDir, report, normalized)
	if err != nil {
		return report, "", err
	}

	paths := decodeJSONMap(report.FilePaths)
	sizes := decodeJSONMap(report.FileSizes)
	paths[normalized] = filePath

	var size int64
	if info, statErr := os.Stat(filePath); statErr == nil {
		size = info.Size()
	}
	sizes[normalized] = size

	formats := ensureReportFormat(decodeJSONStringSlice(report.FileFormats), normalized)
	formatsJSON, err := encodeJSON(formats)
	if err != nil {
		return report, "", err
	}
	pathsJSON, err := encodeJSON(paths)
	if err != nil {
		return report, "", err
	}
	sizesJSON, err := encodeJSON(sizes)
	if err != nil {
		return report, "", err
	}

	updates := map[string]interface{}{
		"status":        "completed",
		"file_formats":  formatsJSON,
		"file_paths":    pathsJSON,
		"file_sizes":    sizesJSON,
		"error_message": nil,
	}
	updated, updateErr := h.Service.UpdateReport(c.Request().Context(), report.ID, updates)
	if updateErr != nil {
		return report, "", updateErr
	}
	return updated, filePath, nil
}

func ensureReportFormat(formats []string, format string) []string {
	normalized := normalizeReportFormat(format)
	result := make([]string, 0, len(formats)+1)
	seen := false
	added := map[string]bool{}
	for _, item := range formats {
		value := normalizeReportFormat(item)
		if value == "" || added[value] {
			continue
		}
		if value == normalized {
			seen = true
		}
		result = append(result, value)
		added[value] = true
	}
	if !seen {
		result = append(result, normalized)
	}
	return result
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
