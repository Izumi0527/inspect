package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
)

func (h DevicesHandler) GetDevices(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "device service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:read"); err != nil {
		return err
	}

	page, pageSize := parsePageParams(c)
	deviceType := strings.TrimSpace(c.QueryParam("device_type"))
	status := strings.TrimSpace(c.QueryParam("status"))
	search := strings.TrimSpace(c.QueryParam("search"))
	groupID := parseOptionalInt(c.QueryParam("group_id"))

	result, total, err := h.Service.GetDevices(
		c.Request().Context(),
		page,
		pageSize,
		deviceType,
		status,
		groupID,
		search,
		nil,
		true,
	)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query devices")
	}
	return c.JSON(http.StatusOK, map[string]interface{}{
		"devices":   result,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

func (h DevicesHandler) SearchDevices(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "device service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:read"); err != nil {
		return err
	}

	query := strings.TrimSpace(c.QueryParam("q"))
	limit := parseIntDefault(c.QueryParam("limit"), 10)
	if limit <= 0 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}

	if query == "" {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"devices":   []interface{}{},
			"total":     0,
			"page":      1,
			"page_size": limit,
		})
	}

	result, total, err := h.Service.GetDevices(
		c.Request().Context(),
		1,
		limit,
		"",
		"",
		nil,
		query,
		nil,
		true,
	)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to search devices")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"devices":   result,
		"total":     total,
		"page":      1,
		"page_size": limit,
	})
}

func (h DevicesHandler) CreateDevice(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "device service not configured")
	}
	user, err := requirePermission(c, h.Auth, "devices:create")
	if err != nil {
		return err
	}

	var req devices.DeviceCreateRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	createdBy := ""
	if user != nil {
		createdBy = user.ID
	}

	device, err := h.Service.CreateDevice(c.Request().Context(), req, createdBy)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	return c.JSON(http.StatusOK, device)
}

func (h DevicesHandler) GetDevice(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "device service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:read"); err != nil {
		return err
	}

	deviceID, err := strconv.Atoi(c.Param("device_id"))
	if err != nil || deviceID <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid device_id")
	}

	device, err := h.Service.GetDeviceByID(c.Request().Context(), deviceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "device not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query device")
	}

	return c.JSON(http.StatusOK, device)
}

func (h DevicesHandler) UpdateDevice(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "device service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:update"); err != nil {
		return err
	}

	deviceID, err := strconv.Atoi(c.Param("device_id"))
	if err != nil || deviceID <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid device_id")
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	updates := buildDeviceUpdates(payload)
	if len(updates) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "no updates provided")
	}

	device, err := h.Service.UpdateDevice(c.Request().Context(), deviceID, updates)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "device not found")
		}
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	return c.JSON(http.StatusOK, device)
}

func (h DevicesHandler) DeleteDevice(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "device service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:delete"); err != nil {
		return err
	}

	deviceID, err := strconv.Atoi(c.Param("device_id"))
	if err != nil || deviceID <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid device_id")
	}

	if err := h.Service.DeleteDevice(c.Request().Context(), deviceID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "device not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete device")
	}
	return c.JSON(http.StatusOK, map[string]interface{}{
		"message": "device deleted",
	})
}

func (h DevicesHandler) GetDeviceGroups(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "device service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:read"); err != nil {
		return err
	}

	groups, err := h.Service.GetDeviceGroups(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query groups")
	}
	return c.JSON(http.StatusOK, groups)
}

func (h DevicesHandler) GetDeviceStatistics(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "device service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:read"); err != nil {
		return err
	}

	stats, err := h.Service.GetDeviceStatistics(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query statistics")
	}
	return c.JSON(http.StatusOK, stats)
}

func buildDeviceUpdates(payload map[string]interface{}) map[string]interface{} {
	updates := map[string]interface{}{}

	for _, key := range []string{"name", "ip_address", "device_type", "vendor", "model", "location", "description", "status"} {
		if value, ok := payload[key]; ok {
			if value == nil {
				updates[key] = nil
				continue
			}
			if text, ok := value.(string); ok {
				updates[key] = strings.TrimSpace(text)
			}
		}
	}

	if value, ok := payload["group_id"]; ok {
		if value == nil {
			updates["group_id"] = nil
		} else if num, ok := value.(float64); ok {
			updates["group_id"] = int(num)
		}
	}

	if value, ok := payload["is_active"]; ok {
		if flag, ok := value.(bool); ok {
			updates["is_active"] = flag
		}
	}

	for _, key := range []string{"snmp_community", "snmp_version", "ssh_username", "ssh_password", "cli_protocol", "telnet_username", "telnet_password", "enable_password"} {
		if value, ok := payload[key]; ok {
			if value == nil {
				updates[key] = nil
				continue
			}
			if text, ok := value.(string); ok {
				updates[key] = strings.TrimSpace(text)
			}
		}
	}

	if value, ok := payload["ssh_port"]; ok {
		if value == nil {
			updates["ssh_port"] = nil
		} else if num, ok := value.(float64); ok {
			updates["ssh_port"] = int(num)
		}
	}

	if value, ok := payload["snmp_port"]; ok {
		if value == nil {
			updates["snmp_port"] = nil
		} else if num, ok := value.(float64); ok {
			updates["snmp_port"] = int(num)
		}
	}

	if value, ok := payload["telnet_port"]; ok {
		if value == nil {
			updates["telnet_port"] = nil
		} else if num, ok := value.(float64); ok {
			updates["telnet_port"] = int(num)
		}
	}

	if value, ok := payload["tags"]; ok {
		updates["tags"] = value
	}

	return updates
}
