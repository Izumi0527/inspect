package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/dashboard"
)

type DashboardHandler struct {
	Service *dashboard.Service
	Auth    *auth.Service
}

func (h DashboardHandler) Register(group *echo.Group) {
	group.GET("/dashboard/overview", h.GetOverview)
	group.GET("/dashboard/device-status", h.GetDeviceStatusSummary)
	group.GET("/dashboard/alert-summary", h.GetAlertSummary)
	group.GET("/dashboard/recent-activities", h.GetRecentActivities)
	group.GET("/dashboard/system-status", h.GetSystemStatus)
	group.GET("/dashboard/top-devices-by-alerts", h.GetTopDevicesByAlerts)
	group.GET("/dashboard/recent-alerts", h.GetRecentAlerts)
	group.GET("/dashboard/network-overview", h.GetNetworkOverview)
}

func (h DashboardHandler) GetOverview(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "dashboard service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	resp, err := h.Service.GetOverview(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load dashboard overview")
	}
	return c.JSON(http.StatusOK, resp)
}

func (h DashboardHandler) GetDeviceStatusSummary(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "dashboard service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	resp, err := h.Service.GetDeviceStatusSummary(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load device status summary")
	}
	return c.JSON(http.StatusOK, resp)
}

func (h DashboardHandler) GetAlertSummary(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "dashboard service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	resp, err := h.Service.GetAlertSummary(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load alert summary")
	}
	return c.JSON(http.StatusOK, resp)
}

func (h DashboardHandler) GetRecentActivities(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "dashboard service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	limit := parseIntDefault(c.QueryParam("limit"), 10)
	if limit <= 0 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}

	resp, err := h.Service.GetRecentActivities(c.Request().Context(), limit)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load recent activities")
	}
	return c.JSON(http.StatusOK, resp)
}

func (h DashboardHandler) GetSystemStatus(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "dashboard service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	resp, err := h.Service.GetSystemStatus(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load system status")
	}
	return c.JSON(http.StatusOK, resp)
}

func (h DashboardHandler) GetTopDevicesByAlerts(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "dashboard service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	limit := parseIntDefault(c.QueryParam("limit"), 5)
	if limit <= 0 {
		limit = 5
	}
	if limit > 20 {
		limit = 20
	}

	resp, err := h.Service.GetTopDevicesByAlerts(c.Request().Context(), limit)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load top devices")
	}
	return c.JSON(http.StatusOK, resp)
}

func (h DashboardHandler) GetRecentAlerts(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "dashboard service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	limit := parseIntDefault(c.QueryParam("limit"), 5)
	if limit <= 0 {
		limit = 5
	}
	if limit > 50 {
		limit = 50
	}

	resp, err := h.Service.GetRecentAlerts(c.Request().Context(), limit)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load recent alerts")
	}
	return c.JSON(http.StatusOK, resp)
}

func (h DashboardHandler) GetNetworkOverview(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "dashboard service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	resp, err := h.Service.GetNetworkOverview(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load network overview")
	}
	return c.JSON(http.StatusOK, resp)
}
