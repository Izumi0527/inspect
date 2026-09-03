package handlers

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/xuri/excelize/v2"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/logs"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

type LogsHandler struct {
	Service *logs.Service
	Auth    PermissionService
	// Settings 用于读取系统设置中的 Syslog 配置（通过 /logs/syslog/apply 生效）。
	Settings SettingsGetter
	// Syslog 为可注入的运行时接收器，便于测试与运行期热更新。
	Syslog SyslogRuntime
	// Logger 用于结构化诊断日志输出（注入，可为 nil）。
	Logger *zap.Logger
}

type SettingsGetter interface {
	GetSetting(ctx context.Context, key string) (*settings.SettingItem, error)
}

type SyslogRuntime interface {
	Status() logs.SyslogStatus
	Apply(ctx context.Context, cfg logs.SyslogConfig) (logs.SyslogStatus, error)
}

const (
	logsReadPermission   = "system:logs"
	logsManagePermission = "system:logs:manage"
	maxExportDeviceIDs   = 200
	// exportBatchSize 导出分批拉取的批大小，与 service 层单次查询上限（maxLogLimit）一致。
	exportBatchSize = 1000
	// exportMaxRows 单次导出的安全上限，防止无界导出拖垮后端。
	exportMaxRows = 50000
)

func (h LogsHandler) Register(group *echo.Group) {
	group.GET("/logs", h.ListLogs)
	group.GET("/logs/", h.ListLogs)
	group.GET("/logs/devices/:device_id/logs", h.GetDeviceLogs)
	group.GET("/logs/recent", h.GetRecentLogs)
	group.GET("/logs/search", h.SearchLogs)
	group.GET("/logs/statistics", h.GetLogStatistics)
	group.GET("/logs/export", h.ExportLogs)
	group.GET("/logs/devices/:device_id/logs/export", h.ExportDeviceLogs)
	group.POST("/logs/devices/:device_id/logs/collect", h.CollectDeviceLogs)
	group.POST("/logs/batch-collect", h.BatchCollectLogs)
	group.DELETE("/logs/:log_id", h.DeleteLog)
	group.POST("/logs/batch-delete", h.BatchDeleteLogs)
	group.POST("/logs/cleanup", h.CleanupDeviceLogs)

	group.GET("/logs/syslog/status", h.GetSyslogStatus)
	group.POST("/logs/syslog/apply", h.ApplySyslogConfig)

	// TODO(未接通): 以下解析规则接口只做 log_parsing_rules 表的增删改查，
	// 采集与 Syslog 解析链路（logs.parseLogOutput / logs.ParseSyslogMessage）
	// 均不读取该表 —— 在此配置规则不会对任何日志的解析结果产生影响。
	// 日志的可读化目前由前端 lib/plain-language 的规则表承担。
	// 后续要么将本表接入解析链路，要么连同表一起移除，不宜长期保持现状。
	group.GET("/logs/parsing-rules", h.ListParsingRules)
	group.GET("/logs/parsing-rules/:rule_id", h.GetParsingRule)
	group.POST("/logs/parsing-rules", h.CreateParsingRule)
	group.PUT("/logs/parsing-rules/:rule_id", h.UpdateParsingRule)
	group.DELETE("/logs/parsing-rules/:rule_id", h.DeleteParsingRule)
}

func (h LogsHandler) ListLogs(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, logsReadPermission); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "log service not configured")
	}

	page, pageSize := parsePageParams(c)
	skip := (page - 1) * pageSize
	if skip < 0 {
		skip = 0
	}

	filter := buildLogFilter(c, skip, pageSize)
	rows, total, err := h.Service.ListLogs(c.Request().Context(), filter)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load logs")
	}

	return c.JSON(http.StatusOK, buildLogListResponse(rows, total, page, pageSize))
}

func (h LogsHandler) GetDeviceLogs(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, logsReadPermission); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "log service not configured")
	}

	deviceID, err := parseIDParam(c, "device_id")
	if err != nil {
		return err
	}

	page, pageSize := parsePageParams(c)
	skip := (page - 1) * pageSize
	if skip < 0 {
		skip = 0
	}

	filter := buildLogFilter(c, skip, pageSize)
	filter.DeviceID = &deviceID

	rows, total, err := h.Service.ListLogs(c.Request().Context(), filter)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load device logs")
	}

	return c.JSON(http.StatusOK, buildLogListResponse(rows, total, page, pageSize))
}

func (h LogsHandler) GetRecentLogs(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, logsReadPermission); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "log service not configured")
	}

	hours := parseIntDefault(c.QueryParam("hours"), 24)
	limit := parseIntDefault(c.QueryParam("limit"), 100)
	deviceID := parseOptionalInt(c.QueryParam("device_id"))

	rows, err := h.Service.GetRecentLogs(c.Request().Context(), deviceID, hours, limit)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load recent logs")
	}

	return c.JSON(http.StatusOK, buildLogItems(rows))
}

func (h LogsHandler) SearchLogs(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, logsReadPermission); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "log service not configured")
	}

	keyword := strings.TrimSpace(c.QueryParam("keyword"))
	if keyword == "" {
		page, pageSize := parsePageParams(c)
		return c.JSON(http.StatusOK, logs.LogListResponse{
			Items:      []logs.LogItem{},
			Total:      0,
			Page:       page,
			PageSize:   pageSize,
			TotalPages: 0,
			HasNext:    false,
			HasPrev:    false,
		})
	}

	page, pageSize := parsePageParams(c)
	skip := (page - 1) * pageSize
	if skip < 0 {
		skip = 0
	}

	filter := buildLogFilter(c, skip, pageSize)
	rows, total, err := h.Service.SearchLogs(c.Request().Context(), keyword, filter)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to search logs")
	}

	return c.JSON(http.StatusOK, buildLogListResponse(rows, total, page, pageSize))
}

func (h LogsHandler) GetLogStatistics(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, logsReadPermission); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "log service not configured")
	}

	deviceID := parseOptionalInt(c.QueryParam("device_id"))
	hours := parseIntDefault(c.QueryParam("hours"), 24)

	stats, err := h.Service.GetLogStatistics(c.Request().Context(), deviceID, hours)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load log statistics")
	}

	return c.JSON(http.StatusOK, stats)
}

func (h LogsHandler) CollectDeviceLogs(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, logsManagePermission); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "log service not configured")
	}

	deviceID, err := parseIDParam(c, "device_id")
	if err != nil {
		return err
	}

	payload := map[string]interface{}{}
	// 空 body（io.EOF）合法；非法 JSON 返回 400，不再静默按默认值处理。
	if err := c.Bind(&payload); err != nil && !errors.Is(err, io.EOF) {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if value, ok := payload["device_id"]; ok {
		if parsed, ok := toInt(value); ok && parsed > 0 && parsed != deviceID {
			return echo.NewHTTPError(http.StatusBadRequest, "device_id mismatch")
		}
	}

	logType := readString(payload, "log_type", "logType")
	if logType == "" {
		logType = strings.TrimSpace(c.QueryParam("log_type"))
	}
	maxEntries, ok := readInt(payload, "max_entries", "maxEntries")
	if !ok {
		maxEntries = parseIntDefault(c.QueryParam("max_entries"), 100)
	}

	count, err := h.Service.CollectDeviceLogs(c.Request().Context(), deviceID, logType, maxEntries)
	if err != nil {
		// 详细错误进结构化日志（落 logs/），对客户端只返回通用文案，避免泄露内部细节。
		if h.Logger != nil {
			h.Logger.Error("设备日志采集失败",
				zap.Int("device_id", deviceID),
				zap.String("log_type", logType),
				zap.Int("max_entries", maxEntries),
				zap.Error(err))
		}
		switch {
		case errors.Is(err, logs.ErrDeviceNotFound):
			return echo.NewHTTPError(http.StatusNotFound, "device not found")
		case errors.Is(err, logs.ErrSSHNotConfigured), errors.Is(err, logs.ErrDeviceIPRequired):
			return echo.NewHTTPError(http.StatusBadRequest, "ssh credentials not configured")
		case errors.Is(err, logs.ErrCollectionCanceled):
			return echo.NewHTTPError(http.StatusRequestTimeout, "log collection canceled")
		default:
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to collect logs")
		}
	}

	message := fmt.Sprintf("日志采集完成，共 %d 条", count)
	return c.JSON(http.StatusOK, logs.LogCollectionResponse{
		Success:        true,
		Message:        message,
		CollectedCount: count,
		DeviceID:       deviceID,
	})
}

func (h LogsHandler) BatchCollectLogs(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, logsManagePermission); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "log service not configured")
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	deviceIDs := parseIntListFromPayload(payload["device_ids"])
	if len(deviceIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "device_ids is required")
	}
	// 与导出端点的 device_ids 上限保持一致，防止超大列表拖垮后端。
	if len(deviceIDs) > maxExportDeviceIDs {
		return echo.NewHTTPError(http.StatusBadRequest, "device_ids exceeds limit")
	}

	logType := readString(payload, "log_type", "logType")
	maxEntries, ok := readInt(payload, "max_entries", "maxEntries")
	if !ok {
		maxEntries = 100
	}
	maxConcurrent, ok := readInt(payload, "max_concurrent", "maxConcurrent")
	if !ok {
		maxConcurrent = 5
	}

	result, err := h.Service.BatchCollectLogs(c.Request().Context(), deviceIDs, logType, maxEntries, maxConcurrent)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to collect logs")
	}

	response := BuildBatchCollectLogsResponse(result)
	return c.JSON(http.StatusOK, response)
}

// BuildBatchCollectLogsResponse 构造批量采集响应（可测试），包含每台设备采集明细。
func BuildBatchCollectLogsResponse(result logs.BatchCollectResult) logs.BatchLogCollectionResponse {
	total := 0
	for _, count := range result.Collected {
		total += count
	}

	success := len(result.Failed) == 0
	message := fmt.Sprintf("批量日志采集完成，成功 %d 台设备", len(result.Collected))
	if len(result.Failed) > 0 {
		message = fmt.Sprintf("%s，失败 %d 台设备", message, len(result.Failed))
		if total == 0 {
			success = false
		}
	}

	return logs.BatchLogCollectionResponse{
		Success:        success,
		Message:        message,
		CollectedCount: total,
		DeviceID:       0,
		Collected:      result.Collected,
		Failed:         result.Failed,
	}
}

func (h LogsHandler) DeleteLog(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, logsManagePermission); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "log service not configured")
	}

	logID, err := parseIDParam(c, "log_id")
	if err != nil {
		return err
	}

	deleted, err := h.Service.DeleteLog(c.Request().Context(), logID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete log")
	}
	if !deleted {
		return echo.NewHTTPError(http.StatusNotFound, "log not found")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

func (h LogsHandler) BatchDeleteLogs(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, logsManagePermission); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "log service not configured")
	}

	var req logs.DeleteLogsRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if len(req.LogIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "log_ids is required")
	}

	deleted, err := h.Service.BatchDelete(c.Request().Context(), req.LogIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete logs")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"deleted_count": deleted,
	})
}

func (h LogsHandler) CleanupDeviceLogs(c echo.Context) error {
	// 清理属于日志管理操作，但设置页（system:config）也提供该入口，故任一权限即可。
	if _, err := requireAnyPermission(c, h.Auth, "system:config", logsManagePermission); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "log service not configured")
	}

	payload := map[string]interface{}{}
	// 空 body（io.EOF）合法；非法 JSON 返回 400，不再静默按默认值处理。
	if err := c.Bind(&payload); err != nil && !errors.Is(err, io.EOF) {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	before := readString(payload, "beforeDate", "before_date", "before")
	retentionDays, hasRetention := readInt(payload, "retentionDays", "retention_days", "days")

	var cutoff time.Time
	if strings.TrimSpace(before) != "" {
		parsed, err := parseTimeValue(before)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid beforeDate")
		}
		cutoff = parsed
	} else if hasRetention && retentionDays > 0 {
		cutoff = time.Now().UTC().AddDate(0, 0, -retentionDays)
	} else {
		return echo.NewHTTPError(http.StatusBadRequest, "beforeDate or retentionDays is required")
	}

	deleted, err := h.Service.CleanupDeviceLogsBefore(c.Request().Context(), cutoff)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to cleanup logs")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"deleted_count": deleted,
	})
}

func (h LogsHandler) GetSyslogStatus(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}
	if h.Syslog == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "syslog receiver not configured")
	}

	return c.JSON(http.StatusOK, h.Syslog.Status())
}

func (h LogsHandler) ApplySyslogConfig(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}
	if h.Syslog == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "syslog receiver not configured")
	}
	if h.Settings == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}

	ctx := c.Request().Context()
	cfg := readSyslogConfigFromSettings(ctx, h.Settings)

	status, err := h.Syslog.Apply(ctx, cfg)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("failed to apply syslog config: %s", err.Error()))
	}
	return c.JSON(http.StatusOK, status)
}

func (h LogsHandler) ListParsingRules(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, logsManagePermission); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "log service not configured")
	}

	rows, err := h.Service.ListParsingRules(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load parsing rules")
	}
	return c.JSON(http.StatusOK, rows)
}

func readSyslogConfigFromSettings(ctx context.Context, getter SettingsGetter) logs.SyslogConfig {
	// 默认值（与前端展示保持一致）。
	cfg := logs.SyslogConfig{
		Enabled:               false,
		Protocol:              "both",
		Host:                  "0.0.0.0",
		Port:                  5514,
		MaxMessageBytes:       8192,
		AlertsEnabled:         true,
		AlertsMaxNewPerMinute: 30,
	}
	if getter == nil {
		return cfg
	}

	if v, ok := readSettingBool(ctx, getter, "logs.syslog.enabled"); ok {
		cfg.Enabled = v
	}
	if v, ok := readSettingString(ctx, getter, "logs.syslog.protocol"); ok {
		value := strings.ToLower(strings.TrimSpace(v))
		if value == "udp" || value == "tcp" || value == "both" {
			cfg.Protocol = value
		}
	}
	if v, ok := readSettingString(ctx, getter, "logs.syslog.host"); ok {
		if trimmed := strings.TrimSpace(v); trimmed != "" {
			cfg.Host = trimmed
		}
	}
	if v, ok := readSettingInt(ctx, getter, "logs.syslog.port"); ok {
		if v > 0 && v <= 65535 {
			cfg.Port = v
		}
	}
	if v, ok := readSettingInt(ctx, getter, "logs.syslog.max_message_bytes"); ok {
		if v >= 256 && v <= 1024*1024 {
			cfg.MaxMessageBytes = v
		}
	}
	if v, ok := readSettingBool(ctx, getter, "logs.syslog.alerts.enabled"); ok {
		cfg.AlertsEnabled = v
	}
	if v, ok := readSettingInt(ctx, getter, "logs.syslog.alerts.max_new_per_minute"); ok {
		if v >= 0 && v <= 10000 {
			cfg.AlertsMaxNewPerMinute = v
		}
	}

	return cfg
}

func readSettingString(ctx context.Context, getter SettingsGetter, key string) (string, bool) {
	if getter == nil {
		return "", false
	}
	item, err := getter.GetSetting(ctx, key)
	if err != nil || item == nil {
		return "", false
	}
	switch v := item.Value.(type) {
	case string:
		return v, true
	default:
		return fmt.Sprint(v), true
	}
}

func readSettingBool(ctx context.Context, getter SettingsGetter, key string) (bool, bool) {
	if getter == nil {
		return false, false
	}
	item, err := getter.GetSetting(ctx, key)
	if err != nil || item == nil {
		return false, false
	}
	switch v := item.Value.(type) {
	case bool:
		return v, true
	case string:
		trimmed := strings.ToLower(strings.TrimSpace(v))
		if trimmed == "true" {
			return true, true
		}
		if trimmed == "false" {
			return false, true
		}
		return false, false
	default:
		return false, false
	}
}

func readSettingInt(ctx context.Context, getter SettingsGetter, key string) (int, bool) {
	if getter == nil {
		return 0, false
	}
	item, err := getter.GetSetting(ctx, key)
	if err != nil || item == nil {
		return 0, false
	}
	switch v := item.Value.(type) {
	case int:
		return v, true
	case int32:
		return int(v), true
	case int64:
		return int(v), true
	case float64:
		return int(v), true
	case float32:
		return int(v), true
	case string:
		parsed, err := strconv.Atoi(strings.TrimSpace(v))
		if err != nil {
			return 0, false
		}
		return parsed, true
	default:
		return 0, false
	}
}

func (h LogsHandler) GetParsingRule(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, logsManagePermission); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "log service not configured")
	}

	ruleID, err := parseIDParam(c, "rule_id")
	if err != nil {
		return err
	}

	rule, err := h.Service.GetParsingRule(c.Request().Context(), ruleID)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return echo.NewHTTPError(http.StatusNotFound, "rule not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load parsing rule")
	}

	return c.JSON(http.StatusOK, rule)
}

func (h LogsHandler) CreateParsingRule(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, logsManagePermission); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "log service not configured")
	}

	var payload logs.ParsingRulePayload
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	rule, err := h.Service.CreateParsingRule(c.Request().Context(), payload)
	if err != nil {
		switch {
		case errors.Is(err, logs.ErrInvalidParsingRule):
			// 载荷校验错误可直接透传给客户端
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		case errors.Is(err, gorm.ErrDuplicatedKey):
			return echo.NewHTTPError(http.StatusBadRequest, "parsing rule name already exists")
		default:
			// 数据库等内部错误不透传原始信息，避免泄露内部细节
			if h.Logger != nil {
				h.Logger.Error("创建解析规则失败", zap.Error(err))
			}
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to create parsing rule")
		}
	}

	return c.JSON(http.StatusOK, rule)
}

func (h LogsHandler) UpdateParsingRule(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, logsManagePermission); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "log service not configured")
	}

	ruleID, err := parseIDParam(c, "rule_id")
	if err != nil {
		return err
	}

	var payload logs.ParsingRulePayload
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	rule, err := h.Service.UpdateParsingRule(c.Request().Context(), ruleID, payload)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return echo.NewHTTPError(http.StatusNotFound, "rule not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to update parsing rule")
	}

	return c.JSON(http.StatusOK, rule)
}

func (h LogsHandler) DeleteParsingRule(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, logsManagePermission); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "log service not configured")
	}

	ruleID, err := parseIDParam(c, "rule_id")
	if err != nil {
		return err
	}

	deleted, err := h.Service.DeleteParsingRule(c.Request().Context(), ruleID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete parsing rule")
	}
	if !deleted {
		return echo.NewHTTPError(http.StatusNotFound, "rule not found")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

func (h LogsHandler) ExportDeviceLogs(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, logsReadPermission); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "log service not configured")
	}

	deviceID, err := parseIDParam(c, "device_id")
	if err != nil {
		return err
	}

	format := normalizeExportFormat(c.QueryParam("format"))
	includeRaw := parseBoolDefault(c.QueryParam("include_raw"), false)
	startTime, _ := parseTimeOptional(c.QueryParam("start_time"))
	endTime, _ := parseTimeOptional(c.QueryParam("end_time"))

	filter := buildLogFilter(c, 0, exportBatchSize)
	filter.DeviceID = &deviceID
	filter.StartTime = startTime
	filter.EndTime = endTime

	allItems, err := h.fetchLogsForExport(c.Request().Context(), filter)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to export logs")
	}
	if len(allItems) == 0 {
		return echo.NewHTTPError(http.StatusNotFound, "no logs found")
	}

	filename := buildLogExportFilename(format, fmt.Sprintf("Device_%d", deviceID), startTime, endTime)
	return writeLogsExport(c, format, filename, allItems, includeRaw, nil)
}

func (h LogsHandler) ExportLogs(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, logsReadPermission); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "log service not configured")
	}

	format := normalizeExportFormat(c.QueryParam("format"))
	includeRaw := parseBoolDefault(c.QueryParam("include_raw"), false)
	includeStats := parseBoolDefault(c.QueryParam("include_stats"), false)
	startTime, _ := parseTimeOptional(c.QueryParam("start_time"))
	endTime, _ := parseTimeOptional(c.QueryParam("end_time"))
	deviceIDs := parseCSVIntList(c.QueryParam("device_ids"))
	if len(deviceIDs) == 0 {
		if deviceID := parseOptionalInt(c.QueryParam("device_id")); deviceID != nil {
			deviceIDs = append(deviceIDs, *deviceID)
		}
	}
	if len(deviceIDs) > maxExportDeviceIDs {
		return echo.NewHTTPError(http.StatusBadRequest, "device_ids exceeds limit")
	}

	allLogs := make([]logs.LogItem, 0)

	if len(deviceIDs) > 0 {
		for _, id := range deviceIDs {
			filter := buildLogFilter(c, 0, exportBatchSize)
			filter.DeviceID = &id
			filter.StartTime = startTime
			filter.EndTime = endTime
			items, err := h.fetchLogsForExport(c.Request().Context(), filter)
			if err != nil {
				return echo.NewHTTPError(http.StatusInternalServerError, "failed to export logs")
			}
			allLogs = append(allLogs, items...)
		}
	} else {
		filter := buildLogFilter(c, 0, exportBatchSize)
		filter.StartTime = startTime
		filter.EndTime = endTime
		items, err := h.fetchLogsForExport(c.Request().Context(), filter)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to export logs")
		}
		allLogs = append(allLogs, items...)
	}

	if len(allLogs) == 0 {
		return echo.NewHTTPError(http.StatusNotFound, "no logs found")
	}

	var stats *logs.LogStatistics
	if includeStats && (format == "xlsx") {
		value, err := h.Service.GetLogStatistics(c.Request().Context(), nil, 24)
		if err == nil {
			stats = &value
		}
	}

	filename := buildLogExportFilename(format, "", startTime, endTime)
	return writeLogsExport(c, format, filename, allLogs, includeRaw, stats)
}

// fetchLogsForExport 按批循环拉取日志用于导出。
// service 层 ListLogs 的单次查询上限为 1000 条（normalizeFilter 强制截断），
// 直接传入更大的 limit 会被静默截断导致导出丢数据，因此这里以递增 skip
// 分批拉取，直到取完或达到导出安全上限。
func (h LogsHandler) fetchLogsForExport(ctx context.Context, filter logs.LogFilter) ([]logs.LogItem, error) {
	all := make([]logs.LogItem, 0)
	for skip := 0; skip < exportMaxRows; skip += exportBatchSize {
		batch := filter
		batch.Skip = skip
		batch.Limit = exportBatchSize
		rows, total, err := h.Service.ListLogs(ctx, batch)
		if err != nil {
			return nil, err
		}
		all = append(all, buildLogItems(rows)...)
		if len(rows) < exportBatchSize || int64(skip+len(rows)) >= total {
			break
		}
	}
	return all, nil
}

func buildLogFilter(c echo.Context, skip int, limit int) logs.LogFilter {
	filter := logs.LogFilter{
		Skip:  skip,
		Limit: limit,
	}

	if deviceID := parseOptionalInt(c.QueryParam("device_id")); deviceID != nil {
		filter.DeviceID = deviceID
	}

	level := strings.TrimSpace(c.QueryParam("level"))
	if level != "" {
		filter.Level = &level
	}
	facility := strings.TrimSpace(c.QueryParam("facility"))
	if facility != "" {
		filter.Facility = &facility
	}
	source := strings.TrimSpace(c.QueryParam("source"))
	if source != "" {
		filter.Source = &source
	}

	startTime, _ := parseTimeOptional(c.QueryParam("start_time"))
	endTime, _ := parseTimeOptional(c.QueryParam("end_time"))
	filter.StartTime = startTime
	filter.EndTime = endTime

	search := strings.TrimSpace(c.QueryParam("search"))
	if search != "" {
		filter.Search = &search
	}

	return filter
}

// BuildLogFilter 提供可测试的过滤器构造入口（内部仍复用 buildLogFilter）。
func BuildLogFilter(c echo.Context, skip int, limit int) logs.LogFilter {
	return buildLogFilter(c, skip, limit)
}

func buildLogListResponse(rows []logs.DeviceLogWithDevice, total int64, page int, pageSize int) logs.LogListResponse {
	if pageSize <= 0 {
		pageSize = len(rows)
	}
	pages := 0
	if pageSize > 0 {
		pages = int((total + int64(pageSize) - 1) / int64(pageSize))
	}

	return logs.LogListResponse{
		Items:      buildLogItems(rows),
		Total:      total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: pages,
		HasNext:    page < pages,
		HasPrev:    page > 1,
	}
}

func buildLogItems(rows []logs.DeviceLogWithDevice) []logs.LogItem {
	items := make([]logs.LogItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, logs.LogItem{
			ID:            row.ID,
			DeviceID:      row.DeviceID,
			DeviceName:    row.DeviceName,
			DeviceIP:      row.DeviceIP,
			Level:         row.Level,
			Facility:      row.Facility,
			Source:        row.Source,
			Message:       row.Message,
			RawMessage:    row.RawMessage,
			SourceIP:      row.SourceIP,
			SourceProcess: row.SourceProcess,
			LogTimestamp:  row.LogTimestamp,
			CollectedAt:   row.CollectedAt,
			CreatedAt:     row.CreatedAt,
		})
	}
	return items
}

func parseCSVIntList(raw string) []int {
	result := make([]int, 0)
	for _, item := range strings.Split(raw, ",") {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if parsed, err := strconv.Atoi(item); err == nil && parsed > 0 {
			result = append(result, parsed)
		}
	}
	return result
}

func normalizeExportFormat(raw string) string {
	normalized := strings.ToLower(strings.TrimSpace(raw))
	switch normalized {
	case "excel", "xlsx":
		return "xlsx"
	case "csv":
		return "csv"
	default:
		return "csv"
	}
}

func buildLogExportFilename(format string, deviceName string, startTime *time.Time, endTime *time.Time) string {
	timestamp := time.Now().Format("20060102_150405")
	baseName := "设备日志_" + timestamp
	if strings.TrimSpace(deviceName) != "" {
		baseName = fmt.Sprintf("设备日志_%s_%s", deviceName, timestamp)
	}
	if startTime != nil && endTime != nil {
		rangeValue := fmt.Sprintf("%02d%02d_%02d%02d", startTime.Month(), startTime.Day(), endTime.Month(), endTime.Day())
		baseName = fmt.Sprintf("设备日志_%s_%s", rangeValue, timestamp)
	}

	if format == "xlsx" {
		return baseName + ".xlsx"
	}
	return baseName + ".csv"
}

// contentDispositionAttachment 构造符合 RFC 6266/RFC 5987 的附件头：
// filename 提供 ASCII 回退名，filename* 提供 UTF-8 百分号编码的原名，
// 避免中文文件名在部分浏览器/代理上乱码。
func contentDispositionAttachment(filename string) string {
	var fallback strings.Builder
	for _, r := range filename {
		if r > 32 && r < 128 && !strings.ContainsRune(`\/:*?"<>|`, r) {
			fallback.WriteRune(r)
		} else {
			fallback.WriteRune('_')
		}
	}
	return fmt.Sprintf("attachment; filename=%q; filename*=UTF-8''%s", fallback.String(), url.PathEscape(filename))
}

func writeLogsExport(c echo.Context, format string, filename string, rows []logs.LogItem, includeRaw bool, stats *logs.LogStatistics) error {
	switch format {
	case "xlsx":
		buffer, err := writeLogsExcel(rows, includeRaw, stats)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to export logs")
		}
		c.Response().Header().Set("Content-Disposition", contentDispositionAttachment(filename))
		return c.Blob(http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer.Bytes())
	default:
		buffer, err := writeLogsCSV(rows, includeRaw)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to export logs")
		}
		c.Response().Header().Set("Content-Disposition", contentDispositionAttachment(filename))
		return c.Blob(http.StatusOK, "text/csv", buffer.Bytes())
	}
}

// sanitizeSpreadsheetCell 用于降低 CSV/Excel 导出时的“公式注入”风险。
// 参考：当单元格以 = + - @ 等开头时，Excel 可能将其解释为公式。
func sanitizeSpreadsheetCell(value string) string {
	if strings.TrimSpace(value) == "" {
		return value
	}
	trimmed := strings.TrimLeft(value, " \t\r\n")
	if trimmed == "" {
		return value
	}
	switch trimmed[0] {
	case '=', '+', '-', '@':
		return "'" + value
	default:
		return value
	}
}

func writeLogsCSV(rows []logs.LogItem, includeRaw bool) (*bytes.Buffer, error) {
	buffer := &bytes.Buffer{}
	_, _ = buffer.Write([]byte{0xEF, 0xBB, 0xBF})
	writer := csv.NewWriter(buffer)

	header := []string{"ID", "设备ID", "日志级别", "设施类型", "来源", "消息", "源IP", "源进程", "日志时间", "采集时间"}
	if includeRaw {
		header = append(header, "原始消息")
	}
	if err := writer.Write(header); err != nil {
		return nil, err
	}

	for _, row := range rows {
		values := []string{
			strconv.Itoa(row.ID),
			strconv.Itoa(row.DeviceID),
			translateLogLevel(row.Level),
			translateLogFacility(row.Facility),
			translateLogSource(row.Source),
			sanitizeSpreadsheetCell(row.Message),
			sanitizeSpreadsheetCell(emptyIfNil(row.SourceIP)),
			sanitizeSpreadsheetCell(emptyIfNil(row.SourceProcess)),
			formatLogTime(row.LogTimestamp),
			formatLogTime(row.CollectedAt),
		}
		if includeRaw {
			values = append(values, sanitizeSpreadsheetCell(emptyIfNil(row.RawMessage)))
		}
		if err := writer.Write(values); err != nil {
			return nil, err
		}
	}

	writer.Flush()
	return buffer, writer.Error()
}

func writeLogsExcel(rows []logs.LogItem, includeRaw bool, stats *logs.LogStatistics) (*bytes.Buffer, error) {
	file := excelize.NewFile()

	if stats != nil {
		sheet := "统计信息"
		file.SetSheetName(file.GetSheetName(0), sheet)
		_ = file.SetCellValue(sheet, "A1", "日志统计报告")
		_ = file.SetCellValue(sheet, "A2", fmt.Sprintf("生成时间: %s", time.Now().Format("2006-01-02 15:04:05")))
		_ = file.SetCellValue(sheet, "A4", "总日志数")
		_ = file.SetCellValue(sheet, "B4", stats.TotalLogs)
		_ = file.SetCellValue(sheet, "A5", "统计时间范围(小时)")
		_ = file.SetCellValue(sheet, "B5", stats.TimeRangeHours)

		row := 7
		if len(stats.ByLevel) > 0 {
			_ = file.SetCellValue(sheet, fmt.Sprintf("A%d", row), "按级别统计")
			row++
			_ = file.SetCellValue(sheet, fmt.Sprintf("A%d", row), "级别")
			_ = file.SetCellValue(sheet, fmt.Sprintf("B%d", row), "数量")
			row++
			for level, count := range stats.ByLevel {
				_ = file.SetCellValue(sheet, fmt.Sprintf("A%d", row), translateLogLevel(level))
				_ = file.SetCellValue(sheet, fmt.Sprintf("B%d", row), count)
				row++
			}
			row++
		}

		if len(stats.ByFacility) > 0 {
			_ = file.SetCellValue(sheet, fmt.Sprintf("A%d", row), "按设施统计")
			row++
			_ = file.SetCellValue(sheet, fmt.Sprintf("A%d", row), "设施")
			_ = file.SetCellValue(sheet, fmt.Sprintf("B%d", row), "数量")
			row++
			for facility, count := range stats.ByFacility {
				_ = file.SetCellValue(sheet, fmt.Sprintf("A%d", row), translateLogFacility(facility))
				_ = file.SetCellValue(sheet, fmt.Sprintf("B%d", row), count)
				row++
			}
		}
	}

	logSheet := "日志详情"
	if stats == nil {
		logSheet = file.GetSheetName(0)
	} else {
		_, _ = file.NewSheet(logSheet)
	}

	header := []string{"ID", "设备ID", "日志级别", "设施类型", "来源", "消息", "源IP", "源进程", "日志时间", "采集时间"}
	if includeRaw {
		header = append(header, "原始消息")
	}
	for idx, title := range header {
		cell, _ := excelize.CoordinatesToCellName(idx+1, 1)
		_ = file.SetCellValue(logSheet, cell, title)
	}

	for rowIndex, row := range rows {
		values := []interface{}{
			row.ID,
			row.DeviceID,
			translateLogLevel(row.Level),
			translateLogFacility(row.Facility),
			translateLogSource(row.Source),
			sanitizeSpreadsheetCell(row.Message),
			sanitizeSpreadsheetCell(emptyIfNil(row.SourceIP)),
			sanitizeSpreadsheetCell(emptyIfNil(row.SourceProcess)),
			formatLogTime(row.LogTimestamp),
			formatLogTime(row.CollectedAt),
		}
		if includeRaw {
			values = append(values, sanitizeSpreadsheetCell(emptyIfNil(row.RawMessage)))
		}

		for colIndex, value := range values {
			cell, _ := excelize.CoordinatesToCellName(colIndex+1, rowIndex+2)
			_ = file.SetCellValue(logSheet, cell, value)
		}
	}

	buffer, err := file.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buffer, nil
}

func translateLogLevel(level string) string {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "critical":
		return "严重"
	case "error":
		return "错误"
	case "warning":
		return "警告"
	case "info":
		return "信息"
	case "debug":
		return "调试"
	default:
		return level
	}
}

func translateLogFacility(facility string) string {
	switch strings.ToLower(strings.TrimSpace(facility)) {
	case "system":
		return "系统"
	case "interface":
		return "接口"
	case "security":
		return "安全"
	case "routing":
		return "路由"
	case "switching":
		return "交换"
	case "snmp":
		return "SNMP"
	case "ssh":
		return "SSH"
	case "other":
		return "其他"
	default:
		return facility
	}
}

func translateLogSource(source string) string {
	switch strings.ToLower(strings.TrimSpace(source)) {
	case "ssh":
		return "SSH采集"
	case "snmp":
		return "SNMP采集"
	case "snmp_trap":
		return "SNMP Trap"
	case "syslog":
		return "Syslog接收"
	case "trap":
		return "SNMP Trap"
	case "manual":
		return "手动录入"
	default:
		return source
	}
}

func formatLogTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.Format("2006-01-02 15:04:05")
}

func emptyIfNil(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
