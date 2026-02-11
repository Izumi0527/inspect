package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

type DevicesHandler struct {
	Service       *devices.Service
	Scanner       *devices.Scanner
	Probe         *devices.ProbeService
	SNMPCollector *devices.SNMPCollector
	Inspection    *inspection.Service
	Metrics       *monitoring.MetricsWriter
	Auth          *auth.Service
}

func (h DevicesHandler) Register(group *echo.Group) {
	group.GET("/devices", h.GetDevices)
	group.POST("/devices", h.CreateDevice)
	group.GET("/devices/:device_id", h.GetDevice)
	group.PUT("/devices/:device_id", h.UpdateDevice)
	group.DELETE("/devices/:device_id", h.DeleteDevice)
	group.GET("/devices/groups", h.GetDeviceGroups)
	group.POST("/devices/scan", h.StartNetworkScan)
	group.GET("/devices/scan/:scan_id", h.GetScanResult)
	group.GET("/devices/scan/:scan_id/devices", h.GetScanDevices)
	group.GET("/devices/scans", h.GetScanList)
	group.DELETE("/devices/scan/:scan_id", h.StopScan)
	group.POST("/devices/batch-import", h.BatchImportDevices)
	group.POST("/devices/scan/:scan_id/import", h.ImportScanDevices)
	group.POST("/devices/batch-delete", h.BatchDeleteDevices)
	group.POST("/devices/bulk-action", h.BulkAction)
	group.POST("/devices/batch-update", h.BatchUpdateDevices)
	group.GET("/devices/statistics", h.GetDeviceStatistics)
	group.POST("/devices/:device_id/health-check", h.HealthCheckDevice)
	group.GET("/devices/:device_id/performance", h.GetDevicePerformance)
	group.POST("/devices/:device_id/probe", h.ProbeDevice)
	group.POST("/devices/:device_id/collect-metrics", h.CollectDeviceMetrics)
	group.POST("/devices/batch-probe", h.BatchProbeDevices)
	group.POST("/devices/batch-collect-metrics", h.BatchCollectMetrics)
}

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

func (h DevicesHandler) StartNetworkScan(c echo.Context) error {
	if h.Scanner == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "scanner not configured")
	}
	user, err := requirePermission(c, h.Auth, "devices:create")
	if err != nil {
		return err
	}

	var req devices.NetworkScanRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if strings.TrimSpace(req.TargetNetwork) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "target_network is required")
	}

	var createdBy *string
	if user != nil && strings.TrimSpace(user.ID) != "" {
		createdBy = &user.ID
	}
	scanID, err := h.Scanner.StartScan(c.Request().Context(), req, createdBy)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, devices.NetworkScanResponse{
		ScanID:        scanID,
		Message:       "network scan started",
		TargetNetwork: req.TargetNetwork,
		ScanType:      req.ScanType,
		Status:        "running",
	})
}

func (h DevicesHandler) GetScanResult(c echo.Context) error {
	if h.Scanner == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "scanner not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:read"); err != nil {
		return err
	}

	scanID := strings.TrimSpace(c.Param("scan_id"))
	if scanID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "scan_id is required")
	}

	scan, err := h.Scanner.GetScan(c.Request().Context(), scanID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "scan not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query scan")
	}

	startedAt := time.Now().UTC()
	if scan.StartedAt != nil {
		startedAt = *scan.StartedAt
	}

	return c.JSON(http.StatusOK, devices.ScanResultResponse{
		ScanID:            scan.ID,
		TargetNetwork:     scan.TargetNetwork,
		ScanType:          scan.ScanType,
		Status:            scan.Status,
		StartedAt:         startedAt,
		CompletedAt:       scan.CompletedAt,
		DevicesFound:      scan.DevicesFound,
		TotalHostsScanned: scan.TotalHosts,
		ErrorMessage:      scan.ErrorMessage,
	})
}

func (h DevicesHandler) GetScanDevices(c echo.Context) error {
	if h.Scanner == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "scanner not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:read"); err != nil {
		return err
	}

	scanID := strings.TrimSpace(c.Param("scan_id"))
	if scanID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "scan_id is required")
	}

	devicesFound, err := h.Scanner.GetDiscoveredDevices(c.Request().Context(), scanID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query discovered devices")
	}

	result := make([]devices.DiscoveredDeviceResponse, 0, len(devicesFound))
	for _, item := range devicesFound {
		openPorts := decodeJSONList(item.OpenPorts)
		services := decodeJSONMap(item.Services)
		result = append(result, devices.DiscoveredDeviceResponse{
			IPAddress:     item.IPAddress,
			Hostname:      item.Hostname,
			MacAddress:    item.MacAddress,
			Vendor:        item.Vendor,
			DeviceType:    item.DeviceType,
			OpenPorts:     openPorts,
			Services:      services,
			ResponseTime:  item.ResponseTime,
			LastSeen:      item.DiscoveredAt,
			OSInfo:        item.OSInfo,
			SnmpAvailable: containsPort(openPorts, 161),
		})
	}

	return c.JSON(http.StatusOK, result)
}

func (h DevicesHandler) GetScanList(c echo.Context) error {
	if h.Scanner == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "scanner not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:read"); err != nil {
		return err
	}

	status := strings.TrimSpace(c.QueryParam("status"))
	limit := parseIntDefault(c.QueryParam("limit"), 20)

	scans, err := h.Scanner.ListScans(c.Request().Context(), status, limit)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query scans")
	}

	result := make([]devices.ScanResultResponse, 0, len(scans))
	for _, scan := range scans {
		startedAt := time.Now().UTC()
		if scan.StartedAt != nil {
			startedAt = *scan.StartedAt
		}
		result = append(result, devices.ScanResultResponse{
			ScanID:            scan.ID,
			TargetNetwork:     scan.TargetNetwork,
			ScanType:          scan.ScanType,
			Status:            scan.Status,
			StartedAt:         startedAt,
			CompletedAt:       scan.CompletedAt,
			DevicesFound:      scan.DevicesFound,
			TotalHostsScanned: scan.TotalHosts,
			ErrorMessage:      scan.ErrorMessage,
		})
	}

	return c.JSON(http.StatusOK, result)
}

func (h DevicesHandler) StopScan(c echo.Context) error {
	if h.Scanner == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "scanner not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:update"); err != nil {
		return err
	}

	scanID := strings.TrimSpace(c.Param("scan_id"))
	if scanID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "scan_id is required")
	}

	if !h.Scanner.StopScan(c.Request().Context(), scanID) {
		return echo.NewHTTPError(http.StatusNotFound, "scan not found or cannot stop")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message": "scan stopped",
		"scan_id": scanID,
	})
}

func (h DevicesHandler) BatchImportDevices(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "device service not configured")
	}
	user, err := requirePermission(c, h.Auth, "devices:create")
	if err != nil {
		return err
	}

	var req devices.DeviceBatchImportRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	createdBy := ""
	if user != nil {
		createdBy = user.ID
	}

	imported, skipped, err := h.Service.BatchCreateDevices(c.Request().Context(), req.Devices, createdBy, req.SkipDuplicates)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to import devices")
	}

	resp := devices.DeviceBatchImportResponse{
		Message:         fmt.Sprintf("imported %d devices", len(imported)),
		ImportedCount:   len(imported),
		SkippedCount:    len(skipped),
		ImportedDevices: imported,
		SkippedDevices:  skipped,
	}

	return c.JSON(http.StatusOK, resp)
}

func (h DevicesHandler) ImportScanDevices(c echo.Context) error {
	if h.Service == nil || h.Scanner == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "device service not configured")
	}
	user, err := requirePermission(c, h.Auth, "devices:create")
	if err != nil {
		return err
	}

	scanID := strings.TrimSpace(c.Param("scan_id"))
	if scanID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "scan_id is required")
	}

	scan, err := h.Scanner.GetScan(c.Request().Context(), scanID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "scan not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query scan")
	}
	if scan.Status != "completed" {
		return echo.NewHTTPError(http.StatusBadRequest, "scan is not completed")
	}

	var deviceIPs []string
	if err := c.Bind(&deviceIPs); err != nil && !errors.Is(err, io.EOF) {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	autoAssign := parseBoolDefault(c.QueryParam("auto_assign_names"), true)
	defaultGroupID := parseOptionalInt(c.QueryParam("default_group_id"))

	discovered, err := h.Scanner.GetDiscoveredDevices(c.Request().Context(), scanID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load scan devices")
	}
	if len(discovered) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "no devices found")
	}

	filtered := filterDiscoveredDevices(discovered, deviceIPs)
	if len(filtered) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "no devices matched")
	}

	createdBy := ""
	if user != nil {
		createdBy = user.ID
	}

	imported := make([]devices.DeviceResponse, 0)
	skipped := make([]devices.SkippedDevice, 0)

	for _, item := range filtered {
		name := buildImportedDeviceName(item, autoAssign)
		deviceType := "unknown"
		if item.DeviceType != nil && strings.TrimSpace(*item.DeviceType) != "" {
			deviceType = strings.TrimSpace(*item.DeviceType)
		}
		vendor := "other"
		if item.Vendor != nil && strings.TrimSpace(*item.Vendor) != "" {
			vendor = strings.TrimSpace(*item.Vendor)
		}

		var community *string
		if containsPort(decodeJSONList(item.OpenPorts), 161) {
			value := "public"
			community = ptrString(value)
		}
		snmpVersion := ptrString("2c")

		req := devices.DeviceCreateRequest{
			Name:          name,
			IPAddress:     item.IPAddress,
			DeviceType:    deviceType,
			Vendor:        vendor,
			GroupID:       defaultGroupID,
			SnmpCommunity: community,
			SnmpVersion:   snmpVersion,
			Description:   ptrString(fmt.Sprintf("Imported from scan %s", scanID)),
		}

		device, err := h.Service.CreateDevice(c.Request().Context(), req, createdBy)
		if err != nil {
			skipped = append(skipped, devices.SkippedDevice{IPAddress: item.IPAddress, Reason: err.Error()})
			continue
		}
		imported = append(imported, *device)
		_ = h.Scanner.MarkDiscoveredImported(c.Request().Context(), scanID, item.IPAddress, device.ID)
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message":          fmt.Sprintf("imported %d devices", len(imported)),
		"scan_id":          scanID,
		"imported_count":   len(imported),
		"skipped_count":    len(skipped),
		"imported_devices": imported,
		"skipped_devices":  skipped,
	})
}

func (h DevicesHandler) BatchDeleteDevices(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "device service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:delete"); err != nil {
		return err
	}

	var deviceIDs []int
	if err := c.Bind(&deviceIDs); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if len(deviceIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "device_ids is required")
	}

	deleted := 0
	failed := make([]map[string]interface{}, 0)
	for _, id := range deviceIDs {
		if err := h.Service.DeleteDevice(c.Request().Context(), id); err != nil {
			failed = append(failed, map[string]interface{}{
				"device_id": id,
				"error":     err.Error(),
			})
			continue
		}
		deleted++
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success":      true,
		"message":      fmt.Sprintf("deleted %d devices", deleted),
		"deleted_count": deleted,
		"failed_count": len(failed),
		"failed_items": failed,
	})
}

func (h DevicesHandler) BulkAction(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "device service not configured")
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	action := strings.ToLower(strings.TrimSpace(readStringValue(payload["action"])))
	if action == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "action is required")
	}

	deviceIDs := parseIntListFromPayload(payload["device_ids"])
	if len(deviceIDs) == 0 {
		deviceIDs = parseIntListFromPayload(payload["deviceIds"])
	}
	if len(deviceIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "device_ids is required")
	}

	ctx := c.Request().Context()
	nameMap := h.loadDeviceNameMap(ctx, deviceIDs)

	switch action {
	case "batch_delete":
		if _, err := requirePermission(c, h.Auth, "devices:delete"); err != nil {
			return err
		}
		result := h.executeBulkDelete(ctx, deviceIDs, nameMap)
		return c.JSON(http.StatusOK, buildBulkActionResponse(result))
	case "batch_update":
		if _, err := requirePermission(c, h.Auth, "devices:update"); err != nil {
			return err
		}
		updatesRaw, ok := readUpdatesPayload(payload)
		if !ok {
			return echo.NewHTTPError(http.StatusBadRequest, "updates is required")
		}
		updates := buildDeviceUpdates(updatesRaw)
		if len(updates) == 0 {
			return echo.NewHTTPError(http.StatusBadRequest, "no updates provided")
		}
		result := h.executeBulkUpdate(ctx, deviceIDs, updates, nameMap, "批量更新完成")
		return c.JSON(http.StatusOK, buildBulkActionResponse(result))
	case "batch_add_group":
		if _, err := requirePermission(c, h.Auth, "devices:update"); err != nil {
			return err
		}
		groupID, ok := toInt(payload["group_id"])
		if !ok {
			groupID, ok = toInt(payload["groupId"])
		}
		if !ok || groupID <= 0 {
			return echo.NewHTTPError(http.StatusBadRequest, "group_id is required")
		}
		result := h.executeBulkUpdate(ctx, deviceIDs, map[string]interface{}{"group_id": groupID}, nameMap, "批量分组完成")
		return c.JSON(http.StatusOK, buildBulkActionResponse(result))
	case "batch_remove_group":
		if _, err := requirePermission(c, h.Auth, "devices:update"); err != nil {
			return err
		}
		result := h.executeBulkUpdate(ctx, deviceIDs, map[string]interface{}{"group_id": nil}, nameMap, "批量移除分组完成")
		return c.JSON(http.StatusOK, buildBulkActionResponse(result))
	case "start_inspection":
		user, err := requirePermission(c, h.Auth, "inspections:execute")
		if err != nil {
			return err
		}
		result := h.executeStartInspection(ctx, deviceIDs, payload, user)
		return c.JSON(http.StatusOK, buildBulkActionResponse(result))
	case "batch_config":
		if _, err := requirePermission(c, h.Auth, "devices:update"); err != nil {
			return err
		}
		updatesRaw, ok := readUpdatesPayload(payload)
		if !ok {
			return echo.NewHTTPError(http.StatusBadRequest, "updates is required")
		}
		updates := buildDeviceUpdates(updatesRaw)
		if len(updates) == 0 {
			return echo.NewHTTPError(http.StatusBadRequest, "no updates provided")
		}
		result := h.executeBulkUpdate(ctx, deviceIDs, updates, nameMap, "批量配置完成")
		return c.JSON(http.StatusOK, buildBulkActionResponse(result))
	default:
		return echo.NewHTTPError(http.StatusBadRequest, "unsupported action")
	}
}

func (h DevicesHandler) BatchUpdateDevices(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "device service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:update"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	deviceIDs := parseIntListFromPayload(payload["device_ids"])
	if len(deviceIDs) == 0 {
		deviceIDs = parseIntListFromPayload(payload["deviceIds"])
	}
	if len(deviceIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "device_ids is required")
	}

	updatesRaw, ok := readUpdatesPayload(payload)
	if !ok {
		return echo.NewHTTPError(http.StatusBadRequest, "updates is required")
	}

	updates := buildDeviceUpdates(updatesRaw)
	if len(updates) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "no updates provided")
	}

	ctx := c.Request().Context()
	nameMap := h.loadDeviceNameMap(ctx, deviceIDs)
	result := h.executeBulkUpdate(ctx, deviceIDs, updates, nameMap, "批量更新完成")

	return c.JSON(http.StatusOK, buildBulkActionResponse(result))
}

func (h DevicesHandler) HealthCheckDevice(c echo.Context) error {
	if h.Service == nil || h.Probe == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "probe service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:read"); err != nil {
		return err
	}

	deviceID, err := parseIDParam(c, "device_id")
	if err != nil {
		return err
	}

	updateStatus := parseBoolDefault(c.QueryParam("update_status"), true)
	device, err := h.Service.GetDeviceRecord(c.Request().Context(), deviceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "device not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query device")
	}

	result, err := h.Probe.ProbeDevice(
		c.Request().Context(),
		device.ID,
		device.IPAddress,
		device.SnmpCommunity,
		device.SnmpVersion,
		device.SnmpPort,
		device.Tags,
		false,
	)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "health check failed")
	}

	status, icmpStatus, snmpStatus := buildProbeStatuses(result)
	if updateStatus {
		_ = h.Service.UpdateDeviceProbeStatus(
			c.Request().Context(),
			device.ID,
			status,
			icmpStatus,
			snmpStatus,
			result.IcmpResponseTime,
			conditionalLastSeen(result),
			&result.ProbedAt,
		)
	}

	response := map[string]interface{}{
		"device_id":          result.DeviceID,
		"device_name":        device.Name,
		"ip_address":         result.IPAddress,
		"status":             status,
		"icmp_status":        icmpStatus,
		"snmp_status":        snmpStatus,
		"icmp_reachable":     result.IcmpReachable,
		"icmp_response_time": result.IcmpResponseTime,
		"icmp_error":         result.IcmpError,
		"snmp_reachable":     result.SnmpReachable,
		"snmp_response_time": result.SnmpResponseTime,
		"snmp_error":         result.SnmpError,
		"snmp_system_info":   result.SnmpSystemInfo,
		"probed_at":          result.ProbedAt,
	}

	return c.JSON(http.StatusOK, response)
}

func (h DevicesHandler) GetDevicePerformance(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "device service not configured")
	}
	if h.Metrics == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:read"); err != nil {
		return err
	}

	deviceID, err := parseIDParam(c, "device_id")
	if err != nil {
		return err
	}

	device, err := h.Service.GetDeviceRecord(c.Request().Context(), deviceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "device not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query device")
	}

	current, err := h.Metrics.GetDeviceMetrics(c.Request().Context(), deviceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query device performance")
	}

	timeRange := strings.TrimSpace(c.QueryParam("time_range"))
	history := make([]monitoring.HistoryPoint, 0)
	var startTime time.Time
	var endTime time.Time
	if timeRange != "" {
		startTime, endTime, err = parseTimeRangeParam(timeRange)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		metrics := []string{"cpu_usage", "memory_usage", "bandwidth_in", "bandwidth_out", "network_traffic"}
		history, err = h.Metrics.GetDeviceMetricsHistory(c.Request().Context(), deviceID, startTime, endTime, metrics)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to query device performance history")
		}
	}

	response := map[string]interface{}{
		"device_id":   device.ID,
		"device_name": device.Name,
		"ip_address":  device.IPAddress,
		"status":      device.Status,
		"current":     current,
		"history":     history,
	}
	if timeRange != "" {
		response["time_range"] = timeRange
		response["start_time"] = startTime.UTC().Format(time.RFC3339Nano)
		response["end_time"] = endTime.UTC().Format(time.RFC3339Nano)
	}

	return c.JSON(http.StatusOK, response)
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

func (h DevicesHandler) ProbeDevice(c echo.Context) error {
	if h.Service == nil || h.Probe == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "probe service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:read"); err != nil {
		return err
	}

	deviceID, err := strconv.Atoi(c.Param("device_id"))
	if err != nil || deviceID <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid device_id")
	}

	updateStatus := parseBoolDefault(c.QueryParam("update_status"), true)
	device, err := h.Service.GetDeviceRecord(c.Request().Context(), deviceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "device not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query device")
	}

	result, err := h.Probe.ProbeDevice(
		c.Request().Context(),
		device.ID,
		device.IPAddress,
		device.SnmpCommunity,
		device.SnmpVersion,
		device.SnmpPort,
		device.Tags,
		false,
	)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "probe failed")
	}

	if updateStatus {
		status, icmpStatus, snmpStatus := buildProbeStatuses(result)
		_ = h.Service.UpdateDeviceProbeStatus(
			c.Request().Context(),
			device.ID,
			status,
			icmpStatus,
			snmpStatus,
			result.IcmpResponseTime,
			conditionalLastSeen(result),
			&result.ProbedAt,
		)
	}

	resp := devices.DeviceProbeResponse{
		DeviceID:         result.DeviceID,
		IPAddress:        result.IPAddress,
		IcmpReachable:    result.IcmpReachable,
		IcmpResponseTime: result.IcmpResponseTime,
		IcmpError:        result.IcmpError,
		SnmpReachable:    result.SnmpReachable,
		SnmpResponseTime: result.SnmpResponseTime,
		SnmpError:        result.SnmpError,
		SnmpSystemInfo:   result.SnmpSystemInfo,
		ProbedAt:         result.ProbedAt,
	}
	return c.JSON(http.StatusOK, resp)
}

func (h DevicesHandler) BatchProbeDevices(c echo.Context) error {
	if h.Service == nil || h.Probe == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "probe service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:read"); err != nil {
		return err
	}

	var req devices.DeviceBatchProbeRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if len(req.DeviceIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "device_ids is required")
	}

	updateStatus := parseBoolDefault(c.QueryParam("update_status"), true)

	deviceRows, err := h.Service.GetDevicesByIDs(c.Request().Context(), req.DeviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query devices")
	}
	if len(deviceRows) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "no devices found")
	}

	targets := make([]devices.ProbeTarget, 0, len(deviceRows))
	for _, device := range deviceRows {
		targets = append(targets, devices.ProbeTarget{
			ID:            device.ID,
			IPAddress:     device.IPAddress,
			SnmpCommunity: device.SnmpCommunity,
			SnmpVersion:   device.SnmpVersion,
			SnmpPort:      device.SnmpPort,
			Tags:          device.Tags,
		})
	}

	results := h.Probe.BatchProbeDevices(c.Request().Context(), targets, req.MaxConcurrent)
	response := make([]devices.DeviceProbeResponse, 0, len(results))
	for _, result := range results {
		response = append(response, devices.DeviceProbeResponse{
			DeviceID:         result.DeviceID,
			IPAddress:        result.IPAddress,
			IcmpReachable:    result.IcmpReachable,
			IcmpResponseTime: result.IcmpResponseTime,
			IcmpError:        result.IcmpError,
			SnmpReachable:    result.SnmpReachable,
			SnmpResponseTime: result.SnmpResponseTime,
			SnmpError:        result.SnmpError,
			SnmpSystemInfo:   result.SnmpSystemInfo,
			ProbedAt:         result.ProbedAt,
		})

		if updateStatus {
			status, icmpStatus, snmpStatus := buildProbeStatuses(result)
			_ = h.Service.UpdateDeviceProbeStatus(
				c.Request().Context(),
				result.DeviceID,
				status,
				icmpStatus,
				snmpStatus,
				result.IcmpResponseTime,
				conditionalLastSeen(result),
				&result.ProbedAt,
			)
		}
	}

	return c.JSON(http.StatusOK, devices.DeviceBatchProbeResponse{
		Total:   len(req.DeviceIDs),
		Probed:  len(response),
		Results: response,
	})
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

func parsePageParams(c echo.Context) (int, int) {
	page := parseIntDefault(c.QueryParam("page"), 0)
	pageSize := parseIntDefault(c.QueryParam("page_size"), 0)

	if page > 0 && pageSize > 0 {
		return page, pageSize
	}

	skip := parseIntDefault(c.QueryParam("skip"), 0)
	limit := parseIntDefault(c.QueryParam("limit"), 100)
	if limit <= 0 {
		limit = 100
	}
	page = skip/limit + 1
	pageSize = limit
	return page, pageSize
}

func parseIntDefault(raw string, fallback int) int {
	value := strings.TrimSpace(raw)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func parseOptionalInt(raw string) *int {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return nil
	}
	return &parsed
}

func parseBoolDefault(raw string, fallback bool) bool {
	value := strings.TrimSpace(raw)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func buildProbeStatuses(result devices.ProbeResult) (string, string, string) {
	status := "offline"
	icmpStatus := "offline"
	if result.IcmpReachable {
		status = "online"
		icmpStatus = "online"
	}

	snmpStatus := "failed"
	if result.SnmpReachable {
		snmpStatus = "success"
	} else if result.SnmpError != nil && strings.Contains(strings.ToLower(*result.SnmpError), "not configured") {
		snmpStatus = "not_configured"
	}

	return status, icmpStatus, snmpStatus
}

func conditionalLastSeen(result devices.ProbeResult) *time.Time {
	if result.IcmpReachable {
		t := result.ProbedAt
		return &t
	}
	return nil
}

func filterDiscoveredDevices(items []devices.DiscoveredDevice, ips []string) []devices.DiscoveredDevice {
	if len(ips) == 0 {
		return items
	}
	allowed := map[string]struct{}{}
	for _, ip := range ips {
		ip = strings.TrimSpace(ip)
		if ip == "" {
			continue
		}
		allowed[ip] = struct{}{}
	}
	if len(allowed) == 0 {
		return []devices.DiscoveredDevice{}
	}

	result := make([]devices.DiscoveredDevice, 0)
	for _, item := range items {
		if _, ok := allowed[item.IPAddress]; ok {
			result = append(result, item)
		}
	}
	return result
}

func buildImportedDeviceName(item devices.DiscoveredDevice, autoAssign bool) string {
	if autoAssign {
		if item.Hostname != nil && strings.TrimSpace(*item.Hostname) != "" {
			return strings.TrimSpace(*item.Hostname)
		}
		if item.DeviceType != nil && item.Vendor != nil && strings.TrimSpace(*item.DeviceType) != "" && strings.TrimSpace(*item.Vendor) != "" {
			return fmt.Sprintf("%s_%s_%s", *item.Vendor, *item.DeviceType, strings.ReplaceAll(item.IPAddress, ".", "_"))
		}
		return fmt.Sprintf("Device_%s", strings.ReplaceAll(item.IPAddress, ".", "_"))
	}
	return fmt.Sprintf("Imported_%s", strings.ReplaceAll(item.IPAddress, ".", "_"))
}

func decodeJSONList(raw datatypes.JSON) []int {
	if len(raw) == 0 {
		return []int{}
	}
	var parsed []int
	if err := json.Unmarshal(raw, &parsed); err == nil {
		return parsed
	}
	return []int{}
}

func decodeJSONMap(raw datatypes.JSON) map[string]interface{} {
	if len(raw) == 0 {
		return map[string]interface{}{}
	}
	var parsed map[string]interface{}
	if err := json.Unmarshal(raw, &parsed); err == nil {
		return parsed
	}
	return map[string]interface{}{}
}

func containsPort(ports []int, port int) bool {
	for _, value := range ports {
		if value == port {
			return true
		}
	}
	return false
}

func ptrString(value string) *string {
	return &value
}

type bulkActionResult struct {
	Success   bool
	Processed int
	Failed    int
	Errors    []map[string]interface{}
	Message   string
}

func buildBulkActionResponse(result bulkActionResult) map[string]interface{} {
	message := strings.TrimSpace(result.Message)
	if message == "" {
		message = "操作完成"
	}
	data := map[string]interface{}{
		"success":         result.Success,
		"processed_count": result.Processed,
		"failed_count":    result.Failed,
		"errors":          result.Errors,
		"message":         message,
	}

	return map[string]interface{}{
		"success": result.Success,
		"status":  http.StatusOK,
		"message": message,
		"data":    data,
	}
}

func (h DevicesHandler) executeBulkDelete(
	ctx context.Context,
	deviceIDs []int,
	nameMap map[int]string,
) bulkActionResult {
	processed := 0
	errorsList := make([]map[string]interface{}, 0)

	for _, id := range deviceIDs {
		if err := h.Service.DeleteDevice(ctx, id); err != nil {
			message := err.Error()
			if errors.Is(err, gorm.ErrRecordNotFound) {
				message = "device not found"
			}
			errorsList = append(errorsList, map[string]interface{}{
				"device_id":   id,
				"device_name": nameMap[id],
				"error":       message,
			})
			continue
		}
		processed++
	}

	message := "批量删除完成"
	if len(errorsList) > 0 {
		message = "批量删除部分失败"
	}

	return bulkActionResult{
		Success:   len(errorsList) == 0,
		Processed: processed,
		Failed:    len(errorsList),
		Errors:    errorsList,
		Message:   message,
	}
}

func (h DevicesHandler) executeBulkUpdate(
	ctx context.Context,
	deviceIDs []int,
	updates map[string]interface{},
	nameMap map[int]string,
	message string,
) bulkActionResult {
	processed := 0
	errorsList := make([]map[string]interface{}, 0)

	for _, id := range deviceIDs {
		if id <= 0 {
			continue
		}
		updatePayload := cloneMap(updates)
		if _, err := h.Service.UpdateDevice(ctx, id, updatePayload); err != nil {
			errMessage := err.Error()
			if errors.Is(err, gorm.ErrRecordNotFound) {
				errMessage = "device not found"
			}
			errorsList = append(errorsList, map[string]interface{}{
				"device_id":   id,
				"device_name": nameMap[id],
				"error":       errMessage,
			})
			continue
		}
		processed++
	}

	if strings.TrimSpace(message) == "" {
		message = "批量更新完成"
	}
	if len(errorsList) > 0 {
		message = message + "，部分失败"
	}

	return bulkActionResult{
		Success:   len(errorsList) == 0,
		Processed: processed,
		Failed:    len(errorsList),
		Errors:    errorsList,
		Message:   message,
	}
}

func (h DevicesHandler) executeStartInspection(
	ctx context.Context,
	deviceIDs []int,
	payload map[string]interface{},
	user *auth.UserRecord,
) bulkActionResult {
	if h.Inspection == nil {
		return bulkActionResult{
			Success:   false,
			Processed: 0,
			Failed:    len(deviceIDs),
			Errors:    buildBulkErrors(deviceIDs, nil, "巡检服务未配置"),
			Message:   "巡检服务未配置",
		}
	}

	name := strings.TrimSpace(readStringValue(payload["name"]))
	if name == "" {
		name = "批量巡检"
	}

	var templateID *int
	if value, ok := toInt(payload["template_id"]); ok && value > 0 {
		templateID = &value
	} else if value, ok := toInt(payload["templateId"]); ok && value > 0 {
		templateID = &value
	}

	createdBy := ""
	if user != nil {
		createdBy = user.ID
	}

	inspections, err := h.Inspection.CreateInspections(ctx, inspection.CreateInspectionInput{
		Name:       name,
		TemplateID: templateID,
		DeviceIDs:  deviceIDs,
		Trigger:    inspection.TriggerManual,
		CreatedBy:  stringPtr(createdBy),
	})
	if err != nil {
		return bulkActionResult{
			Success:   false,
			Processed: 0,
			Failed:    len(deviceIDs),
			Errors:    buildBulkErrors(deviceIDs, nil, err.Error()),
			Message:   "巡检任务创建失败",
		}
	}

	return bulkActionResult{
		Success:   true,
		Processed: len(inspections),
		Failed:    0,
		Errors:    []map[string]interface{}{},
		Message:   "巡检任务已创建",
	}
}

func (h DevicesHandler) loadDeviceNameMap(ctx context.Context, deviceIDs []int) map[int]string {
	result := map[int]string{}
	if h.Service == nil || len(deviceIDs) == 0 {
		return result
	}

	rows, err := h.Service.GetDevicesByIDs(ctx, deviceIDs)
	if err != nil {
		return result
	}
	for _, row := range rows {
		if strings.TrimSpace(row.Name) == "" {
			continue
		}
		result[row.ID] = row.Name
	}
	return result
}

func readUpdatesPayload(payload map[string]interface{}) (map[string]interface{}, bool) {
	raw, ok := payload["updates"]
	if !ok {
		return nil, false
	}
	if updates, ok := raw.(map[string]interface{}); ok {
		return updates, true
	}
	return nil, false
}

func buildBulkErrors(deviceIDs []int, nameMap map[int]string, message string) []map[string]interface{} {
	errorsList := make([]map[string]interface{}, 0, len(deviceIDs))
	for _, id := range deviceIDs {
		entry := map[string]interface{}{
			"device_id": id,
			"error":     message,
		}
		if nameMap != nil {
			if name := strings.TrimSpace(nameMap[id]); name != "" {
				entry["device_name"] = name
			}
		}
		errorsList = append(errorsList, entry)
	}
	return errorsList
}

func cloneMap(values map[string]interface{}) map[string]interface{} {
	if len(values) == 0 {
		return map[string]interface{}{}
	}
	result := make(map[string]interface{}, len(values))
	for key, value := range values {
		result[key] = value
	}
	return result
}

func parseTimeRangeParam(raw string) (time.Time, time.Time, error) {
	end := time.Now().UTC()
	value := strings.TrimSpace(raw)
	if value == "" {
		return end.Add(-24 * time.Hour), end, nil
	}

	if len(value) < 2 {
		return time.Time{}, time.Time{}, fmt.Errorf("时间范围无效")
	}

	unit := strings.ToLower(value[len(value)-1:])
	number := strings.TrimSpace(value[:len(value)-1])
	amount, err := strconv.Atoi(number)
	if err != nil || amount <= 0 {
		return time.Time{}, time.Time{}, fmt.Errorf("时间范围无效")
	}

	var duration time.Duration
	switch unit {
	case "m":
		duration = time.Minute
	case "h":
		duration = time.Hour
	case "d":
		duration = 24 * time.Hour
	case "w":
		duration = 7 * 24 * time.Hour
	default:
		return time.Time{}, time.Time{}, fmt.Errorf("时间范围无效")
	}

	start := end.Add(-time.Duration(amount) * duration)
	return start, end, nil
}

// CollectDeviceMetrics collects detailed SNMP metrics from a device and writes to database
func (h DevicesHandler) CollectDeviceMetrics(c echo.Context) error {
	if h.Service == nil || h.SNMPCollector == nil || h.Metrics == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics collection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:read"); err != nil {
		return err
	}

	deviceID, err := strconv.Atoi(c.Param("device_id"))
	if err != nil || deviceID <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid device_id")
	}

	device, err := h.Service.GetDeviceRecord(c.Request().Context(), deviceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "device not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query device")
	}

	// Collect metrics via SNMP
	metrics, err := h.SNMPCollector.CollectMetrics(
		c.Request().Context(),
		device.IPAddress,
		device.SnmpCommunity,
		device.SnmpVersion,
		device.SnmpPort,
		device.Tags,
	)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("metrics collection failed: %v", err))
	}

	// Build metrics map for writing to database
	metricsMap := make(map[string]monitoring.MetricValue)
	if metrics.CPUUsage != nil {
		metricsMap["cpu_usage"] = monitoring.MetricValue{Value: metrics.CPUUsage, Unit: stringPtr("%")}
	}
	if metrics.MemoryUsage != nil {
		metricsMap["memory_usage"] = monitoring.MetricValue{Value: metrics.MemoryUsage, Unit: stringPtr("%")}
	}
	if metrics.Temperature != nil {
		metricsMap["temperature"] = monitoring.MetricValue{Value: metrics.Temperature, Unit: stringPtr("°C")}
	}
	if metrics.Uptime != nil {
		uptimeFloat := float64(*metrics.Uptime)
		metricsMap["uptime"] = monitoring.MetricValue{Value: &uptimeFloat, Unit: stringPtr("seconds")}
	}
	if metrics.BandwidthIn != nil {
		bwIn := *metrics.BandwidthIn // 直接存储 bps
		metricsMap["bandwidth_in"] = monitoring.MetricValue{Value: &bwIn, Unit: stringPtr("bps")}
	}
	if metrics.BandwidthOut != nil {
		bwOut := *metrics.BandwidthOut // 直接存储 bps
		metricsMap["bandwidth_out"] = monitoring.MetricValue{Value: &bwOut, Unit: stringPtr("bps")}
	}

	// Build interface metrics
	interfaces := make([]map[string]interface{}, 0, len(metrics.Interfaces))
	for _, iface := range metrics.Interfaces {
		ifaceMap := map[string]interface{}{
			"name": iface.Name,
		}
		if iface.Description != "" {
			ifaceMap["description"] = iface.Description
		}
		if iface.Speed != nil {
			ifaceMap["ifHighSpeed"] = *iface.Speed
		}
		if iface.InOctets != nil {
			ifaceMap["ifHCInOctets"] = *iface.InOctets
		}
		if iface.OutOctets != nil {
			ifaceMap["ifHCOutOctets"] = *iface.OutOctets
		}
		if iface.InRate != nil {
			ifaceMap["bandwidth_in"] = *iface.InRate // 直接存储 bps
		}
		if iface.OutRate != nil {
			ifaceMap["bandwidth_out"] = *iface.OutRate // 直接存储 bps
		}
		interfaces = append(interfaces, ifaceMap)
	}

	// Write metrics to database
	collectedAt := monitoring.FlexibleTime{Time: metrics.CollectedAt}
	writeReq := monitoring.DeviceMetricsRequest{
		DeviceID:    deviceID,
		Metrics:     metricsMap,
		Interfaces:  interfaces,
		CollectedAt: &collectedAt,
	}

	result, err := h.Metrics.WriteDeviceMetrics(c.Request().Context(), writeReq)
	if err != nil && !errors.Is(err, monitoring.ErrNoMetrics) {
		return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("failed to write metrics: %v", err))
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success":           true,
		"device_id":         deviceID,
		"metrics_collected": metrics,
		"metrics_written":   result.DeviceMetrics,
		"interfaces_written": result.InterfaceMetrics,
		"collection_time_ms": metrics.CollectionTime,
	})
}

// BatchCollectMetrics collects metrics from multiple devices
func (h DevicesHandler) BatchCollectMetrics(c echo.Context) error {
	if h.Service == nil || h.SNMPCollector == nil || h.Metrics == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics collection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:read"); err != nil {
		return err
	}

	var req struct {
		DeviceIDs     []int `json:"device_ids"`
		MaxConcurrent int   `json:"max_concurrent"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if len(req.DeviceIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "device_ids is required")
	}
	if req.MaxConcurrent <= 0 {
		req.MaxConcurrent = 10
	}

	deviceRows, err := h.Service.GetDevicesByIDs(c.Request().Context(), req.DeviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query devices")
	}
	if len(deviceRows) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "no devices found")
	}

	type collectResult struct {
		DeviceID       int                    `json:"device_id"`
		DeviceName     string                 `json:"device_name"`
		Success        bool                   `json:"success"`
		Error          string                 `json:"error,omitempty"`
		MetricsWritten int                    `json:"metrics_written,omitempty"`
		Metrics        *devices.SNMPMetrics   `json:"metrics,omitempty"`
	}

	results := make([]collectResult, 0, len(deviceRows))
	successCount := 0

	// Process devices (could be parallelized with goroutines)
	for _, device := range deviceRows {
		result := collectResult{
			DeviceID:   device.ID,
			DeviceName: device.Name,
		}

		metrics, err := h.SNMPCollector.CollectMetrics(
			c.Request().Context(),
			device.IPAddress,
			device.SnmpCommunity,
			device.SnmpVersion,
			device.SnmpPort,
			device.Tags,
		)
		if err != nil {
			result.Success = false
			result.Error = err.Error()
			results = append(results, result)
			continue
		}

		// Build and write metrics
		metricsMap := make(map[string]monitoring.MetricValue)
		if metrics.CPUUsage != nil {
			metricsMap["cpu_usage"] = monitoring.MetricValue{Value: metrics.CPUUsage, Unit: stringPtr("%")}
		}
		if metrics.MemoryUsage != nil {
			metricsMap["memory_usage"] = monitoring.MetricValue{Value: metrics.MemoryUsage, Unit: stringPtr("%")}
		}
		if metrics.Temperature != nil {
			metricsMap["temperature"] = monitoring.MetricValue{Value: metrics.Temperature, Unit: stringPtr("°C")}
		}
		if metrics.Uptime != nil {
			uptimeFloat := float64(*metrics.Uptime)
			metricsMap["uptime"] = monitoring.MetricValue{Value: &uptimeFloat, Unit: stringPtr("seconds")}
		}
		if metrics.BandwidthIn != nil {
			bwIn := *metrics.BandwidthIn // 直接存储 bps
			metricsMap["bandwidth_in"] = monitoring.MetricValue{Value: &bwIn, Unit: stringPtr("bps")}
		}
		if metrics.BandwidthOut != nil {
			bwOut := *metrics.BandwidthOut // 直接存储 bps
			metricsMap["bandwidth_out"] = monitoring.MetricValue{Value: &bwOut, Unit: stringPtr("bps")}
		}

		collectedAt := monitoring.FlexibleTime{Time: metrics.CollectedAt}
		writeReq := monitoring.DeviceMetricsRequest{
			DeviceID:    device.ID,
			Metrics:     metricsMap,
			CollectedAt: &collectedAt,
		}

		writeResult, writeErr := h.Metrics.WriteDeviceMetrics(c.Request().Context(), writeReq)
		if writeErr != nil && !errors.Is(writeErr, monitoring.ErrNoMetrics) {
			result.Success = false
			result.Error = writeErr.Error()
		} else {
			result.Success = true
			result.MetricsWritten = writeResult.DeviceMetrics
			result.Metrics = metrics
			successCount++
		}

		results = append(results, result)
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success":       successCount > 0,
		"total":         len(req.DeviceIDs),
		"collected":     successCount,
		"failed":        len(results) - successCount,
		"results":       results,
	})
}
