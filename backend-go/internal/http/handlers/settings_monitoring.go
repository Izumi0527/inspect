package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"
)

func (h SettingsHandler) GetCurrentMonitoring(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "monitoring:read"); err != nil {
		return err
	}

	resp, err := h.Service.GetCurrentMetrics(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "\u83b7\u53d6\u7cfb\u7edf\u76d1\u63a7\u6570\u636e\u5931\u8d25")
	}

	return c.JSON(http.StatusOK, resp)
}

func (h SettingsHandler) GetMonitoringHistory(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "monitoring:read"); err != nil {
		return err
	}

	hours, _ := strconv.Atoi(c.QueryParam("hours"))
	startTime := strings.TrimSpace(c.QueryParam("start_time"))
	endTime := strings.TrimSpace(c.QueryParam("end_time"))
	if hours <= 0 && startTime != "" && endTime != "" {
		if start, err := parseTimeValue(startTime); err == nil {
			if end, err := parseTimeValue(endTime); err == nil {
				diff := end.Sub(start).Hours()
				if diff > 0 {
					hours = int(diff)
				}
			}
		}
	}

	resp, err := h.Service.GetMetricHistory(c.Request().Context(), hours)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "\u83b7\u53d6\u76d1\u63a7\u5386\u53f2\u6570\u636e\u5931\u8d25")
	}

	return c.JSON(http.StatusOK, resp)
}
