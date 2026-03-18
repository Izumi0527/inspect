package handlers

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/xuri/excelize/v2"

	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

func (h SettingsHandler) GetAuditLogs(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:logs"); err != nil {
		return err
	}

	page, _ := strconv.Atoi(c.QueryParam("page"))
	pageSize, _ := strconv.Atoi(c.QueryParam("page_size"))
	query := settings.AuditQuery{
		Page:     page,
		PageSize: pageSize,
		UserID:   strings.TrimSpace(c.QueryParam("user_id")),
		Action:   strings.TrimSpace(c.QueryParam("action")),
		Status:   strings.TrimSpace(c.QueryParam("status")),
		Resource: strings.TrimSpace(c.QueryParam("resource")),
		Search:   strings.TrimSpace(c.QueryParam("search")),
		Keyword:  strings.TrimSpace(c.QueryParam("keyword")),
	}

	if start := strings.TrimSpace(c.QueryParam("start_date")); start != "" {
		if parsed, err := parseTimeValue(start); err == nil {
			query.StartTime = &parsed
		}
	}
	if end := strings.TrimSpace(c.QueryParam("end_date")); end != "" {
		if parsed, err := parseTimeValue(end); err == nil {
			query.EndTime = &parsed
		}
	}

	resp, err := h.Service.ListAuditLogs(c.Request().Context(), query)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取审计日志失败")
	}
	return c.JSON(http.StatusOK, resp)
}

func (h SettingsHandler) GetAuditLog(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:logs"); err != nil {
		return err
	}

	logID := c.Param("log_id")
	item, err := h.Service.GetAuditLog(c.Request().Context(), logID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "审计日志不存在")
	}
	return c.JSON(http.StatusOK, item)
}

func (h SettingsHandler) GetAuditStats(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:logs"); err != nil {
		return err
	}

	resp, err := h.Service.GetAuditStats(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取审计统计失败")
	}
	return c.JSON(http.StatusOK, resp)
}

func (h SettingsHandler) CleanupAuditLogs(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:logs"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	_ = c.Bind(&payload)
	before := readString(payload, "beforeDate", "before_date")
	if before == "" {
		before = c.QueryParam("beforeDate")
	}
	if before == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "beforeDate is required")
	}

	beforeTime, err := parseTimeValue(before)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid beforeDate")
	}

	deleted, err := h.Service.CleanupAuditLogs(c.Request().Context(), beforeTime)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "清理审计日志失败")
	}

	return c.JSON(http.StatusOK, map[string]int64{"deletedCount": deleted})
}

func (h SettingsHandler) ExportAuditLogs(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:logs"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	format := strings.ToLower(readString(payload, "format"))
	if format == "" {
		format = "csv"
	}

	start := readString(payload, "startDate", "start_date")
	end := readString(payload, "endDate", "end_date")
	var startTime *time.Time
	var endTime *time.Time
	if start != "" {
		if parsed, err := parseTimeValue(start); err == nil {
			startTime = &parsed
		}
	}
	if end != "" {
		if parsed, err := parseTimeValue(end); err == nil {
			endTime = &parsed
		}
	}

	filters := map[string]interface{}{}
	if raw, ok := payload["filters"].(map[string]interface{}); ok {
		filters = raw
	}

	query := settings.AuditQuery{
		UserID:   readString(filters, "user_id", "userId"),
		Action:   readString(filters, "action"),
		Status:   readString(filters, "status"),
		Resource: readString(filters, "resource"),
		Search:   readString(filters, "search"),
		Keyword:  readString(filters, "keyword"),
		StartTime: startTime,
		EndTime:   endTime,
	}

	logs, err := h.Service.QueryAuditLogs(c.Request().Context(), query)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "导出审计日志失败")
	}

	switch format {
	case "excel", "xlsx":
		return writeAuditExcel(c, logs)
	case "json":
		return writeAuditJSON(c, logs)
	default:
		return writeAuditCSV(c, logs)
	}
}

func writeAuditCSV(c echo.Context, logs []settings.AuditLogItem) error {
	buffer := &bytes.Buffer{}
	writer := csv.NewWriter(buffer)
	_ = writer.Write([]string{"ID", "用户", "动作", "资源", "描述", "状态", "时间"})
	for _, log := range logs {
		username := ""
		if log.Username != nil {
			username = *log.Username
		}
		created := ""
		if log.CreatedAt != nil {
			created = log.CreatedAt.Format(time.RFC3339)
		}
		_ = writer.Write([]string{
			log.ID,
			username,
			log.Action,
			log.ResourceType,
			log.Description,
			log.Status,
			created,
		})
	}
	writer.Flush()

	return c.Blob(http.StatusOK, "text/csv", buffer.Bytes())
}

func writeAuditJSON(c echo.Context, logs []settings.AuditLogItem) error {
	data, err := json.Marshal(logs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "导出审计日志失败")
	}
	return c.Blob(http.StatusOK, "application/json", data)
}

func writeAuditExcel(c echo.Context, logs []settings.AuditLogItem) error {
	file := excelize.NewFile()
	sheet := file.GetSheetName(0)
	headers := []string{"ID", "用户", "动作", "资源", "描述", "状态", "时间"}
	for idx, header := range headers {
		cell, _ := excelize.CoordinatesToCellName(idx+1, 1)
		_ = file.SetCellValue(sheet, cell, header)
	}

	for rowIndex, log := range logs {
		username := ""
		if log.Username != nil {
			username = *log.Username
		}
		created := ""
		if log.CreatedAt != nil {
			created = log.CreatedAt.Format(time.RFC3339)
		}
		values := []interface{}{log.ID, username, log.Action, log.ResourceType, log.Description, log.Status, created}
		for colIndex, value := range values {
			cell, _ := excelize.CoordinatesToCellName(colIndex+1, rowIndex+2)
			_ = file.SetCellValue(sheet, cell, value)
		}
	}

	buffer, err := file.WriteToBuffer()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "导出审计日志失败")
	}

	return c.Blob(http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer.Bytes())
}
