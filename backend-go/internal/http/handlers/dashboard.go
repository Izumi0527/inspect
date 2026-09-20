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
	group.GET("/dashboard/network-topology", h.GetNetworkTopology)
	group.PUT("/dashboard/network-topology/layout", h.PutNetworkTopologyLayout)
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
		CanReadDevices:     hasPermission("devices:read", permissions),
		CanReadAlerts:      hasPermission("alerts:read", permissions),
		CanReadMonitoring:  hasPermission("monitoring:read", permissions),
		CanReadInspections: hasPermission("inspections:read", permissions),
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

func (h DashboardHandler) GetNetworkTopology(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "dashboard service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:read"); err != nil {
		return err
	}

	resp, err := h.Service.GetNetworkTopology(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load network topology")
	}
	return c.JSON(http.StatusOK, resp)
}

// PutNetworkTopologyLayout 整份覆盖全局拓扑布局。布局是运维团队共享的视图，改动需要 devices:update。
func (h DashboardHandler) PutNetworkTopologyLayout(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "dashboard service not configured")
	}
	user, err := requirePermission(c, h.Auth, "devices:update")
	if err != nil {
		return err
	}

	var req dashboard.TopologyLayout
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if _, err := dashboard.NormalizeTopologyLayout(req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid topology layout: "+err.Error())
	}

	// 展示用操作人：用户名可读，ID 只在没有用户名时兜底
	updatedBy := ""
	if user != nil {
		updatedBy = user.Username
		if updatedBy == "" {
			updatedBy = user.ID
		}
	}
	layout, err := h.Service.SaveTopologyLayout(c.Request().Context(), req, updatedBy)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to save topology layout")
	}
	return c.JSON(http.StatusOK, layout)
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

	scope, ok := dashboard.ParseNotificationTypeFilter(c.QueryParam("type"))
	if !ok {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid notification type")
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
	access := notificationAccessFromPermissions(permissions).ScopedToType(scope)
	resp, err := h.Service.GetNotificationsForUser(c.Request().Context(), userID, access, limit)
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

	req, access, err := bindNotificationAction(c, permissions)
	if err != nil {
		return err
	}

	userID := ""
	if user != nil {
		userID = user.ID
	}

	var updated int
	if req.All {
		n, err := h.Service.MarkAllNotificationsReadWithAccess(c.Request().Context(), userID, access, req.WindowLimit)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to mark notifications read")
		}
		updated = n
	} else {
		n, err := h.Service.MarkNotificationsReadWithAccess(c.Request().Context(), userID, access, req.IDs)
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

	req, access, err := bindNotificationAction(c, permissions)
	if err != nil {
		return err
	}

	userID := ""
	if user != nil {
		userID = user.ID
	}

	var updated int
	if req.All {
		n, err := h.Service.DismissAllNotificationsWithAccess(c.Request().Context(), userID, access, req.WindowLimit)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to dismiss notifications")
		}
		updated = n
	} else {
		n, err := h.Service.DismissNotificationsWithAccess(c.Request().Context(), userID, access, req.IDs)
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
	// Type 与 all 组合时把"全部已读 / 清空"限定在当前标签页（alert / system），空串表示不限。
	Type string `json:"type"`
}

func notificationAccessFromPermissions(permissions []string) dashboard.NotificationAccess {
	return dashboard.NotificationAccess{
		CanReadAlerts:      hasPermission("alerts:read", permissions),
		CanReadInspections: hasPermission("inspections:read", permissions),
		CanReadReports:     hasPermission("reports:read", permissions),
		CanReadDevices:     hasPermission("devices:read", permissions),
	}
}

func bindNotificationAction(c echo.Context, permissions []string) (notificationActionRequest, dashboard.NotificationAccess, error) {
	var req notificationActionRequest
	if err := c.Bind(&req); err != nil {
		return req, dashboard.NotificationAccess{}, echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if !req.All && len(req.IDs) == 0 {
		return req, dashboard.NotificationAccess{}, echo.NewHTTPError(http.StatusBadRequest, "ids or all required")
	}
	scope, ok := dashboard.ParseNotificationTypeFilter(req.Type)
	if !ok {
		return req, dashboard.NotificationAccess{}, echo.NewHTTPError(http.StatusBadRequest, "invalid notification type")
	}
	return req, notificationAccessFromPermissions(permissions).ScopedToType(scope), nil
}
