package handlers

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

type AlertsHandler struct {
	Service AlertsService
	Auth    PermissionService
	WS      *ws.Manager
}

type AlertsService interface {
	DB() *gorm.DB

	ListAlerts(ctx context.Context, filter alerts.ListAlertsFilter) ([]alerts.AlertWithDevice, int64, error)
	GetAlert(ctx context.Context, alertID int) (alerts.AlertWithDevice, error)
	GetRecentAlerts(ctx context.Context, limit int) ([]alerts.AlertWithDevice, error)
	GetAlertStatistics(ctx context.Context) (alerts.AlertStatistics, error)
	ListAlertOperations(ctx context.Context, alertID int, limit int) ([]alerts.AlertOperationHistory, error)

	AcknowledgeAlert(ctx context.Context, alertID int, operator alerts.Operator, note *string, assignee *string) error
	ResolveAlert(ctx context.Context, alertID int, operator alerts.Operator, resolution *string, note *string) error
	ReactivateAlert(ctx context.Context, alertID int, operator alerts.Operator, reason *string) error
	DeleteAlert(ctx context.Context, alertID int) error
	AddAlertComment(ctx context.Context, alertID int, operator alerts.Operator, comment *string) error
	AssignAlert(ctx context.Context, alertID int, operator alerts.Operator, assignee *string) error

	ListRules(ctx context.Context, filter alerts.ListRulesFilter) ([]alerts.AlertRule, error)
	GetRule(ctx context.Context, ruleID int) (alerts.AlertRule, error)
	CreateRule(ctx context.Context, rule *alerts.AlertRule) error
	UpdateRule(ctx context.Context, ruleID int, updates map[string]interface{}) (alerts.AlertRule, error)
	DeleteRule(ctx context.Context, ruleID int) error
}

func (h AlertsHandler) Register(group *echo.Group) {
	group.GET("/alerts", h.ListAlerts)
	group.GET("/alerts/", h.ListAlerts)
	group.GET("/alerts/statistics", h.GetAlertStatistics)
	group.GET("/alerts/recent", h.GetRecentAlerts)
	group.GET("/alerts/:alert_id", h.GetAlert)
	group.GET("/alerts/:alert_id/operations", h.ListAlertOperations)
	group.POST("/alerts/:alert_id/acknowledge", h.AcknowledgeAlert)
	group.POST("/alerts/:alert_id/resolve", h.ResolveAlert)
	group.POST("/alerts/:alert_id/reactivate", h.ReactivateAlert)
	group.POST("/alerts/:alert_id/comment", h.AddComment)
	group.DELETE("/alerts/:alert_id", h.DeleteAlert)
	group.POST("/alerts/bulk", h.BulkAlertAction)
	group.GET("/alerts/export", h.ExportAlerts)

	group.GET("/alerts/rules", h.ListRules)
	group.GET("/alerts/rules/:rule_id", h.GetRule)
	group.POST("/alerts/rules", h.CreateRule)
	group.PUT("/alerts/rules/:rule_id", h.UpdateRule)
	group.DELETE("/alerts/rules/:rule_id", h.DeleteRule)
}

func (h AlertsHandler) ListAlerts(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "alert service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "alerts:read"); err != nil {
		return err
	}

	page, pageSize := parsePageParams(c)

	params := c.QueryParams()
	statusValues := parseQueryValues(append(params["status"], params["status[]"]...))
	severityValues := parseQueryValues(append(params["severity"], params["severity[]"]...))
	categoryValues := parseQueryValues(append(params["category"], params["category[]"]...))
	deviceIDs := parseIntList(append(append(params["device_ids"], params["device_ids[]"]...), params["device_id"]...))

	startDateRaw := c.QueryParam("start_date")
	startDate, _ := parseTimeOptional(startDateRaw)
	if startDate == nil {
		startDate, _ = parseTimeOptional(c.QueryParam("start_time"))
	}
	endDateRaw := c.QueryParam("end_date")
	endDate, _ := parseTimeOptional(endDateRaw)
	if endDate == nil {
		endDate, _ = parseTimeOptional(c.QueryParam("end_time"))
	}
	// 兼容 date-only：end_date=YYYY-MM-DD 视为“当天结束”，避免把当天数据排除在外。
	if endDate != nil && isDateOnly(endDateRaw) {
		adjusted := endDate.UTC().Add(24*time.Hour - time.Nanosecond)
		endDate = &adjusted
	}

	filter := alerts.ListAlertsFilter{
		Page:       page,
		PageSize:   pageSize,
		Statuses:   statusValues,
		Severities: severityValues,
		DeviceIDs:  deviceIDs,
		Categories: categoryValues,
		StartDate:  startDate,
		EndDate:    endDate,
		Search:     strings.TrimSpace(c.QueryParam("search")),
		SortBy:     strings.TrimSpace(c.QueryParam("sort_by")),
		SortOrder:  strings.TrimSpace(c.QueryParam("sort_order")),
	}

	rows, total, err := h.Service.ListAlerts(c.Request().Context(), filter)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load alerts")
	}

	items := make([]map[string]interface{}, 0, len(rows))
	for _, row := range rows {
		items = append(items, buildAlertResponse(row))
	}

	pages := 0
	if pageSize > 0 {
		pages = int((total + int64(pageSize) - 1) / int64(pageSize))
	}

	resp := map[string]interface{}{
		"alerts":       items,
		"total":        total,
		"pages":        pages,
		"page":         page,
		"page_size":    pageSize,
		"current_page": page,
		"has_next":     page < pages,
		"has_prev":     page > 1,
	}

	if strings.TrimSpace(c.QueryParam("limit")) != "" {
		resp["recent"] = buildRecentAlerts(rows, 10)
	}

	return c.JSON(http.StatusOK, resp)
}

func (h AlertsHandler) GetAlert(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "alert service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "alerts:read"); err != nil {
		return err
	}

	alertID, err := parseIDParam(c, "alert_id")
	if err != nil {
		return err
	}

	row, err := h.Service.GetAlert(c.Request().Context(), alertID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "alert not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load alert")
	}

	return c.JSON(http.StatusOK, buildAlertResponse(row))
}

func (h AlertsHandler) ListAlertOperations(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "alert service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "alerts:read"); err != nil {
		return err
	}

	alertID, err := parseIDParam(c, "alert_id")
	if err != nil {
		return err
	}

	limit := parseIntDefault(c.QueryParam("limit"), 50)
	rows, err := h.Service.ListAlertOperations(c.Request().Context(), alertID, limit)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "alert not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load alert operations")
	}

	items := make([]map[string]interface{}, 0, len(rows))
	for _, row := range rows {
		metadata := map[string]interface{}{}
		if len(row.Metadata) > 0 {
			_ = json.Unmarshal(row.Metadata, &metadata)
		}

		items = append(items, map[string]interface{}{
			"id":              strconv.Itoa(row.ID),
			"alert_id":        strconv.Itoa(row.AlertID),
			"operation_type":  strings.TrimSpace(row.OperationType),
			"operator_id":     strings.TrimSpace(row.OperatorID),
			"operator_name":   strings.TrimSpace(row.OperatorName),
			"operation_time":  row.OperationTime.UTC().Format(time.RFC3339),
			"note":            row.Note,
			"previous_status": row.PreviousStatus,
			"new_status":      row.NewStatus,
			"metadata":        metadata,
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"items": items,
		"total": len(items),
	})
}

func (h AlertsHandler) GetRecentAlerts(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "alert service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "alerts:read"); err != nil {
		return err
	}

	limit := parseIntDefault(c.QueryParam("limit"), 5)
	rows, err := h.Service.GetRecentAlerts(c.Request().Context(), limit)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load recent alerts")
	}

	response := make([]map[string]interface{}, 0, len(rows))
	for _, row := range rows {
		timestamp := resolveAlertTimestamp(row).Format(time.RFC3339)
		response = append(response, map[string]interface{}{
			"id":        strconv.Itoa(row.ID),
			"title":     row.Title,
			"timestamp": timestamp,
			"severity":  alerts.NormalizeSeverity(row.Severity),
			"device":    resolveAlertDevice(row),
		})
	}

	return c.JSON(http.StatusOK, response)
}

func (h AlertsHandler) GetAlertStatistics(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "alert service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "alerts:read"); err != nil {
		return err
	}

	stats, err := h.Service.GetAlertStatistics(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load alert statistics")
	}

	recentRows, _ := h.Service.GetRecentAlerts(c.Request().Context(), 5)
	recent := buildRecentAlerts(recentRows, 5)

	recent24h := 0
	todayCount := 0
	yesterdayCount := 0
	changePercent := float64(0)
	if db := h.Service.DB(); db != nil {
		now := time.Now().UTC()
		last24h := now.Add(-24 * time.Hour)
		var count int64
		if err := db.WithContext(c.Request().Context()).
			Table("alerts").
			Joins("JOIN devices ON devices.id = alerts.device_id").
			Where("COALESCE(alerts.first_occurred, alerts.created_at) >= ?", last24h).
			Count(&count).Error; err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to load recent alerts stats")
		}
		recent24h = int(count)

		// 趋势：按自然日（UTC）统计今天/昨天新增告警数，并计算变化百分比。
		todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
		yesterdayStart := todayStart.Add(-24 * time.Hour)

		var today int64
		if err := db.WithContext(c.Request().Context()).
			Table("alerts").
			Joins("JOIN devices ON devices.id = alerts.device_id").
			Where("COALESCE(alerts.first_occurred, alerts.created_at) >= ? AND COALESCE(alerts.first_occurred, alerts.created_at) < ?", todayStart, todayStart.Add(24*time.Hour)).
			Count(&today).Error; err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to load today alerts stats")
		}
		var yesterday int64
		if err := db.WithContext(c.Request().Context()).
			Table("alerts").
			Joins("JOIN devices ON devices.id = alerts.device_id").
			Where("COALESCE(alerts.first_occurred, alerts.created_at) >= ? AND COALESCE(alerts.first_occurred, alerts.created_at) < ?", yesterdayStart, todayStart).
			Count(&yesterday).Error; err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to load yesterday alerts stats")
		}

		todayCount = int(today)
		yesterdayCount = int(yesterday)
		if yesterdayCount == 0 {
			if todayCount > 0 {
				changePercent = 100
			}
		} else {
			changePercent = (float64(todayCount-yesterdayCount) / float64(yesterdayCount)) * 100
		}
	}

	trends := map[string]interface{}{
		// 兼容字段：保留旧的 up/down/stable 结构（目前后端未实现，默认 0）。
		"up":     0,
		"down":   0,
		"stable": 0,
		// 新字段：对齐前端告警中心统计卡的趋势展示。
		"today":     todayCount,
		"yesterday": yesterdayCount,
		"change":    changePercent,
	}

	response := map[string]interface{}{
		"total":               stats.Total,
		"critical":            stats.Critical,
		"warning":             stats.Warning,
		"info":                stats.Info,
		"active":              stats.Active,
		"acknowledged":        stats.Acknowledged,
		"resolved":            stats.Resolved,
		"by_category":         stats.ByCategory,
		"by_device":           stats.ByDevice,
		"trends":              trends,
		"recent":              recent,
		"total_alerts":        stats.Total,
		"active_alerts":       stats.Active,
		"acknowledged_alerts": stats.Acknowledged,
		"resolved_alerts":     stats.Resolved,
		"by_severity": map[string]int{
			"critical": stats.Critical,
			"warning":  stats.Warning,
			"info":     stats.Info,
		},
		"recent_24h": recent24h,
	}

	return c.JSON(http.StatusOK, response)
}
func (h AlertsHandler) AcknowledgeAlert(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "alert service not configured")
	}
	user, err := requirePermission(c, h.Auth, "alerts:update")
	if err != nil {
		return err
	}

	alertID, err := parseIDParam(c, "alert_id")
	if err != nil {
		return err
	}

	payload := map[string]interface{}{}
	_ = c.Bind(&payload)

	assignee := readStringPayload(payload, "assignee")
	note := readStringPayload(payload, "note")
	if note == nil {
		note = readStringPayload(payload, "notes")
	}
	if note == nil {
		note = readStringPayload(payload, "comment")
	}

	operator := buildOperator(user)
	if err := h.Service.AcknowledgeAlert(c.Request().Context(), alertID, operator, note, assignee); err != nil {
		if errors.Is(err, alerts.ErrInvalidAlertStatus) {
			return echo.NewHTTPError(http.StatusBadRequest, "alert status not allowed")
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "alert not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to acknowledge alert")
	}
	h.broadcastAlertStatus(alertID, "acknowledged")

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

func (h AlertsHandler) ResolveAlert(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "alert service not configured")
	}
	user, err := requirePermission(c, h.Auth, "alerts:update")
	if err != nil {
		return err
	}

	alertID, err := parseIDParam(c, "alert_id")
	if err != nil {
		return err
	}

	payload := map[string]interface{}{}
	_ = c.Bind(&payload)

	resolution := readStringPayload(payload, "resolution")
	note := readStringPayload(payload, "note")
	if note == nil {
		note = readStringPayload(payload, "comment")
	}

	operator := buildOperator(user)
	if err := h.Service.ResolveAlert(c.Request().Context(), alertID, operator, resolution, note); err != nil {
		if errors.Is(err, alerts.ErrInvalidAlertStatus) {
			return echo.NewHTTPError(http.StatusBadRequest, "alert status not allowed")
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "alert not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to resolve alert")
	}
	h.broadcastAlertStatus(alertID, "resolved")

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

func (h AlertsHandler) ReactivateAlert(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "alert service not configured")
	}
	user, err := requirePermission(c, h.Auth, "alerts:update")
	if err != nil {
		return err
	}

	alertID, err := parseIDParam(c, "alert_id")
	if err != nil {
		return err
	}

	payload := map[string]interface{}{}
	_ = c.Bind(&payload)

	reason := readStringPayload(payload, "reason")
	if reason == nil {
		reason = readStringPayload(payload, "note")
	}

	operator := buildOperator(user)
	if err := h.Service.ReactivateAlert(c.Request().Context(), alertID, operator, reason); err != nil {
		if errors.Is(err, alerts.ErrInvalidAlertStatus) {
			return echo.NewHTTPError(http.StatusBadRequest, "alert status not allowed")
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "alert not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to reactivate alert")
	}
	h.broadcastAlertStatus(alertID, "active")

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

func (h AlertsHandler) DeleteAlert(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "alert service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "alerts:delete"); err != nil {
		return err
	}

	alertID, err := parseIDParam(c, "alert_id")
	if err != nil {
		return err
	}

	if err := h.Service.DeleteAlert(c.Request().Context(), alertID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "alert not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete alert")
	}
	h.broadcastAlertStatus(alertID, "resolved")

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

func (h AlertsHandler) AddComment(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "alert service not configured")
	}
	user, err := requirePermission(c, h.Auth, "alerts:update")
	if err != nil {
		return err
	}

	alertID, err := parseIDParam(c, "alert_id")
	if err != nil {
		return err
	}

	payload := map[string]interface{}{}
	_ = c.Bind(&payload)

	comment := readStringPayload(payload, "comment")
	if comment == nil {
		comment = readStringPayload(payload, "note")
	}
	if comment == nil || strings.TrimSpace(*comment) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "comment is required")
	}

	operator := buildOperator(user)
	if err := h.Service.AddAlertComment(c.Request().Context(), alertID, operator, comment); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "alert not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to add comment")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

func (h AlertsHandler) ExportAlerts(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "alert service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "alerts:read"); err != nil {
		return err
	}

	params := c.QueryParams()
	deviceIDs := parseIntList(append(append(params["device_ids"], params["device_ids[]"]...), params["device_id"]...))
	categoryValues := parseQueryValues(append(params["category"], params["category[]"]...))
	startDateRaw := c.QueryParam("start_date")
	startDate, _ := parseTimeOptional(startDateRaw)
	if startDate == nil {
		startDate, _ = parseTimeOptional(c.QueryParam("start_time"))
	}
	endDateRaw := c.QueryParam("end_date")
	endDate, _ := parseTimeOptional(endDateRaw)
	if endDate == nil {
		endDate, _ = parseTimeOptional(c.QueryParam("end_time"))
	}
	// 兼容 date-only：end_date=YYYY-MM-DD 视为“当天结束”，避免把当天数据排除在外。
	if endDate != nil && isDateOnly(endDateRaw) {
		adjusted := endDate.UTC().Add(24*time.Hour - time.Nanosecond)
		endDate = &adjusted
	}

	sortBy := strings.TrimSpace(c.QueryParam("sort_by"))
	if sortBy == "" {
		sortBy = "last_occurred"
	}
	sortOrder := strings.TrimSpace(c.QueryParam("sort_order"))
	if sortOrder == "" {
		sortOrder = "desc"
	}

	filter := alerts.ListAlertsFilter{
		Statuses:   parseQueryValues(append(params["status"], params["status[]"]...)),
		Severities: parseQueryValues(append(params["severity"], params["severity[]"]...)),
		Categories: categoryValues,
		DeviceIDs:  deviceIDs,
		StartDate:  startDate,
		EndDate:    endDate,
		Search:     strings.TrimSpace(c.QueryParam("search")),
		SortBy:     sortBy,
		SortOrder:  sortOrder,
	}

	rows, err := CollectAllAlertsForExport(
		filter,
		func(pageFilter alerts.ListAlertsFilter) ([]alerts.AlertWithDevice, int64, error) {
			return h.Service.ListAlerts(c.Request().Context(), pageFilter)
		},
		200,
	)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to export alerts")
	}

	csvData, err := BuildAlertsCSV(rows)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to build export file")
	}

	c.Response().Header().Set("Content-Type", "text/csv; charset=utf-8")
	c.Response().Header().Set("Content-Disposition", "attachment; filename=alerts_export.csv")
	// BOM for Excel UTF-8 compatibility
	return c.Blob(http.StatusOK, "text/csv; charset=utf-8", append([]byte("\xEF\xBB\xBF"), csvData...))
}

type AlertsExportFetcher func(filter alerts.ListAlertsFilter) ([]alerts.AlertWithDevice, int64, error)

// CollectAllAlertsForExport 分页聚合导出数据，直到达到 total。
func CollectAllAlertsForExport(baseFilter alerts.ListAlertsFilter, fetch AlertsExportFetcher, pageSize int) ([]alerts.AlertWithDevice, error) {
	if fetch == nil {
		return nil, fmt.Errorf("fetcher is nil")
	}
	if pageSize <= 0 {
		pageSize = 200
	}

	allRows := make([]alerts.AlertWithDevice, 0)
	page := 1

	for {
		pageFilter := baseFilter
		pageFilter.Page = page
		pageFilter.PageSize = pageSize

		rows, total, err := fetch(pageFilter)
		if err != nil {
			return nil, err
		}
		if len(rows) == 0 {
			break
		}

		allRows = append(allRows, rows...)
		if total > 0 && int64(len(allRows)) >= total {
			break
		}
		page++
	}

	return allRows, nil
}

// BuildAlertsCSV 使用标准 CSV Writer 生成导出内容，自动处理转义与引用。
func BuildAlertsCSV(rows []alerts.AlertWithDevice) ([]byte, error) {
	buffer := bytes.NewBuffer(nil)
	writer := csv.NewWriter(buffer)

	if err := writer.Write([]string{"ID", "标题", "设备", "严重级别", "状态", "分类", "时间", "描述"}); err != nil {
		return nil, err
	}

	sanitizeCell := func(value string) string {
		trimmed := strings.TrimLeft(value, " \t\r\n")
		if trimmed == "" {
			return value
		}
		switch trimmed[0] {
		case '=', '+', '-', '@':
			// 防止 CSV 被 Excel 打开时触发公式注入：对可疑前缀统一前置单引号。
			return "'" + value
		default:
			return value
		}
	}

	for _, row := range rows {
		record := []string{
			strconv.Itoa(row.ID),
			sanitizeCell(row.Title),
			sanitizeCell(resolveAlertDevice(row)),
			sanitizeCell(alerts.NormalizeSeverity(row.Severity)),
			sanitizeCell(alerts.NormalizeStatus(row.Status)),
			sanitizeCell(row.Category),
			sanitizeCell(resolveAlertTimestamp(row).Format("2006-01-02 15:04:05")),
			sanitizeCell(row.Message),
		}
		if err := writer.Write(record); err != nil {
			return nil, err
		}
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}

	return buffer.Bytes(), nil
}

func (h AlertsHandler) BulkAlertAction(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "alert service not configured")
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	action := strings.ToLower(strings.TrimSpace(readStringValue(payload["action"])))
	if action == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "action is required")
	}

	permission := "alerts:update"
	if action == "delete" {
		permission = "alerts:delete"
	}
	user, err := requirePermission(c, h.Auth, permission)
	if err != nil {
		return err
	}

	alertIDs := parseIntListFromPayload(payload["alert_ids"])
	if len(alertIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "alert_ids is required")
	}

	assignee := readStringPayload(payload, "assignee")
	comment := readStringPayload(payload, "comment")
	note := readStringPayload(payload, "note")
	if note == nil {
		note = comment
	}

	operator := buildOperator(user)
	processed := 0
	failed := make([]map[string]interface{}, 0)

	for _, id := range alertIDs {
		var opErr error
		broadcastStatus := ""
		switch action {
		case "acknowledge":
			opErr = h.Service.AcknowledgeAlert(c.Request().Context(), id, operator, note, assignee)
			broadcastStatus = "acknowledged"
		case "resolve":
			opErr = h.Service.ResolveAlert(c.Request().Context(), id, operator, note, note)
			broadcastStatus = "resolved"
		case "delete":
			opErr = h.Service.DeleteAlert(c.Request().Context(), id)
			broadcastStatus = "resolved"
		case "assign":
			opErr = h.Service.AssignAlert(c.Request().Context(), id, operator, assignee)
		case "comment":
			opErr = h.Service.AddAlertComment(c.Request().Context(), id, operator, note)
		default:
			return echo.NewHTTPError(http.StatusBadRequest, "unsupported action")
		}

		if opErr != nil {
			failed = append(failed, map[string]interface{}{
				"alert_id": id,
				"error":    opErr.Error(),
			})
			continue
		}
		if broadcastStatus != "" {
			h.broadcastAlertStatus(id, broadcastStatus)
		}
		processed++
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success":   len(failed) == 0,
		"processed": processed,
		"failed":    len(failed),
		"errors":    failed,
	})
}
func (h AlertsHandler) ListRules(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "alert service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "alerts:read"); err != nil {
		return err
	}

	enabled := parseOptionalBool(c.QueryParam("enabled"))
	severity := strings.TrimSpace(c.QueryParam("severity"))
	category := strings.TrimSpace(c.QueryParam("category"))

	filter := alerts.ListRulesFilter{}
	if enabled != nil {
		filter.IsActive = enabled
	}
	if severity != "" {
		filter.Severity = &severity
	}
	if category != "" {
		filter.Category = &category
	}

	rows, err := h.Service.ListRules(c.Request().Context(), filter)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load alert rules")
	}

	ruleIDs := make([]int, 0, len(rows))
	for _, row := range rows {
		ruleIDs = append(ruleIDs, row.ID)
	}
	triggerStats, err := loadAlertRuleTriggerStats(c.Request().Context(), h.Service.DB(), ruleIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load alert rule stats")
	}

	response := make([]map[string]interface{}, 0, len(rows))
	for _, row := range rows {
		payload := buildAlertRuleResponse(row)
		applyRuleTriggerStats(payload, triggerStats[row.ID])
		response = append(response, payload)
	}

	return c.JSON(http.StatusOK, response)
}

func (h AlertsHandler) GetRule(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "alert service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "alerts:read"); err != nil {
		return err
	}

	ruleID, err := parseIDParam(c, "rule_id")
	if err != nil {
		return err
	}

	row, err := h.Service.GetRule(c.Request().Context(), ruleID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "alert rule not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load alert rule")
	}

	triggerStats, err := loadAlertRuleTriggerStats(c.Request().Context(), h.Service.DB(), []int{row.ID})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load alert rule stats")
	}

	payload := buildAlertRuleResponse(row)
	applyRuleTriggerStats(payload, triggerStats[row.ID])
	return c.JSON(http.StatusOK, payload)
}

func (h AlertsHandler) CreateRule(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "alert service not configured")
	}
	user, err := requirePermission(c, h.Auth, "alerts:create")
	if err != nil {
		return err
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	rule, err := buildAlertRuleCreate(payload, user)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	if err := h.Service.CreateRule(c.Request().Context(), &rule); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create alert rule")
	}

	return c.JSON(http.StatusOK, buildAlertRuleResponse(rule))
}

func (h AlertsHandler) UpdateRule(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "alert service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "alerts:update"); err != nil {
		return err
	}

	ruleID, err := parseIDParam(c, "rule_id")
	if err != nil {
		return err
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	updates, err := buildAlertRuleUpdates(payload)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if len(updates) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "no updates provided")
	}

	rule, err := h.Service.UpdateRule(c.Request().Context(), ruleID, updates)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "alert rule not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to update alert rule")
	}

	return c.JSON(http.StatusOK, buildAlertRuleResponse(rule))
}

func (h AlertsHandler) DeleteRule(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "alert service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "alerts:delete"); err != nil {
		return err
	}

	ruleID, err := parseIDParam(c, "rule_id")
	if err != nil {
		return err
	}

	if err := h.Service.DeleteRule(c.Request().Context(), ruleID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "alert rule not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete alert rule")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
	})
}
func buildAlertResponse(row alerts.AlertWithDevice) map[string]interface{} {
	timestamp := resolveAlertTimestamp(row)
	triggeredAt := resolveAlertTriggeredAt(row)
	deviceName := resolveAlertDevice(row)
	deviceNameValue := optionalStringValue(row.DeviceName)
	deviceIPValue := optionalStringValue(row.DeviceIP)
	ruleID := resolveRuleID(row.RuleID)
	ruleName := resolveRuleName(row.RuleName)
	metadata := buildAlertMetadata(row)

	response := map[string]interface{}{
		"id":              strconv.Itoa(row.ID),
		"rule_id":         ruleID,
		"rule_name":       ruleName,
		"title":           row.Title,
		"message":         row.Message,
		"description":     row.Message,
		"details":         metadata,
		"device":          deviceName,
		"device_id":       row.DeviceID,
		"device_name":     deviceNameValue,
		"device_ip":       deviceIPValue,
		"severity":        alerts.NormalizeSeverity(row.Severity),
		"status":          alerts.NormalizeStatus(row.Status),
		"timestamp":       timestamp.Format(time.RFC3339),
		"triggered_at":    triggeredAt,
		"category":        normalizeCategory(row.Category),
		"resolution":      row.ResolutionNote,
		"acknowledged_at": row.AcknowledgedAt,
		"resolved_at":     row.ResolvedAt,
		"acknowledged_by": row.AcknowledgedBy,
		"resolved_by":     row.ResolvedBy,
		"created_at":      row.CreatedAt,
		"updated_at":      row.UpdatedAt,
		"notes":           []string{},
		"tags":            []string{},
	}

	if assignee := resolveAlertAssignee(row); assignee != "" {
		response["assignee"] = assignee
	}

	if len(metadata) > 0 {
		response["metadata"] = metadata
	}

	return response
}

func buildRecentAlerts(rows []alerts.AlertWithDevice, limit int) []map[string]interface{} {
	if limit <= 0 {
		limit = 5
	}
	response := make([]map[string]interface{}, 0, len(rows))
	for _, row := range rows {
		if len(response) >= limit {
			break
		}
		title := strings.TrimSpace(row.Title)
		if title == "" {
			title = strings.TrimSpace(row.Message)
		}
		response = append(response, map[string]interface{}{
			"id":        strconv.Itoa(row.ID),
			"title":     title,
			"timestamp": resolveAlertTimestamp(row).Format(time.RFC3339),
			"severity":  alerts.NormalizeSeverity(row.Severity),
			"device":    resolveAlertDevice(row),
		})
	}
	return response
}

func resolveAlertTimestamp(row alerts.AlertWithDevice) time.Time {
	if row.LastOccurred != nil && !row.LastOccurred.IsZero() {
		return row.LastOccurred.UTC()
	}
	if row.FirstOccurred != nil && !row.FirstOccurred.IsZero() {
		return row.FirstOccurred.UTC()
	}
	if row.CreatedAt != nil && !row.CreatedAt.IsZero() {
		return row.CreatedAt.UTC()
	}
	return time.Now().UTC()
}

func resolveAlertTriggeredAt(row alerts.AlertWithDevice) time.Time {
	if row.FirstOccurred != nil && !row.FirstOccurred.IsZero() {
		return row.FirstOccurred.UTC()
	}
	if row.CreatedAt != nil && !row.CreatedAt.IsZero() {
		return row.CreatedAt.UTC()
	}
	return resolveAlertTimestamp(row)
}

func resolveAlertDevice(row alerts.AlertWithDevice) string {
	if row.DeviceName != nil && strings.TrimSpace(*row.DeviceName) != "" {
		return strings.TrimSpace(*row.DeviceName)
	}
	if row.DeviceIP != nil && strings.TrimSpace(*row.DeviceIP) != "" {
		return strings.TrimSpace(*row.DeviceIP)
	}
	if row.DeviceID > 0 {
		return "设备#" + strconv.Itoa(row.DeviceID)
	}
	return "未知设备"
}

func resolveAlertAssignee(row alerts.AlertWithDevice) string {
	if row.AcknowledgedBy != nil && strings.TrimSpace(*row.AcknowledgedBy) != "" {
		return strings.TrimSpace(*row.AcknowledgedBy)
	}
	if row.ResolvedBy != nil && strings.TrimSpace(*row.ResolvedBy) != "" {
		return strings.TrimSpace(*row.ResolvedBy)
	}
	return ""
}

type alertRuleTriggerStats struct {
	RuleID        int        `gorm:"column:rule_id"`
	TriggerCount  int        `gorm:"column:trigger_count"`
	LastTriggered *time.Time `gorm:"column:last_triggered"`
}

func loadAlertRuleTriggerStats(ctx context.Context, db *gorm.DB, ruleIDs []int) (map[int]alertRuleTriggerStats, error) {
	result := map[int]alertRuleTriggerStats{}
	if db == nil || len(ruleIDs) == 0 {
		return result, nil
	}

	rows := make([]alertRuleTriggerStats, 0)
	if err := db.WithContext(ctx).
		Table("alerts").
		Select("rule_id, COUNT(*) AS trigger_count, MAX(COALESCE(last_occurred, first_occurred, created_at)) AS last_triggered").
		Where("rule_id IN ?", ruleIDs).
		Group("rule_id").
		Scan(&rows).Error; err != nil {
		return result, err
	}

	for _, row := range rows {
		result[row.RuleID] = row
	}
	return result, nil
}

func applyRuleTriggerStats(payload map[string]interface{}, stats alertRuleTriggerStats) {
	if payload == nil {
		return
	}
	payload["trigger_count"] = stats.TriggerCount
	payload["last_triggered"] = stats.LastTriggered
}

func optionalStringValue(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func resolveRuleID(ruleID *int) string {
	if ruleID == nil || *ruleID <= 0 {
		return ""
	}
	return strconv.Itoa(*ruleID)
}

func resolveRuleName(ruleName *string) string {
	if ruleName == nil {
		return ""
	}
	return strings.TrimSpace(*ruleName)
}

func buildAlertMetadata(row alerts.AlertWithDevice) map[string]interface{} {
	meta := map[string]interface{}{}

	if row.RuleID != nil {
		meta["rule_id"] = *row.RuleID
	}

	if row.MetricName != nil && strings.TrimSpace(*row.MetricName) != "" {
		meta["metric_name"] = strings.TrimSpace(*row.MetricName)
	}
	if row.CurrentValue != nil {
		meta["current_value"] = *row.CurrentValue
	}
	if row.ThresholdValue != nil {
		meta["threshold_value"] = *row.ThresholdValue
	}
	if row.OccurrenceCount != nil {
		meta["occurrence_count"] = *row.OccurrenceCount
	}
	if row.NotificationCount != nil {
		meta["notification_count"] = *row.NotificationCount
	}
	if row.EscalationLevel != nil {
		meta["escalation_level"] = *row.EscalationLevel
	}
	if row.ReactivatedAt != nil {
		meta["reactivated_at"] = row.ReactivatedAt
	}
	if row.ReactivationReason != nil && strings.TrimSpace(*row.ReactivationReason) != "" {
		meta["reactivation_reason"] = strings.TrimSpace(*row.ReactivationReason)
	}
	if row.DeviceIP != nil && strings.TrimSpace(*row.DeviceIP) != "" {
		meta["device_ip"] = strings.TrimSpace(*row.DeviceIP)
	}

	return meta
}

func normalizeCategory(category string) string {
	value := strings.ToLower(strings.TrimSpace(category))
	if value == "" {
		return "other"
	}
	return value
}

func buildOperator(user *auth.UserRecord) alerts.Operator {
	if user == nil {
		return alerts.Operator{ID: "system", Name: "系统"}
	}
	name := user.Username
	if user.FullName != nil && strings.TrimSpace(*user.FullName) != "" {
		name = strings.TrimSpace(*user.FullName)
	}
	return alerts.Operator{ID: user.ID, Name: name}
}

func (h AlertsHandler) broadcastAlertStatus(alertID int, status string) {
	if h.WS == nil || alertID <= 0 {
		return
	}
	normalizedStatus := strings.ToLower(strings.TrimSpace(status))
	if normalizedStatus == "" {
		return
	}
	h.WS.SendToRoom("alerts", ws.Message{
		Type: ws.MessageAlert,
		Data: map[string]interface{}{
			"id":        strconv.Itoa(alertID),
			"status":    normalizedStatus,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		},
	})
}

func parseQueryValues(values []string) []string {
	result := make([]string, 0)
	for _, value := range values {
		for _, item := range strings.Split(value, ",") {
			item = strings.TrimSpace(item)
			if item == "" {
				continue
			}
			result = append(result, item)
		}
	}
	return result
}

func isDateOnly(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return false
	}
	_, err := time.Parse("2006-01-02", trimmed)
	return err == nil
}

func parseIntList(values []string) []int {
	result := make([]int, 0)
	for _, raw := range values {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			result = append(result, parsed)
		}
	}
	return result
}

func parseIntListFromPayload(value interface{}) []int {
	result := make([]int, 0)
	switch v := value.(type) {
	case []interface{}:
		for _, item := range v {
			if parsed, ok := toInt(item); ok && parsed > 0 {
				result = append(result, parsed)
			}
		}
	case []int:
		for _, item := range v {
			if item > 0 {
				result = append(result, item)
			}
		}
	case []string:
		result = append(result, parseIntList(v)...)
	}
	return result
}

func readStringPayload(payload map[string]interface{}, key string) *string {
	value := readStringValue(payload[key])
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return &value
}

func readStringValue(value interface{}) string {
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case []byte:
		return strings.TrimSpace(string(v))
	default:
		return ""
	}
}

func parseOptionalBool(raw string) *bool {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return nil
	}
	return &parsed
}

func buildAlertRuleResponse(rule alerts.AlertRule) map[string]interface{} {
	deviceTypes := decodeJSONStringSlice(rule.DeviceTypes)
	deviceGroups := decodeJSONList(rule.DeviceGroups)
	specificDevices := decodeJSONList(rule.SpecificDevices)
	emailRecipients := decodeJSONStringSlice(rule.EmailRecipients)

	enabled := true
	if rule.IsActive != nil {
		enabled = *rule.IsActive
	}
	notifyEmail := false
	if rule.EmailEnabled != nil {
		notifyEmail = *rule.EmailEnabled
	}
	notifyWebsocket := false
	if rule.NotificationEnabled != nil {
		notifyWebsocket = *rule.NotificationEnabled
	}
	cooldownMinutes := 30
	if rule.CooldownMinutes != nil {
		cooldownMinutes = *rule.CooldownMinutes
	}

	return map[string]interface{}{
		"id":                   strconv.Itoa(rule.ID),
		"name":                 rule.Name,
		"description":          rule.Description,
		"enabled":              enabled,
		"is_active":            enabled,
		"severity":             rule.Severity,
		"category":             rule.Category,
		"metric_name":          rule.MetricName,
		"operator":             rule.Operator,
		"condition":            operatorToCondition(rule.Operator),
		"threshold":            rule.ThresholdValue,
		"threshold_value":      rule.ThresholdValue,
		"duration":             rule.Duration,
		"device_types":         deviceTypes,
		"device_groups":        deviceGroups,
		"specific_devices":     specificDevices,
		"auto_resolve":         rule.AutoResolve,
		"notification_enabled": rule.NotificationEnabled,
		"notify_email":         notifyEmail,
		"notify_websocket":     notifyWebsocket,
		"email_enabled":        rule.EmailEnabled,
		"webhook_enabled":      rule.WebhookEnabled,
		"webhook_url":          rule.WebhookURL,
		"email_recipients":     emailRecipients,
		"cooldown_minutes":     cooldownMinutes,
		"created_by":           rule.CreatedBy,
		"created_at":           rule.CreatedAt,
		"updated_at":           rule.UpdatedAt,
		"last_triggered":       nil,
		"trigger_count":        0,
	}
}
func buildAlertRuleCreate(payload map[string]interface{}, user *auth.UserRecord) (alerts.AlertRule, error) {
	name := readStringValue(payload["name"])
	if name == "" {
		return alerts.AlertRule{}, errors.New("name is required")
	}
	metricName := readStringValue(payload["metric_name"])
	if metricName == "" {
		return alerts.AlertRule{}, errors.New("metric_name is required")
	}

	category := readStringValue(payload["category"])
	if category == "" {
		category = "other"
	}
	severity := readStringValue(payload["severity"])
	if severity == "" {
		severity = "warning"
	}

	operator := normalizeRuleOperator(readStringValue(payload["operator"]), readStringValue(payload["condition"]))
	if operator == "" {
		operator = ">"
	}

	thresholdValue := readFloatValue(payload["threshold_value"])
	if thresholdValue == 0 {
		thresholdValue = readFloatValue(payload["threshold"])
	}

	duration := int(readFloatValue(payload["duration"]))
	if duration <= 0 {
		duration = 300
	}

	isActive := true
	if value, ok := payload["is_active"].(bool); ok {
		isActive = value
	} else if value, ok := payload["enabled"].(bool); ok {
		isActive = value
	}

	autoResolve := true
	if value, ok := payload["auto_resolve"].(bool); ok {
		autoResolve = value
	}

	notificationEnabled := true
	if value, ok := payload["notification_enabled"].(bool); ok {
		notificationEnabled = value
	} else if value, ok := payload["notify_websocket"].(bool); ok {
		notificationEnabled = value
	}

	emailEnabled := true
	if value, ok := payload["email_enabled"].(bool); ok {
		emailEnabled = value
	} else if value, ok := payload["notify_email"].(bool); ok {
		emailEnabled = value
	}

	webhookEnabled := false
	if value, ok := payload["webhook_enabled"].(bool); ok {
		webhookEnabled = value
	}

	webhookURL := readStringPayload(payload, "webhook_url")

	deviceTypes := normalizeStringSlice(payload["device_types"])
	deviceGroups := normalizeIntSlice(payload["device_groups"])
	specificDevices := normalizeIntSlice(payload["specific_devices"])
	emailRecipients := normalizeStringSlice(payload["email_recipients"])

	deviceTypesJSON, err := encodeJSON(deviceTypes)
	if err != nil {
		return alerts.AlertRule{}, err
	}
	deviceGroupsJSON, err := encodeJSON(deviceGroups)
	if err != nil {
		return alerts.AlertRule{}, err
	}
	specificDevicesJSON, err := encodeJSON(specificDevices)
	if err != nil {
		return alerts.AlertRule{}, err
	}
	emailRecipientsJSON, err := encodeJSON(emailRecipients)
	if err != nil {
		return alerts.AlertRule{}, err
	}

	cooldownMinutes := 30
	if value, ok := toInt(payload["cooldown_minutes"]); ok && value > 0 {
		cooldownMinutes = value
	}

	rule := alerts.AlertRule{
		Name:                name,
		Description:         readStringPayload(payload, "description"),
		Category:            category,
		MetricName:          metricName,
		Operator:            operator,
		ThresholdValue:      thresholdValue,
		Duration:            duration,
		DeviceTypes:         deviceTypesJSON,
		DeviceGroups:        deviceGroupsJSON,
		SpecificDevices:     specificDevicesJSON,
		Severity:            severity,
		AutoResolve:         &autoResolve,
		NotificationEnabled: &notificationEnabled,
		EmailEnabled:        &emailEnabled,
		WebhookEnabled:      &webhookEnabled,
		WebhookURL:          webhookURL,
		EmailRecipients:     emailRecipientsJSON,
		CooldownMinutes:     &cooldownMinutes,
		IsActive:            &isActive,
	}

	if user != nil && strings.TrimSpace(user.ID) != "" {
		rule.CreatedBy = &user.ID
	}

	return rule, nil
}

func buildAlertRuleUpdates(payload map[string]interface{}) (map[string]interface{}, error) {
	updates := map[string]interface{}{}

	if value := readStringValue(payload["name"]); value != "" {
		updates["name"] = value
	}
	if _, ok := payload["description"]; ok {
		updates["description"] = readStringPayload(payload, "description")
	}
	if value := readStringValue(payload["category"]); value != "" {
		updates["category"] = value
	}
	if value := readStringValue(payload["severity"]); value != "" {
		updates["severity"] = value
	}
	if value := readStringValue(payload["metric_name"]); value != "" {
		updates["metric_name"] = value
	}

	if operator := normalizeRuleOperator(readStringValue(payload["operator"]), readStringValue(payload["condition"])); operator != "" {
		updates["operator"] = operator
	}

	if value, ok := payload["threshold_value"]; ok {
		updates["threshold_value"] = readFloatValue(value)
	} else if value, ok := payload["threshold"]; ok {
		updates["threshold_value"] = readFloatValue(value)
	}

	if value, ok := toInt(payload["duration"]); ok && value > 0 {
		updates["duration"] = value
	}

	if value, ok := payload["is_active"].(bool); ok {
		updates["is_active"] = value
	} else if value, ok := payload["enabled"].(bool); ok {
		updates["is_active"] = value
	}

	if value, ok := payload["auto_resolve"].(bool); ok {
		updates["auto_resolve"] = value
	}

	if value, ok := payload["notification_enabled"].(bool); ok {
		updates["notification_enabled"] = value
	} else if value, ok := payload["notify_websocket"].(bool); ok {
		updates["notification_enabled"] = value
	}

	if value, ok := payload["email_enabled"].(bool); ok {
		updates["email_enabled"] = value
	} else if value, ok := payload["notify_email"].(bool); ok {
		updates["email_enabled"] = value
	}

	if value, ok := payload["webhook_enabled"].(bool); ok {
		updates["webhook_enabled"] = value
	}

	if _, ok := payload["webhook_url"]; ok {
		updates["webhook_url"] = readStringPayload(payload, "webhook_url")
	}

	if _, ok := payload["device_types"]; ok {
		deviceTypesJSON, err := encodeJSON(normalizeStringSlice(payload["device_types"]))
		if err != nil {
			return nil, err
		}
		updates["device_types"] = deviceTypesJSON
	}

	if _, ok := payload["device_groups"]; ok {
		deviceGroupsJSON, err := encodeJSON(normalizeIntSlice(payload["device_groups"]))
		if err != nil {
			return nil, err
		}
		updates["device_groups"] = deviceGroupsJSON
	}

	if _, ok := payload["specific_devices"]; ok {
		specificDevicesJSON, err := encodeJSON(normalizeIntSlice(payload["specific_devices"]))
		if err != nil {
			return nil, err
		}
		updates["specific_devices"] = specificDevicesJSON
	}

	if _, ok := payload["email_recipients"]; ok {
		recipientsJSON, err := encodeJSON(normalizeStringSlice(payload["email_recipients"]))
		if err != nil {
			return nil, err
		}
		updates["email_recipients"] = recipientsJSON
	}

	if value, ok := toInt(payload["cooldown_minutes"]); ok && value > 0 {
		updates["cooldown_minutes"] = value
	}

	if len(updates) > 0 {
		updates["updated_at"] = time.Now().UTC()
	}

	return updates, nil
}

func normalizeStringSlice(value interface{}) []string {
	result := make([]string, 0)
	switch v := value.(type) {
	case []string:
		for _, item := range v {
			item = strings.TrimSpace(item)
			if item != "" {
				result = append(result, item)
			}
		}
	case []interface{}:
		for _, item := range v {
			if text, ok := item.(string); ok {
				text = strings.TrimSpace(text)
				if text != "" {
					result = append(result, text)
				}
			}
		}
	}
	return result
}

func normalizeIntSlice(value interface{}) []int {
	result := make([]int, 0)
	switch v := value.(type) {
	case []int:
		for _, item := range v {
			if item > 0 {
				result = append(result, item)
			}
		}
	case []interface{}:
		for _, item := range v {
			if parsed, ok := toInt(item); ok && parsed > 0 {
				result = append(result, parsed)
			}
		}
	}
	return result
}

func readFloatValue(value interface{}) float64 {
	switch v := value.(type) {
	case float64:
		return v
	case float32:
		return float64(v)
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case string:
		if parsed, err := strconv.ParseFloat(strings.TrimSpace(v), 64); err == nil {
			return parsed
		}
	}
	return 0
}

func toInt(value interface{}) (int, bool) {
	switch v := value.(type) {
	case int:
		return v, true
	case int64:
		return int(v), true
	case float64:
		return int(v), true
	case string:
		if parsed, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
			return parsed, true
		}
	}
	return 0, false
}

func normalizeRuleOperator(operator string, condition string) string {
	if strings.TrimSpace(operator) != "" {
		return normalizeOperatorValue(operator)
	}
	if strings.TrimSpace(condition) == "" {
		return ""
	}
	switch strings.ToLower(strings.TrimSpace(condition)) {
	case "gt", ">":
		return ">"
	case "lt", "<":
		return "<"
	case "gte", ">=":
		return ">="
	case "lte", "<=":
		return "<="
	case "eq", "==", "=":
		return "=="
	case "ne", "!=":
		return "!="
	default:
		return ""
	}
}

func normalizeOperatorValue(operator string) string {
	switch strings.TrimSpace(operator) {
	case ">":
		return ">"
	case "<":
		return "<"
	case ">=":
		return ">="
	case "<=":
		return "<="
	case "==", "=":
		return "=="
	case "!=":
		return "!="
	default:
		return ""
	}
}

func operatorToCondition(operator string) string {
	switch strings.TrimSpace(operator) {
	case ">":
		return "gt"
	case "<":
		return "lt"
	case ">=":
		return "gte"
	case "<=":
		return "lte"
	case "==", "=":
		return "eq"
	case "!=":
		return "ne"
	default:
		return ""
	}
}
