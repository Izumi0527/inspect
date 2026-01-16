package handlers

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

type MonitoringHandler struct {
	Writer          *monitoring.MetricsWriter
	ReportOutputDir string
}

func (h MonitoringHandler) Register(group *echo.Group) {
	group.GET("/monitoring/devices/:device_id/metrics", h.GetDeviceMetrics)
	group.GET("/monitoring/devices/:device_id/history", h.GetDeviceMetricsHistory)
	group.GET("/monitoring/devices/:device_id/status", h.GetDeviceStatus)
	group.GET("/monitoring/devices/:device_id/current", h.GetDeviceMetrics)
	group.GET("/monitoring/historical", h.GetMonitoringHistorical)
	group.GET("/monitoring/devices", h.ListMonitoringDevices)
	group.GET("/monitoring/devices/status", h.GetDevicesStatus)
	group.GET("/monitoring/devices/distribution", h.GetDeviceStatusDistribution)
	group.GET("/monitoring/availability", h.GetAvailability)
	group.GET("/monitoring/stats", h.GetMonitoringStats)
	group.GET("/monitoring/stats/service", h.GetMonitoringServiceStats)
	group.GET("/monitoring/overview", h.GetMonitoringOverview)
	group.GET("/monitoring/status", h.GetSystemStatus)
	group.GET("/monitoring/reports/download/:filename", h.DownloadMonitoringReport)
	group.POST("/monitoring/devices/historical", h.GetBulkDeviceMetricsHistory)
	group.POST("/monitoring/system/performance", h.GetSystemPerformanceHistory)
	group.POST("/monitoring/devices/temperature", h.GetDeviceTemperatureHistory)
	group.POST("/monitoring/network/traffic/history", h.GetNetworkTrafficHistory)
	group.POST("/monitoring/reports/export", h.ExportMonitoringReport)
	group.POST("/monitoring/start", h.StartMonitoringService)
	group.POST("/monitoring/stop", h.StopMonitoringService)
	group.POST("/monitoring/devices/:device_id/start", h.StartDeviceMonitoring)
	group.POST("/monitoring/devices/:device_id/stop", h.StopDeviceMonitoring)
	group.POST("/monitoring/devices/:device_id/metrics", h.WriteDeviceMetrics)
	group.POST("/monitoring/system/metrics", h.WriteSystemMetrics)
}

func (h MonitoringHandler) GetDeviceMetrics(c echo.Context) error {
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	deviceID, err := strconv.Atoi(c.Param("device_id"))
	if err != nil || deviceID <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid device_id")
	}

	exists, err := h.Writer.DeviceExists(c.Request().Context(), deviceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query device")
	}
	if !exists {
		return echo.NewHTTPError(http.StatusNotFound, "设备不存在")
	}

	resp, err := h.Writer.GetDeviceMetrics(c.Request().Context(), deviceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query metrics")
	}

	return c.JSON(http.StatusOK, resp)
}

func (h MonitoringHandler) GetDeviceMetricsHistory(c echo.Context) error {
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	deviceID, err := strconv.Atoi(c.Param("device_id"))
	if err != nil || deviceID <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid device_id")
	}

	exists, err := h.Writer.DeviceExists(c.Request().Context(), deviceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query device")
	}
	if !exists {
		return echo.NewHTTPError(http.StatusNotFound, "设备不存在")
	}

	startTime, endTime, err := parseHistoryRange(c.QueryParam("start_time"), c.QueryParam("end_time"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	metricNames := parseMetricNames(c.QueryParam("metric_names"))
	points, err := h.Writer.GetDeviceMetricsHistory(c.Request().Context(), deviceID, startTime, endTime, metricNames)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query metrics history")
	}

	resp := monitoring.MetricsHistoryResponse{
		DeviceID:    deviceID,
		StartTime:   startTime,
		EndTime:     endTime,
		DataPoints:  points,
		MetricNames: metricNames,
	}

	return c.JSON(http.StatusOK, resp)
}

func (h MonitoringHandler) WriteDeviceMetrics(c echo.Context) error {
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	deviceID, err := strconv.Atoi(c.Param("device_id"))
	if err != nil || deviceID <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid device_id")
	}

	var req monitoring.DeviceMetricsRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	if req.DeviceID != 0 && req.DeviceID != deviceID {
		return echo.NewHTTPError(http.StatusBadRequest, "device_id mismatch")
	}
	req.DeviceID = deviceID

	result, err := h.Writer.WriteDeviceMetrics(c.Request().Context(), req)
	if err != nil {
		if err == monitoring.ErrNoMetrics {
			return echo.NewHTTPError(http.StatusBadRequest, "metrics payload is empty")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to store metrics")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success":              true,
		"device_id":            deviceID,
		"device_metrics_count": result.DeviceMetrics,
		"interface_metrics_count": result.InterfaceMetrics,
	})
}

func (h MonitoringHandler) WriteSystemMetrics(c echo.Context) error {
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	var req monitoring.SystemMetricsRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	result, err := h.Writer.WriteSystemMetrics(c.Request().Context(), req)
	if err != nil {
		if err == monitoring.ErrNoMetrics {
			return echo.NewHTTPError(http.StatusBadRequest, "metrics payload is empty")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to store metrics")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success":           true,
		"host":              req.Host,
		"system_metrics_count": result.SystemMetrics,
	})
}

func (h MonitoringHandler) GetDevicesStatus(c echo.Context) error {
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	result, err := h.Writer.GetDevicesStatus(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query device status")
	}
	return c.JSON(http.StatusOK, result)
}

func (h MonitoringHandler) GetDeviceStatus(c echo.Context) error {
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	deviceID, err := strconv.Atoi(c.Param("device_id"))
	if err != nil || deviceID <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid device_id")
	}

	result, err := h.Writer.GetDeviceStatus(c.Request().Context(), deviceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "设备不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query device status")
	}
	return c.JSON(http.StatusOK, result)
}

func (h MonitoringHandler) ListMonitoringDevices(c echo.Context) error {
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	result, err := h.Writer.ListMonitoringDevices(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query devices")
	}
	return c.JSON(http.StatusOK, result)
}

func (h MonitoringHandler) GetDeviceStatusDistribution(c echo.Context) error {
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	result, err := h.Writer.GetDeviceStatusDistribution(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query status distribution")
	}
	return c.JSON(http.StatusOK, result)
}

func (h MonitoringHandler) GetAvailability(c echo.Context) error {
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	result, err := h.Writer.GetAvailability(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query availability")
	}
	return c.JSON(http.StatusOK, result)
}

func (h MonitoringHandler) GetMonitoringStats(c echo.Context) error {
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	result, err := h.Writer.GetMonitoringStats(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query monitoring stats")
	}
	return c.JSON(http.StatusOK, result)
}

func (h MonitoringHandler) GetMonitoringServiceStats(c echo.Context) error {
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	stats, err := h.Writer.GetMonitoringServiceStats(c.Request().Context())
	if err != nil {
		msg := err.Error()
		stats.Error = &msg
	}

	return c.JSON(http.StatusOK, stats)
}

func (h MonitoringHandler) GetMonitoringOverview(c echo.Context) error {
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	result, err := h.Writer.GetMonitoringOverview(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query monitoring overview")
	}
	return c.JSON(http.StatusOK, result)
}

func (h MonitoringHandler) StartMonitoringService(c echo.Context) error {
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	if err := h.Writer.SetMonitoringServiceRunning(c.Request().Context(), true); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to start monitoring service")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message": "监控服务已启动",
	})
}

func (h MonitoringHandler) StopMonitoringService(c echo.Context) error {
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	if err := h.Writer.SetMonitoringServiceRunning(c.Request().Context(), false); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to stop monitoring service")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message": "监控服务已停止",
	})
}

func (h MonitoringHandler) GetSystemStatus(c echo.Context) error {
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	result, err := h.Writer.GetSystemStatusSnapshot(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query system status")
	}
	return c.JSON(http.StatusOK, result)
}

func (h MonitoringHandler) GetBulkDeviceMetricsHistory(c echo.Context) error {
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	var req monitoring.BulkMetricsRequest
	if err := c.Bind(&req); err != nil && !errors.Is(err, io.EOF) {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	deviceIDs := make([]int, 0, len(req.DeviceIDs))
	for _, id := range req.DeviceIDs {
		if id > 0 {
			deviceIDs = append(deviceIDs, id)
		}
	}
	if len(deviceIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "device_ids is required")
	}

	startTime, endTime, err := resolveTimeRange(req.StartTime, req.EndTime, 24*time.Hour)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	metricNames := req.Metrics
	if len(metricNames) == 0 {
		metricNames = []string{"cpu_usage", "memory_usage", "bandwidth_utilization"}
	}
	metricNames = normalizeMetricList(metricNames)

	points, err := h.Writer.GetBulkMetricsHistory(c.Request().Context(), deviceIDs, startTime, endTime, metricNames)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query metrics history")
	}

	return c.JSON(http.StatusOK, points)
}

func (h MonitoringHandler) GetSystemPerformanceHistory(c echo.Context) error {
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	var req monitoring.TimeRangeRequest
	if err := c.Bind(&req); err != nil && !errors.Is(err, io.EOF) {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	startTime, endTime, err := resolveTimeRange(req.StartTime, req.EndTime, 24*time.Hour)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	result, err := h.Writer.GetSystemPerformanceHistory(c.Request().Context(), startTime, endTime, normalizeMetricList(req.Metrics))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query system performance")
	}

	return c.JSON(http.StatusOK, result)
}

func (h MonitoringHandler) GetDeviceTemperatureHistory(c echo.Context) error {
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	var req monitoring.TimeRangeRequest
	if err := c.Bind(&req); err != nil && !errors.Is(err, io.EOF) {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	startTime, endTime, err := resolveTimeRange(req.StartTime, req.EndTime, 24*time.Hour)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	result, err := h.Writer.GetTemperatureHistory(c.Request().Context(), startTime, endTime)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query temperature history")
	}

	return c.JSON(http.StatusOK, result)
}

func (h MonitoringHandler) GetNetworkTrafficHistory(c echo.Context) error {
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	var req monitoring.TimeRangeRequest
	if err := c.Bind(&req); err != nil && !errors.Is(err, io.EOF) {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	startTime, endTime, err := resolveTimeRange(req.StartTime, req.EndTime, 24*time.Hour)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	result, err := h.Writer.GetNetworkTrafficHistory(c.Request().Context(), startTime, endTime)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query network traffic history")
	}

	return c.JSON(http.StatusOK, result)
}

func (h MonitoringHandler) ExportMonitoringReport(c echo.Context) error {
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}
	if strings.TrimSpace(h.ReportOutputDir) == "" {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report output not configured")
	}

	var req monitoring.MonitoringReportExportRequest
	if err := c.Bind(&req); err != nil && !errors.Is(err, io.EOF) {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if strings.TrimSpace(req.Format) == "" {
		req.Format = "pdf"
	}
	if strings.TrimSpace(req.TimeRange) == "" {
		req.TimeRange = "24h"
	}

	result, err := h.Writer.ExportMonitoringReport(c.Request().Context(), req, h.ReportOutputDir)
	if err != nil {
		if errors.Is(err, monitoring.ErrInvalidReportFormat) || errors.Is(err, monitoring.ErrInvalidReportTimeRange) {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to export monitoring report")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"format":       result.Format,
		"time_range":   result.TimeRange,
		"sections":     result.Sections,
		"generated_at": result.GeneratedAt.Format(time.RFC3339Nano),
		"download_url": fmt.Sprintf("/api/v1/monitoring/reports/download/%s", result.FileName),
		"status":       "completed",
	})
}

func (h MonitoringHandler) DownloadMonitoringReport(c echo.Context) error {
	if strings.TrimSpace(h.ReportOutputDir) == "" {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report output not configured")
	}

	rawName := strings.TrimSpace(c.Param("filename"))
	safeName := filepath.Base(rawName)
	if rawName == "" || safeName == "." || safeName != rawName {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid filename")
	}

	filePath := filepath.Join(h.ReportOutputDir, safeName)
	if _, err := os.Stat(filePath); err != nil {
		if os.IsNotExist(err) {
			return echo.NewHTTPError(http.StatusNotFound, "report not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to access report")
	}

	ext := strings.ToLower(filepath.Ext(safeName))
	disposition := "attachment"
	if ext == ".pdf" {
		disposition = "inline"
	}
	c.Response().Header().Set(echo.HeaderContentType, reportContentType(ext))
	c.Response().Header().Set(echo.HeaderContentDisposition, fmt.Sprintf("%s; filename=\"%s\"", disposition, safeName))

	return c.File(filePath)
}

func (h MonitoringHandler) StartDeviceMonitoring(c echo.Context) error {
	return h.updateDeviceMonitoring(c, true)
}

func (h MonitoringHandler) StopDeviceMonitoring(c echo.Context) error {
	return h.updateDeviceMonitoring(c, false)
}

func (h MonitoringHandler) updateDeviceMonitoring(c echo.Context, enabled bool) error {
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	deviceID, err := strconv.Atoi(c.Param("device_id"))
	if err != nil || deviceID <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid device_id")
	}

	var req monitoring.MonitoringToggleRequest
	if err := c.Bind(&req); err != nil && !errors.Is(err, io.EOF) {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if req.DeviceID != 0 && req.DeviceID != deviceID {
		return echo.NewHTTPError(http.StatusBadRequest, "device_id mismatch")
	}

	if err := h.Writer.SetDeviceMonitoring(c.Request().Context(), deviceID, enabled, req.Interval); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "设备不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to update device monitoring")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success":   true,
		"device_id": deviceID,
		"enabled":   enabled,
		"interval":  req.Interval,
	})
}

func (h MonitoringHandler) GetMonitoringHistorical(c echo.Context) error {
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	deviceID, err := strconv.Atoi(c.QueryParam("device_id"))
	if err != nil || deviceID <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid device_id")
	}

	exists, err := h.Writer.DeviceExists(c.Request().Context(), deviceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query device")
	}
	if !exists {
		return echo.NewHTTPError(http.StatusNotFound, "设备不存在")
	}

	startTime, endTime, err := parseHistoryRange(c.QueryParam("start_time"), c.QueryParam("end_time"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	metricNames := parseMetricNames(c.QueryParam("metric_names"))
	points, err := h.Writer.GetDeviceMetricsHistory(c.Request().Context(), deviceID, startTime, endTime, metricNames)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query metrics history")
	}

	resp := monitoring.MetricsHistoryResponse{
		DeviceID:    deviceID,
		StartTime:   startTime,
		EndTime:     endTime,
		DataPoints:  points,
		MetricNames: metricNames,
	}

	return c.JSON(http.StatusOK, resp)
}

func parseHistoryRange(startRaw string, endRaw string) (time.Time, time.Time, error) {
	endTime := time.Now().UTC()
	if parsed, err := parseTimeValuePtr(endRaw); err != nil {
		return time.Time{}, time.Time{}, err
	} else if parsed != nil {
		endTime = parsed.UTC()
	}

	startTime := endTime.Add(-24 * time.Hour)
	if parsed, err := parseTimeValuePtr(startRaw); err != nil {
		return time.Time{}, time.Time{}, err
	} else if parsed != nil {
		startTime = parsed.UTC()
	}

	if startTime.After(endTime) {
		return time.Time{}, time.Time{}, fmt.Errorf("start_time must be before end_time")
	}

	return startTime, endTime, nil
}

func parseMetricNames(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{}
	}

	parts := strings.Split(raw, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		result = append(result, trimmed)
	}
	return result
}

func parseTimeValuePtr(raw string) (*time.Time, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil, nil
	}

	layouts := []string{time.RFC3339Nano, time.RFC3339}
	for _, layout := range layouts {
		if parsed, err := time.Parse(layout, value); err == nil {
			return &parsed, nil
		}
	}

	return nil, fmt.Errorf("invalid time format: %s", raw)
}

func resolveTimeRange(start *monitoring.FlexibleTime, end *monitoring.FlexibleTime, fallback time.Duration) (time.Time, time.Time, error) {
	endTime := time.Now().UTC()
	if end != nil && !end.IsZero() {
		endTime = end.Time.UTC()
	}

	startTime := endTime.Add(-fallback)
	if start != nil && !start.IsZero() {
		startTime = start.Time.UTC()
	}

	if startTime.After(endTime) {
		return time.Time{}, time.Time{}, fmt.Errorf("start_time must be before end_time")
	}

	return startTime, endTime, nil
}

func normalizeMetricList(metrics []string) []string {
	if len(metrics) == 0 {
		return metrics
	}

	result := make([]string, 0, len(metrics))
	for _, metric := range metrics {
		normalized := monitoring.NormalizeMetricName(metric)
		if normalized == "" {
			continue
		}
		result = append(result, normalized)
	}
	return result
}

func reportContentType(ext string) string {
	switch strings.ToLower(ext) {
	case ".pdf":
		return "application/pdf"
	case ".csv":
		return "text/csv; charset=utf-8"
	case ".xls":
		return "application/vnd.ms-excel"
	case ".xlsx":
		return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	default:
		return "application/octet-stream"
	}
}
