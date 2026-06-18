package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

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
