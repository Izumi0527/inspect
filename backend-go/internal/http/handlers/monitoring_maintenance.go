package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/http/middleware"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

func mapMaintenanceServiceError(err error) error {
	switch {
	case errors.Is(err, monitoring.ErrMaintenanceNotFound):
		return echo.NewHTTPError(http.StatusNotFound, err.Error())
	case errors.Is(err, monitoring.ErrMaintenanceValidation):
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	default:
		return echo.NewHTTPError(http.StatusInternalServerError, "internal maintenance window error")
	}
}

// ListMonitoringMaintenances 返回全部计划维护窗口列表。
func (h MonitoringHandler) ListMonitoringMaintenances(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringReadPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}
	items, err := h.Writer.ListMaintenances(c.Request().Context())
	if err != nil {
		return mapMaintenanceServiceError(err)
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"items": items})
}

// GetMonitoringMaintenance 返回单条计划维护窗口详情。
func (h MonitoringHandler) GetMonitoringMaintenance(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringReadPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}
	id, err := parsePositiveIDParam(c, "id")
	if err != nil {
		return err
	}
	item, err := h.Writer.GetMaintenance(c.Request().Context(), id)
	if err != nil {
		return mapMaintenanceServiceError(err)
	}
	return c.JSON(http.StatusOK, item)
}

// CreateMonitoringMaintenance 创建计划维护窗口。
func (h MonitoringHandler) CreateMonitoringMaintenance(c echo.Context) error {
	user, err := requirePermission(c, h.Auth, monitoringControlPermission)
	if err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}
	var req monitoring.MaintenanceInput
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	createdBy := ""
	if user != nil {
		createdBy = user.ID
	}
	item, err := h.Writer.CreateMaintenance(c.Request().Context(), req, createdBy)
	if err != nil {
		return mapMaintenanceServiceError(err)
	}
	middleware.SetAuditDetails(c, map[string]interface{}{
		"maintenance_id": item.ID,
		"name":           item.Name,
		"mode":           item.Mode,
		"schedule_type":  item.ScheduleType,
		"targets_count":  len(item.Targets),
	})
	return c.JSON(http.StatusCreated, item)
}

// UpdateMonitoringMaintenance 更新计划维护窗口。
func (h MonitoringHandler) UpdateMonitoringMaintenance(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringControlPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}
	id, err := parsePositiveIDParam(c, "id")
	if err != nil {
		return err
	}
	var req monitoring.MaintenanceInput
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	item, err := h.Writer.UpdateMaintenance(c.Request().Context(), id, req)
	if err != nil {
		return mapMaintenanceServiceError(err)
	}
	middleware.SetAuditDetails(c, map[string]interface{}{
		"maintenance_id": item.ID,
		"name":           item.Name,
		"mode":           item.Mode,
		"schedule_type":  item.ScheduleType,
		"enabled":        item.Enabled,
		"targets_count":  len(item.Targets),
	})
	return c.JSON(http.StatusOK, item)
}

// DeleteMonitoringMaintenance 删除计划维护窗口。
func (h MonitoringHandler) DeleteMonitoringMaintenance(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringControlPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}
	id, err := parsePositiveIDParam(c, "id")
	if err != nil {
		return err
	}
	if err := h.Writer.DeleteMaintenance(c.Request().Context(), id); err != nil {
		return mapMaintenanceServiceError(err)
	}
	middleware.SetAuditDetails(c, map[string]interface{}{
		"maintenance_id": id,
		"deleted":        true,
	})
	return c.JSON(http.StatusOK, map[string]interface{}{"success": true})
}

// GetActiveMonitoringMaintenances 查询当前生效中的维护窗口映射（支持按 device_ids / group_ids 过滤）。
func (h MonitoringHandler) GetActiveMonitoringMaintenances(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringReadPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	now := time.Now().UTC()
	ctx := c.Request().Context()
	deviceMap, err := h.Writer.GetActiveMaintenanceMapForDevices(ctx, now)
	if err != nil {
		return mapMaintenanceServiceError(err)
	}

	params := c.QueryParams()
	deviceIDs := parseIntList(append(append(params["device_ids"], params["device_ids[]"]...), params["device_id"]...))
	groupIDs := parseIntList(append(append(params["group_ids"], params["group_ids[]"]...), params["group_id"]...))

	filteredDevices := make(map[int]monitoring.ActiveMaintenance)
	if len(deviceIDs) > 0 {
		for _, did := range deviceIDs {
			if am, ok := deviceMap[did]; ok {
				filteredDevices[did] = am
			}
		}
	} else {
		filteredDevices = deviceMap
	}

	activeList, err := h.Writer.ListMaintenances(ctx)
	if err != nil {
		return mapMaintenanceServiceError(err)
	}
	groupSet := make(map[int64]bool, len(groupIDs))
	for _, gid := range groupIDs {
		groupSet[int64(gid)] = true
	}
	activeWindows := make([]monitoring.MaintenanceView, 0)
	for _, w := range activeList {
		if !w.IsActive {
			continue
		}
		if len(groupSet) > 0 {
			matched := false
			for _, t := range w.Targets {
				if strings.EqualFold(t.TargetType, monitoring.MaintenanceTargetDeviceGroup) && groupSet[t.TargetID] {
					matched = true
					break
				}
			}
			if !matched {
				continue
			}
		}
		activeWindows = append(activeWindows, w)
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"active_windows": activeWindows,
		"device_map":     filteredDevices,
		"checked_at":     now.Format(time.RFC3339),
	})
}
