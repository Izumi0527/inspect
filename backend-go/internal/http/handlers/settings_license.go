package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

func (h SettingsHandler) GetLicense(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	license, err := h.Service.GetLicense(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取许可证信息失败")
	}

	return c.JSON(http.StatusOK, license)
}
