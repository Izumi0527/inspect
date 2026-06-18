package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

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
