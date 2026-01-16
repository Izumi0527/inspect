package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

func (h SettingsHandler) GetSecurityConfigs(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	items, err := h.Service.ListSettings(c.Request().Context(), "security")
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取安全配置失败")
	}

	return c.JSON(http.StatusOK, settings.SettingListResponse{Items: items, Total: len(items)})
}

func (h SettingsHandler) GetSecurityStats(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	items, err := h.Service.ListSettings(c.Request().Context(), "security")
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取安全配置失败")
	}

	enabled := 0
	for _, item := range items {
		if value, ok := item.Value.(bool); ok && value {
			enabled++
		}
	}

	sessions, _ := h.Service.ListActiveSessions(c.Request().Context())

	return c.JSON(http.StatusOK, map[string]interface{}{
		"total_count":   len(items),
		"enabled_count": enabled,
		"sessions":      sessions.Total,
	})
}

func (h SettingsHandler) GetSessions(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	resp, err := h.Service.ListActiveSessions(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取会话失败")
	}
	return c.JSON(http.StatusOK, resp)
}
