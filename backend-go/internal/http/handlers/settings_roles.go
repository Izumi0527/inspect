package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

func (h SettingsHandler) GetRoles(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "users:read"); err != nil {
		return err
	}

	roles, err := h.Service.ListRoles(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取角色失败")
	}
	return c.JSON(http.StatusOK, roles)
}

func (h SettingsHandler) GetRole(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "users:read"); err != nil {
		return err
	}

	roleID := c.Param("role_id")
	role, err := h.Service.GetRole(c.Request().Context(), roleID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "角色不存在")
	}

	return c.JSON(http.StatusOK, role)
}

func (h SettingsHandler) CreateRole(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "users:create"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	role, err := h.Service.CreateRole(c.Request().Context(), payload)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.JSON(http.StatusCreated, role)
}

func (h SettingsHandler) UpdateRole(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "users:update"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	roleID := c.Param("role_id")
	role, err := h.Service.UpdateRole(c.Request().Context(), roleID, payload)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	return c.JSON(http.StatusOK, role)
}

func (h SettingsHandler) DeleteRole(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "users:delete"); err != nil {
		return err
	}

	roleID := c.Param("role_id")
	if err := h.Service.DeleteRole(c.Request().Context(), roleID); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}

func (h SettingsHandler) AssignRolePermissions(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "users:update"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	permissionIDs := readStringSlice(payload, "permission_ids", "permissionIds")
	roleID := c.Param("role_id")

	if err := h.Service.AssignRolePermissions(c.Request().Context(), roleID, permissionIDs); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"success": true})
}

func (h SettingsHandler) GetPermissions(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "users:read"); err != nil {
		return err
	}

	permissions, err := h.Service.ListPermissions(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取权限失败")
	}
	return c.JSON(http.StatusOK, permissions)
}
