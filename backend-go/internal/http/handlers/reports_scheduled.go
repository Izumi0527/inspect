package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

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
