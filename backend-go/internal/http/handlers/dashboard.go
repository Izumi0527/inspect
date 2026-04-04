package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/dashboard"
)

type DashboardHandler struct {
	Service *dashboard.Service
	Auth    PermissionService
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
	group.GET("/dashboard/bandwidth-stats", h.GetBandwidthStats)
	group.GET("/dashboard/notifications", h.GetNotifications)
	group.POST("/dashboard/notifications/read", h.MarkNotificationsRead)
	group.POST("/dashboard/notifications/dismiss", h.DismissNotifications)
}

func (h DashboardHandler) GetOverview(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "dashboard service not configured")
	}
	user, err := requirePermission(c, h.Auth, "")
	if err != nil {
		return err
	}
	permissions, err := getCurrentPermissions(c, h.Auth, user)
	if err != nil {
		return err
	}

	resp, err := h.Service.GetOverview(c.Request().Context(), dashboard.OverviewAccess{
		CanReadDevices:    hasPermission("devices:read", permissions),
		CanReadAlerts:     hasPermission("alerts:read", permissions),
		CanReadMonitoring: hasPermission("monitoring:read", permissions),
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load dashboard overview")
	}
	return c.JSON(http.StatusOK, resp)
}

func (h DashboardHandler) GetDeviceStatusSummary(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "dashboard service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:read"); err != nil {
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
	if _, err := requirePermission(c, h.Auth, "alerts:read"); err != nil {
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
	if _, err := requirePermission(c, h.Auth, "monitoring:read"); err != nil {
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
	if _, err := requirePermission(c, h.Auth, "alerts:read"); err != nil {
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
	if _, err := requirePermission(c, h.Auth, "alerts:read"); err != nil {
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
	if _, err := requirePermission(c, h.Auth, "devices:read"); err != nil {
		return err
	}

	resp, err := h.Service.GetNetworkOverview(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load network overview")
	}
	return c.JSON(http.StatusOK, resp)
}

func (h DashboardHandler) GetBandwidthStats(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "dashboard service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "monitoring:read"); err != nil {
		return err
	}

	resp, err := h.Service.GetBandwidthStats(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load bandwidth statistics")
	}
	return c.JSON(http.StatusOK, resp)
}

func (h DashboardHandler) GetNotifications(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "dashboard service not configured")
	}
	user, err := requirePermission(c, h.Auth, "")
	if err != nil {
		return err
	}
	permissions, err := getCurrentPermissions(c, h.Auth, user)
	if err != nil {
		return err
	}

	limit := parseIntDefault(c.QueryParam("limit"), 20)
	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}

	userID := ""
	if user != nil {
		userID = user.ID
	}
	resp, err := h.Service.GetNotificationsForUser(c.Request().Context(), userID, dashboard.NotificationAccess{
		CanReadAlerts:      hasPermission("alerts:read", permissions),
		CanReadInspections: hasPermission("inspections:read", permissions),
		CanReadReports:     hasPermission("reports:read", permissions),
		CanReadDevices:     hasPermission("devices:read", permissions),
	}, limit)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load notifications")
	}
	return c.JSON(http.StatusOK, resp)
}

func (h DashboardHandler) MarkNotificationsRead(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "dashboard service not configured")
	}
	user, err := requirePermission(c, h.Auth, "")
	if err != nil {
		return err
	}
	permissions, err := getCurrentPermissions(c, h.Auth, user)
	if err != nil {
		return err
	}

	var req notificationActionRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if !req.All && len(req.IDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "ids or all required")
	}

	userID := ""
	if user != nil {
		userID = user.ID
	}

	var updated int
	if req.All {
		n, err := h.Service.MarkAllNotificationsReadWithAccess(c.Request().Context(), userID, dashboard.NotificationAccess{
			CanReadAlerts:      hasPermission("alerts:read", permissions),
			CanReadInspections: hasPermission("inspections:read", permissions),
			CanReadReports:     hasPermission("reports:read", permissions),
			CanReadDevices:     hasPermission("devices:read", permissions),
		}, req.WindowLimit)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to mark notifications read")
		}
		updated = n
	} else {
		n, err := h.Service.MarkNotificationsReadWithAccess(c.Request().Context(), userID, dashboard.NotificationAccess{
			CanReadAlerts:      hasPermission("alerts:read", permissions),
			CanReadInspections: hasPermission("inspections:read", permissions),
			CanReadReports:     hasPermission("reports:read", permissions),
			CanReadDevices:     hasPermission("devices:read", permissions),
		}, req.IDs)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to mark notifications read")
		}
		updated = n
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"updated": updated,
	})
}

func (h DashboardHandler) DismissNotifications(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "dashboard service not configured")
	}
	user, err := requirePermission(c, h.Auth, "")
	if err != nil {
		return err
	}
	permissions, err := getCurrentPermissions(c, h.Auth, user)
	if err != nil {
		return err
	}

	var req notificationActionRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if !req.All && len(req.IDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "ids or all required")
	}

	userID := ""
	if user != nil {
		userID = user.ID
	}

	var updated int
	if req.All {
		n, err := h.Service.DismissAllNotificationsWithAccess(c.Request().Context(), userID, dashboard.NotificationAccess{
			CanReadAlerts:      hasPermission("alerts:read", permissions),
			CanReadInspections: hasPermission("inspections:read", permissions),
			CanReadReports:     hasPermission("reports:read", permissions),
			CanReadDevices:     hasPermission("devices:read", permissions),
		}, req.WindowLimit)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to dismiss notifications")
		}
		updated = n
	} else {
		n, err := h.Service.DismissNotificationsWithAccess(c.Request().Context(), userID, dashboard.NotificationAccess{
			CanReadAlerts:      hasPermission("alerts:read", permissions),
			CanReadInspections: hasPermission("inspections:read", permissions),
			CanReadReports:     hasPermission("reports:read", permissions),
			CanReadDevices:     hasPermission("devices:read", permissions),
		}, req.IDs)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to dismiss notifications")
		}
		updated = n
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"updated": updated,
	})
}

type notificationActionRequest struct {
	IDs         []string `json:"ids"`
	All         bool     `json:"all"`
	WindowLimit int      `json:"window_limit"`
}
