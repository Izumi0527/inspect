package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	mw "github.com/your-org/inspect-system/backend-go/internal/http/middleware"
)

func (h DevicesHandler) CreateDeviceGroup(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "device service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:create"); err != nil {
		return err
	}

	var req devices.DeviceGroupCreateRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	permissions, _ := c.Get(authContextPermissionsKey).([]string)
	if len(req.DeviceIDs) > 0 && !hasPermission("devices:update", permissions) {
		return echo.NewHTTPError(http.StatusForbidden, "Permission denied: devices:update")
	}

	created, err := h.Service.CreateGroup(c.Request().Context(), req)
	if err != nil {
		return mapDeviceGroupError(err, "failed to create device group")
	}

	if hasPermission("alerts:read", permissions) {
		if refreshed, err := h.Service.GetGroupWithStats(c.Request().Context(), created.ID, true); err == nil {
			created = refreshed
		}
	}

	mw.SetAuditDetails(c, map[string]interface{}{
		"group_id":   created.ID,
		"name":       created.Name,
		"parent_id":  created.ParentID,
		"device_ids": req.DeviceIDs,
	})
	return c.JSON(http.StatusCreated, created)
}

func (h DevicesHandler) UpdateDeviceGroup(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "device service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:update"); err != nil {
		return err
	}

	groupID, err := strconv.Atoi(c.Param("group_id"))
	if err != nil || groupID <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid group_id")
	}

	var req devices.DeviceGroupUpdateRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	updated, err := h.Service.UpdateGroup(c.Request().Context(), groupID, req)
	if err != nil {
		return mapDeviceGroupError(err, "failed to update device group")
	}

	permissions, _ := c.Get(authContextPermissionsKey).([]string)
	if hasPermission("alerts:read", permissions) {
		if refreshed, err := h.Service.GetGroupWithStats(c.Request().Context(), updated.ID, true); err == nil {
			updated = refreshed
		}
	}

	mw.SetAuditDetails(c, map[string]interface{}{
		"group_id":  updated.ID,
		"name":      updated.Name,
		"parent_id": updated.ParentID,
		"is_active": updated.IsActive,
	})
	return c.JSON(http.StatusOK, updated)
}

func (h DevicesHandler) DeleteDeviceGroup(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "device service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:delete"); err != nil {
		return err
	}

	groupID, err := strconv.Atoi(c.Param("group_id"))
	if err != nil || groupID <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid group_id")
	}

	onNonEmpty := strings.TrimSpace(c.QueryParam("on_non_empty"))
	if err := h.Service.DeleteGroup(c.Request().Context(), groupID, onNonEmpty); err != nil {
		return mapDeviceGroupError(err, "failed to delete device group")
	}

	if onNonEmpty == "" {
		onNonEmpty = "reject"
	}
	mw.SetAuditDetails(c, map[string]interface{}{
		"group_id":     groupID,
		"on_non_empty": onNonEmpty,
	})
	return c.JSON(http.StatusOK, map[string]interface{}{
		"message": "device group deleted",
	})
}

func mapDeviceGroupError(err error, fallback string) error {
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		return echo.NewHTTPError(http.StatusNotFound, "device group not found")
	case errors.Is(err, devices.ErrGroupConflict), errors.Is(err, devices.ErrGroupNotEmpty):
		return echo.NewHTTPError(http.StatusConflict, err.Error())
	case errors.Is(err, devices.ErrGroupValidation):
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	default:
		return echo.NewHTTPError(http.StatusInternalServerError, fallback)
	}
}
