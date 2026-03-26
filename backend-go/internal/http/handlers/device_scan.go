package handlers

import (
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
)

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
	targetNetwork := strings.TrimSpace(req.TargetNetwork)
	if targetNetwork == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "target_network is required")
	}

	// 仅支持 IPv4 CIDR，且限制扫描规模，避免大网段导致资源耗尽。
	_, ipNet, err := net.ParseCIDR(targetNetwork)
	if err != nil || ipNet == nil || ipNet.IP.To4() == nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid target_network")
	}
	ones, bits := ipNet.Mask.Size()
	if bits != 32 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid target_network")
	}
	totalHosts := 1 << (bits - ones)
	if totalHosts > 2 {
		totalHosts = totalHosts - 2
	}
	if totalHosts <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid target_network")
	}
	if totalHosts > devices.MaxScanHosts {
		return echo.NewHTTPError(http.StatusBadRequest, fmt.Sprintf("target_network too large (max %d hosts)", devices.MaxScanHosts))
	}

	// 统一 scan_type 取值，未知值回落到 ping，避免“无需探测即视为可达”导致海量写库。
	req.ScanType = strings.ToLower(strings.TrimSpace(req.ScanType))
	if req.ScanType == "" {
		req.ScanType = "ping"
	}
	if req.ScanType != "ping" && req.ScanType != "full" {
		req.ScanType = "ping"
	}

	var createdBy *string
	if user != nil && strings.TrimSpace(user.ID) != "" {
		createdBy = &user.ID
	}
	scanID, err := h.Scanner.StartScan(c.Request().Context(), req, createdBy)
	if err != nil {
		// StartScan 内部仍可能因 DB/执行异常失败，此处按服务端错误返回。
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to start scan")
	}

	return c.JSON(http.StatusOK, devices.NetworkScanResponse{
		ScanID:        scanID,
		Message:       "network scan started",
		TargetNetwork: targetNetwork,
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
	if limit <= 0 {
		limit = 20
	}
	if limit > maxScanListLimit {
		limit = maxScanListLimit
	}

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

	if err := h.Scanner.StopScanWithReason(c.Request().Context(), scanID); err != nil {
		if errors.Is(err, devices.ErrScanNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "scan not found")
		}
		if errors.Is(err, devices.ErrScanNotRunning) {
			return echo.NewHTTPError(http.StatusConflict, "scan not running")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to stop scan")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message": "scan stopped",
		"scan_id": scanID,
	})
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
