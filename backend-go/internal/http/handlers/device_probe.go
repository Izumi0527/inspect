package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

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
	if updateStatus {
		permissions, _ := c.Get(authContextPermissionsKey).([]string)
		// 没有更新权限时，降级为仅探测不写回状态，避免只读用户触发写库
		if !hasPermission("devices:update", permissions) {
			updateStatus = false
		}
	}
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
	statusUpdated := false
	if updateStatus {
		if err := h.Service.UpdateDeviceProbeStatus(
			c.Request().Context(),
			device.ID,
			status,
			icmpStatus,
			snmpStatus,
			result.IcmpResponseTime,
			conditionalLastSeen(result),
			&result.ProbedAt,
		); err == nil {
			statusUpdated = true
		}
	}

	response := map[string]interface{}{
		"device_id":          result.DeviceID,
		"device_name":        device.Name,
		"ip_address":         result.IPAddress,
		"status":             status,
		"icmp_status":        icmpStatus,
		"snmp_status":        snmpStatus,
		"status_updated":     statusUpdated,
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
	if updateStatus {
		permissions, _ := c.Get(authContextPermissionsKey).([]string)
		// 没有更新权限时，降级为仅探测不写回状态，避免只读用户触发写库
		if !hasPermission("devices:update", permissions) {
			updateStatus = false
		}
	}
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

	statusUpdated := false
	if updateStatus {
		status, icmpStatus, snmpStatus := buildProbeStatuses(result)
		if err := h.Service.UpdateDeviceProbeStatus(
			c.Request().Context(),
			device.ID,
			status,
			icmpStatus,
			snmpStatus,
			result.IcmpResponseTime,
			conditionalLastSeen(result),
			&result.ProbedAt,
		); err == nil {
			statusUpdated = true
		}
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
	return c.JSON(http.StatusOK, struct {
		devices.DeviceProbeResponse
		StatusUpdated bool `json:"status_updated"`
	}{
		DeviceProbeResponse: resp,
		StatusUpdated:       statusUpdated,
	})
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

	maxConcurrent := req.MaxConcurrent
	if maxConcurrent <= 0 {
		maxConcurrent = defaultProbeConcurrent
	}
	if maxConcurrent > maxBatchProbeConcurrent {
		return echo.NewHTTPError(
			http.StatusBadRequest,
			fmt.Sprintf("max_concurrent too large (max %d)", maxBatchProbeConcurrent),
		)
	}

	updateStatus := parseBoolDefault(c.QueryParam("update_status"), true)
	if updateStatus {
		permissions, _ := c.Get(authContextPermissionsKey).([]string)
		// 没有更新权限时，降级为仅探测不写回状态，避免只读用户触发写库
		if !hasPermission("devices:update", permissions) {
			updateStatus = false
		}
	}

	req.DeviceIDs = dedupePositiveInts(req.DeviceIDs)
	if len(req.DeviceIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "device_ids is required")
	}
	if len(req.DeviceIDs) > maxBatchDeviceIDs {
		return echo.NewHTTPError(
			http.StatusBadRequest,
			fmt.Sprintf("device_ids too large (max %d)", maxBatchDeviceIDs),
		)
	}

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

	results := h.Probe.BatchProbeDevices(c.Request().Context(), targets, maxConcurrent)
	response := make([]devices.DeviceProbeResponse, 0, len(results))
	updatedCount := 0
	for _, deviceID := range req.DeviceIDs {
		result, ok := results[deviceID]
		if !ok {
			continue
		}
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
			if err := h.Service.UpdateDeviceProbeStatus(
				c.Request().Context(),
				result.DeviceID,
				status,
				icmpStatus,
				snmpStatus,
				result.IcmpResponseTime,
				conditionalLastSeen(result),
				&result.ProbedAt,
			); err == nil {
				updatedCount++
			}
		}
	}

	batchResp := devices.DeviceBatchProbeResponse{
		Total:   len(req.DeviceIDs),
		Probed:  len(response),
		Results: response,
	}

	return c.JSON(http.StatusOK, struct {
		devices.DeviceBatchProbeResponse
		StatusUpdated      bool `json:"status_updated"`
		StatusUpdatedCount int  `json:"status_updated_count"`
	}{
		DeviceBatchProbeResponse: batchResp,
		StatusUpdated:            updateStatus && updatedCount > 0,
		StatusUpdatedCount:       updatedCount,
	})
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

func (h DevicesHandler) CollectDeviceMetrics(c echo.Context) error {
	if h.Service == nil || h.SNMPCollector == nil || h.Metrics == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics collection service not configured")
	}
	// 采集接口会写入监控指标数据，必须具备更新权限
	if _, err := requirePermission(c, h.Auth, "devices:update"); err != nil {
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
		device.Vendor,
		device.SnmpCommunity,
		device.SnmpVersion,
		device.SnmpPort,
		device.Tags,
	)
	if err != nil {
		c.Logger().Errorf("metrics collection failed for device %d: %v", deviceID, err)
		return echo.NewHTTPError(http.StatusInternalServerError, "metrics collection failed")
	}

	writeReq := monitoring.BuildSNMPDeviceMetricsRequest(deviceID, metrics)

	result, err := h.Metrics.WriteDeviceMetrics(c.Request().Context(), writeReq)
	if err != nil && !errors.Is(err, monitoring.ErrNoMetrics) {
		c.Logger().Errorf("failed to write metrics for device %d: %v", deviceID, err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to write metrics")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success":            true,
		"device_id":          deviceID,
		"metrics_collected":  metrics,
		"metrics_written":    result.DeviceMetrics,
		"interfaces_written": result.InterfaceMetrics,
		"collection_time_ms": metrics.CollectionTime,
	})
}

// BatchCollectMetrics collects metrics from multiple devices
func (h DevicesHandler) BatchCollectMetrics(c echo.Context) error {
	if h.Service == nil || h.SNMPCollector == nil || h.Metrics == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics collection service not configured")
	}
	// 采集接口会写入监控指标数据，必须具备更新权限
	if _, err := requirePermission(c, h.Auth, "devices:update"); err != nil {
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

	req.DeviceIDs = dedupePositiveInts(req.DeviceIDs)
	if len(req.DeviceIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "device_ids is required")
	}
	if len(req.DeviceIDs) > maxBatchDeviceIDs {
		return echo.NewHTTPError(
			http.StatusBadRequest,
			fmt.Sprintf("device_ids too large (max %d)", maxBatchDeviceIDs),
		)
	}

	deviceRows, err := h.Service.GetDevicesByIDs(c.Request().Context(), req.DeviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query devices")
	}
	if len(deviceRows) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "no devices found")
	}

	type collectResult struct {
		DeviceID       int                  `json:"device_id"`
		DeviceName     string               `json:"device_name"`
		Success        bool                 `json:"success"`
		Error          string               `json:"error,omitempty"`
		MetricsWritten int                  `json:"metrics_written,omitempty"`
		Metrics        *devices.SNMPMetrics `json:"metrics,omitempty"`
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
			device.Vendor,
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

		writeReq := monitoring.BuildSNMPDeviceMetricsRequest(device.ID, metrics)

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
		"success":   successCount > 0,
		"total":     len(req.DeviceIDs),
		"collected": successCount,
		"failed":    len(results) - successCount,
		"results":   results,
	})
}
