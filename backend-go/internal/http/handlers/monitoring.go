package handlers

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

type MonitoringHandler struct {
	Writer               *monitoring.MetricsWriter
	DashboardWriter      monitoringDashboardWriter
	ReportOutputDir      string
	Auth                 PermissionService
	AlertService         *alerts.Service
	DownloadTokens       *ReportDownloadTokenStore
	DownloadTokenTTL     time.Duration
	DownloadTokenMaxUses int
}

type monitoringDashboardWriter interface {
	GetMonitoringStats(ctx context.Context) (monitoring.MonitoringStats, error)
	GetSystemPerformanceHistory(ctx context.Context, start time.Time, end time.Time, metrics []string) ([]monitoring.SystemPerformancePoint, error)
	GetTemperatureHistory(ctx context.Context, start time.Time, end time.Time) ([]monitoring.TemperatureHistoryPoint, error)
	GetDeviceStatusDistribution(ctx context.Context) (monitoring.DeviceStatusDistribution, error)
	GetAvailability(ctx context.Context) (monitoring.AvailabilitySnapshot, error)
	GetNetworkTrafficHistory(ctx context.Context, start time.Time, end time.Time) ([]monitoring.NetworkTrafficPoint, error)
}

func (h MonitoringHandler) dashboardWriter() monitoringDashboardWriter {
	if h.DashboardWriter != nil {
		return h.DashboardWriter
	}
	if h.Writer != nil {
		return h.Writer
	}
	return nil
}

const (
	monitoringReadPermission    = "monitoring:read"
	monitoringControlPermission = "monitoring:control"
	monitoringExportPermission  = "monitoring:export"
)

func (h MonitoringHandler) ensurePermission(c echo.Context, permission string) error {
	_, err := requirePermission(c, h.Auth, permission)
	return err
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
	group.POST("/monitoring/reports/download", h.DownloadMonitoringReportByToken)
	group.POST("/monitoring/reports/download/check", h.CheckMonitoringReportDownloadToken)

	// 监控中心 v2 聚合接口：将多接口拉取收敛为单次请求，返回分区状态与降级信息
	group.POST("/monitoring/dashboard/v2", h.GetMonitoringDashboardV2)
	group.POST("/monitoring/start", h.StartMonitoringService)
	group.POST("/monitoring/stop", h.StopMonitoringService)
	group.POST("/monitoring/devices/:device_id/start", h.StartDeviceMonitoring)
	group.POST("/monitoring/devices/:device_id/stop", h.StopDeviceMonitoring)
	group.POST("/monitoring/devices/:device_id/metrics", h.WriteDeviceMetrics)
	group.POST("/monitoring/system/metrics", h.WriteSystemMetrics)
}

func (h MonitoringHandler) GetDeviceMetrics(c echo.Context) error {
	if err := h.ensurePermission(c, monitoringReadPermission); err != nil {
		return err
	}
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
	if err := h.ensurePermission(c, monitoringReadPermission); err != nil {
		return err
	}
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
	if err := h.ensurePermission(c, monitoringControlPermission); err != nil {
		return err
	}
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
		"success":                 true,
		"device_id":               deviceID,
		"device_metrics_count":    result.DeviceMetrics,
		"interface_metrics_count": result.InterfaceMetrics,
	})
}

func (h MonitoringHandler) WriteSystemMetrics(c echo.Context) error {
	if err := h.ensurePermission(c, monitoringControlPermission); err != nil {
		return err
	}
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
		"success":              true,
		"host":                 req.Host,
		"system_metrics_count": result.SystemMetrics,
	})
}

func (h MonitoringHandler) GetDevicesStatus(c echo.Context) error {
	if err := h.ensurePermission(c, monitoringReadPermission); err != nil {
		return err
	}
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
	if err := h.ensurePermission(c, monitoringReadPermission); err != nil {
		return err
	}
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
	if err := h.ensurePermission(c, monitoringReadPermission); err != nil {
		return err
	}
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
	if err := h.ensurePermission(c, monitoringReadPermission); err != nil {
		return err
	}
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
	if err := h.ensurePermission(c, monitoringReadPermission); err != nil {
		return err
	}
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
	if err := h.ensurePermission(c, monitoringReadPermission); err != nil {
		return err
	}
	writer := h.dashboardWriter()
	if writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	result, err := writer.GetMonitoringStats(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query monitoring stats")
	}

	// 口径收口：缺少 alerts:read 时，不应泄露 active_alerts。
	permissions, _ := c.Get(authContextPermissionsKey).([]string)
	if !hasPermission("alerts:read", permissions) {
		result.ActiveAlerts = 0
	}

	return c.JSON(http.StatusOK, result)
}

func (h MonitoringHandler) GetMonitoringServiceStats(c echo.Context) error {
	if err := h.ensurePermission(c, monitoringReadPermission); err != nil {
		return err
	}
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
	if err := h.ensurePermission(c, monitoringReadPermission); err != nil {
		return err
	}
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
	if err := h.ensurePermission(c, monitoringControlPermission); err != nil {
		return err
	}
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
	if err := h.ensurePermission(c, monitoringControlPermission); err != nil {
		return err
	}
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
	if err := h.ensurePermission(c, monitoringReadPermission); err != nil {
		return err
	}
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
	if err := h.ensurePermission(c, monitoringReadPermission); err != nil {
		return err
	}
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
	if err := h.ensurePermission(c, monitoringReadPermission); err != nil {
		return err
	}
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
	if err := h.ensurePermission(c, monitoringReadPermission); err != nil {
		return err
	}
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
	if err := h.ensurePermission(c, monitoringReadPermission); err != nil {
		return err
	}
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
	if err := h.ensurePermission(c, monitoringExportPermission); err != nil {
		return err
	}
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

	// 权限对齐：缺少 alerts:read 时不允许导出告警分区，避免“页面隐藏但导出可见”的越权风险。
	permissions, _ := c.Get(authContextPermissionsKey).([]string)
	if !hasPermission("alerts:read", permissions) {
		if len(req.Sections) == 0 {
			req.Sections = []string{"stats", "charts"}
		} else {
			filtered := make([]string, 0, len(req.Sections))
			requestedAlerts := false
			for _, section := range req.Sections {
				key := strings.ToLower(strings.TrimSpace(section))
				if key == "alerts" {
					requestedAlerts = true
					continue
				}
				filtered = append(filtered, section)
			}

			if requestedAlerts {
				if len(filtered) == 0 {
					return echo.NewHTTPError(http.StatusForbidden, "Permission denied: alerts:read")
				}
				req.Sections = filtered
			}
		}
	}

	result, err := h.Writer.ExportMonitoringReport(c.Request().Context(), req, h.ReportOutputDir)
	if err != nil {
		if errors.Is(err, monitoring.ErrInvalidReportFormat) || errors.Is(err, monitoring.ErrInvalidReportTimeRange) {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to export monitoring report")
	}

	downloadToken := ""
	downloadFormURL := ""
	downloadTokenExpiresAt := ""
	downloadTokenMaxUses := 0
	if h.DownloadTokens != nil {
		ttl := h.DownloadTokenTTL
		if ttl <= 0 {
			ttl = 5 * time.Minute
		}
		maxUses := h.DownloadTokenMaxUses
		if maxUses <= 0 {
			maxUses = 3
		}

		token, expiresAt, err := h.DownloadTokens.Issue(c.Request().Context(), result.FileName, ttl, maxUses)
		if err == nil && strings.TrimSpace(token) != "" {
			downloadToken = token
			downloadFormURL = "/api/v1/monitoring/reports/download"
			downloadTokenExpiresAt = expiresAt.UTC().Format(time.RFC3339Nano)
			downloadTokenMaxUses = maxUses
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"format":                    result.Format,
		"time_range":                result.TimeRange,
		"sections":                  result.Sections,
		"generated_at":              result.GeneratedAt.Format(time.RFC3339Nano),
		"download_url":              fmt.Sprintf("/api/v1/monitoring/reports/download/%s", result.FileName),
		"download_token":            downloadToken,
		"download_form_url":         downloadFormURL,
		"download_token_expires_at": downloadTokenExpiresAt,
		"download_token_max_uses":   downloadTokenMaxUses,
		"status":                    "completed",
	})
}

type monitoringDashboardV2Request struct {
	// 时间范围：例如 24h / 7d / 30d，默认 24h
	TimeRange string `json:"time_range"`
	// 实时告警数量上限，默认 10（无告警权限时自动降级）
	AlertsLimit int `json:"alerts_limit"`
}

type monitoringSectionStatus struct {
	Ok                  bool    `json:"ok"`
	Message             *string `json:"message,omitempty"`
	LimitedByPermission bool    `json:"limitedByPermission,omitempty"`
	RequiredPermission  string  `json:"requiredPermission,omitempty"`
}

type monitoringDashboardV2Envelope struct {
	Data              monitoringDashboardV2Data          `json:"data"`
	Sections          map[string]monitoringSectionStatus `json:"sections"`
	HasPartialFailure bool                               `json:"hasPartialFailure"`
	FailedSections    []string                           `json:"failedSections"`
	LastUpdate        string                             `json:"lastUpdate"`
	GeneratedAt       string                             `json:"generatedAt"`
}

type monitoringDashboardV2Data struct {
	SystemPerformance        []monitoringSystemPerformanceV2Point `json:"systemPerformance"`
	TemperatureHistory       []monitoring.TemperatureHistoryPoint `json:"temperatureHistory"`
	DeviceStatusDistribution monitoring.DeviceStatusDistribution  `json:"deviceStatusDistribution"`
	Availability             monitoringAvailabilityV2             `json:"availability"`
	NetworkTrafficHistory    []monitoring.NetworkTrafficPoint     `json:"networkTrafficHistory"`
	StatsV2                  []monitoringV2StatCardData           `json:"statsV2"`
	RealtimeAlerts           []monitoringV2RealtimeAlert          `json:"realtimeAlerts"`
	LastUpdate               string                               `json:"lastUpdate"`
}

type monitoringAvailabilityV2 struct {
	Current    float64 `json:"current"`
	Target     float64 `json:"target"`
	Trend      string  `json:"trend"`
	LastUpdate string  `json:"lastUpdate,omitempty"`
}

type monitoringSystemPerformanceV2Point struct {
	Timestamp string  `json:"timestamp"`
	CPU       float64 `json:"cpu"`
	Memory    float64 `json:"memory"`
	Network   float64 `json:"network"`
}

type monitoringV2StatCardData struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Value string `json:"value"`
}

type monitoringV2RealtimeAlert struct {
	ID         int    `json:"id"`
	Severity   string `json:"severity"`
	DeviceName string `json:"deviceName"`
	Message    string `json:"message"`
	Time       string `json:"time"`
}

func (h MonitoringHandler) GetMonitoringDashboardV2(c echo.Context) error {
	if err := h.ensurePermission(c, monitoringReadPermission); err != nil {
		return err
	}
	writer := h.dashboardWriter()
	if writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	var req monitoringDashboardV2Request
	if err := c.Bind(&req); err != nil && !errors.Is(err, io.EOF) {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	timeRange := strings.TrimSpace(req.TimeRange)
	if timeRange == "" {
		timeRange = "24h"
	}
	alertsLimit := req.AlertsLimit
	if alertsLimit <= 0 {
		alertsLimit = 10
	}
	if alertsLimit > 50 {
		alertsLimit = 50
	}

	startTime, endTime := resolveTimeRangeFromString(timeRange, 24*time.Hour)
	generatedAt := time.Now().UTC()
	generatedAtRFC3339 := generatedAt.Format(time.RFC3339Nano)

	// 读取权限列表（requirePermission 已写入 context 缓存）
	permissions, _ := c.Get(authContextPermissionsKey).([]string)
	canReadAlerts := hasPermission("alerts:read", permissions)
	realtimeAlertsLimitedByPermission := !canReadAlerts

	type result[T any] struct {
		value T
		err   error
	}

	var (
		statsResult          result[monitoring.MonitoringStats]
		systemPerfResult     result[[]monitoringSystemPerformanceV2Point]
		tempResult           result[[]monitoring.TemperatureHistoryPoint]
		deviceStatusResult   result[monitoring.DeviceStatusDistribution]
		availabilityResult   result[monitoring.AvailabilitySnapshot]
		networkTrafficResult result[[]monitoring.NetworkTrafficPoint]
		realtimeAlertsResult result[[]monitoringV2RealtimeAlert]
	)

	wg := sync.WaitGroup{}

	wg.Add(1)
	go func() {
		defer wg.Done()
		value, err := writer.GetMonitoringStats(c.Request().Context())
		statsResult = result[monitoring.MonitoringStats]{value: value, err: err}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		points, err := writer.GetSystemPerformanceHistory(
			c.Request().Context(),
			startTime,
			endTime,
			[]string{"cpu_usage", "memory_usage", "network_traffic"},
		)
		if err != nil {
			systemPerfResult = result[[]monitoringSystemPerformanceV2Point]{value: []monitoringSystemPerformanceV2Point{}, err: err}
			return
		}
		out := make([]monitoringSystemPerformanceV2Point, 0, len(points))
		for _, point := range points {
			out = append(out, monitoringSystemPerformanceV2Point{
				Timestamp: point.Timestamp,
				CPU:       point.CPUUsage,
				Memory:    point.MemoryUsage,
				Network:   point.NetworkTraffic,
			})
		}
		systemPerfResult = result[[]monitoringSystemPerformanceV2Point]{value: out, err: nil}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		value, err := writer.GetTemperatureHistory(c.Request().Context(), startTime, endTime)
		tempResult = result[[]monitoring.TemperatureHistoryPoint]{value: value, err: err}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		value, err := writer.GetDeviceStatusDistribution(c.Request().Context())
		deviceStatusResult = result[monitoring.DeviceStatusDistribution]{value: value, err: err}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		value, err := writer.GetAvailability(c.Request().Context())
		availabilityResult = result[monitoring.AvailabilitySnapshot]{value: value, err: err}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		value, err := writer.GetNetworkTrafficHistory(c.Request().Context(), startTime, endTime)
		networkTrafficResult = result[[]monitoring.NetworkTrafficPoint]{value: value, err: err}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		if realtimeAlertsLimitedByPermission {
			// 权限限制不应被视为“分区失败”，因此这里不返回错误，由 sections 标记为受限即可。
			realtimeAlertsResult = result[[]monitoringV2RealtimeAlert]{value: []monitoringV2RealtimeAlert{}, err: nil}
			return
		}
		if h.AlertService == nil {
			realtimeAlertsResult = result[[]monitoringV2RealtimeAlert]{value: []monitoringV2RealtimeAlert{}, err: fmt.Errorf("告警服务未配置")}
			return
		}

		rows, _, err := h.AlertService.ListAlerts(c.Request().Context(), alerts.ListAlertsFilter{
			Page:      1,
			PageSize:  alertsLimit,
			SortBy:    "created_at",
			SortOrder: "desc",
		})
		if err != nil {
			realtimeAlertsResult = result[[]monitoringV2RealtimeAlert]{value: []monitoringV2RealtimeAlert{}, err: err}
			return
		}

		out := make([]monitoringV2RealtimeAlert, 0, len(rows))
		for _, row := range rows {
			msg := strings.TrimSpace(row.Title)
			if strings.TrimSpace(row.Message) != "" {
				msg = row.Message
			}
			out = append(out, monitoringV2RealtimeAlert{
				ID:         row.ID,
				Severity:   alerts.NormalizeSeverity(row.Severity),
				DeviceName: resolveDashboardAlertDevice(row),
				Message:    msg,
				Time:       resolveDashboardAlertTimestamp(row).Format("2006-01-02 15:04"),
			})
		}

		realtimeAlertsResult = result[[]monitoringV2RealtimeAlert]{value: out, err: nil}
	}()

	wg.Wait()

	// 口径收口：缺少 alerts:read 时，不应泄露 active_alerts。
	if !canReadAlerts && statsResult.err == nil {
		stats := statsResult.value
		stats.ActiveAlerts = 0
		statsResult.value = stats
	}

	sections := map[string]monitoringSectionStatus{
		"stats":             buildSectionStatus(statsResult.err, "统计指标加载失败"),
		"systemPerformance": buildSectionStatus(systemPerfResult.err, "系统性能数据加载失败"),
		"temperature":       buildSectionStatus(tempResult.err, "温度数据加载失败"),
		"deviceStatus":      buildSectionStatus(deviceStatusResult.err, "设备状态分布加载失败"),
		"availability":      buildSectionStatus(availabilityResult.err, "可用性数据加载失败"),
		"networkTraffic":    buildSectionStatus(networkTrafficResult.err, "网络流量数据加载失败"),
		"realtimeAlerts": func() monitoringSectionStatus {
			if realtimeAlertsLimitedByPermission {
				msg := "缺少告警查看权限（alerts:read），已自动隐藏"
				return monitoringSectionStatus{
					Ok:                  true,
					Message:             &msg,
					LimitedByPermission: true,
					RequiredPermission:  "alerts:read",
				}
			}
			return buildSectionStatus(realtimeAlertsResult.err, "实时告警加载失败")
		}(),
	}

	orderedKeys := []string{"stats", "systemPerformance", "temperature", "deviceStatus", "availability", "networkTraffic", "realtimeAlerts"}
	failedSections := make([]string, 0)
	effectiveSectionCount := 0
	for _, key := range orderedKeys {
		status, ok := sections[key]
		if !ok {
			continue
		}
		if status.LimitedByPermission {
			continue
		}
		effectiveSectionCount++
		if !status.Ok {
			failedSections = append(failedSections, key)
		}
	}

	// “全分区失败”判定：排除 LimitedByPermission 分区，否则会误把“权限受限但可访问分区全失败”当作 200。
	if effectiveSectionCount > 0 && len(failedSections) == effectiveSectionCount {
		return echo.NewHTTPError(http.StatusInternalServerError, "监控数据加载失败")
	}

	statsV2 := []monitoringV2StatCardData{}
	if sections["stats"].Ok {
		statsV2 = buildStatsV2(statsResult.value)
	}

	data := monitoringDashboardV2Data{
		SystemPerformance: systemPerfResult.value,
		TemperatureHistory: func() []monitoring.TemperatureHistoryPoint {
			if sections["temperature"].Ok {
				return tempResult.value
			}
			return []monitoring.TemperatureHistoryPoint{}
		}(),
		DeviceStatusDistribution: func() monitoring.DeviceStatusDistribution {
			if sections["deviceStatus"].Ok {
				return deviceStatusResult.value
			}
			return monitoring.DeviceStatusDistribution{Healthy: 0, Warning: 0, Critical: 0, Offline: 0}
		}(),
		Availability: func() monitoringAvailabilityV2 {
			if sections["availability"].Ok {
				value := availabilityResult.value
				resolvedLastUpdate := strings.TrimSpace(value.LastUpdate)
				if resolvedLastUpdate == "" {
					resolvedLastUpdate = generatedAtRFC3339
				}
				return monitoringAvailabilityV2{
					Current:    value.Current,
					Target:     value.Target,
					Trend:      value.Trend,
					LastUpdate: resolvedLastUpdate,
				}
			}
			return monitoringAvailabilityV2{Current: 0, Target: 99.9, Trend: "stable", LastUpdate: generatedAtRFC3339}
		}(),
		NetworkTrafficHistory: func() []monitoring.NetworkTrafficPoint {
			if sections["networkTraffic"].Ok {
				return networkTrafficResult.value
			}
			return []monitoring.NetworkTrafficPoint{}
		}(),
		StatsV2:        statsV2,
		RealtimeAlerts: realtimeAlertsResult.value,
		// 兼容字段：仍保留 lastUpdate，但语义应为“最新数据时间”（不是请求生成时间）。
		LastUpdate: generatedAtRFC3339,
	}

	// 语义修正：lastUpdate 应尽量反映“最新数据时间”，用于前端做数据新鲜度提示。
	// 规则：优先取各时序分区（性能/温度/流量）中最新的数据点时间；若均无数据，则回退为生成时间。
	resolvedLastUpdate := resolveMonitoringDashboardLastUpdate(generatedAt, data.SystemPerformance, data.TemperatureHistory, data.NetworkTrafficHistory)
	data.LastUpdate = resolvedLastUpdate

	return c.JSON(http.StatusOK, monitoringDashboardV2Envelope{
		Data:              data,
		Sections:          sections,
		HasPartialFailure: len(failedSections) > 0,
		FailedSections:    failedSections,
		LastUpdate:        resolvedLastUpdate,
		GeneratedAt:       generatedAtRFC3339,
	})
}

func resolveMonitoringDashboardLastUpdate(
	fallback time.Time,
	systemPerformance []monitoringSystemPerformanceV2Point,
	temperature []monitoring.TemperatureHistoryPoint,
	networkTraffic []monitoring.NetworkTrafficPoint,
) string {
	candidates := make([]string, 0, 3)

	if len(systemPerformance) > 0 {
		candidates = append(candidates, systemPerformance[len(systemPerformance)-1].Timestamp)
	}
	if len(temperature) > 0 {
		candidates = append(candidates, temperature[len(temperature)-1].Timestamp)
	}
	if len(networkTraffic) > 0 {
		candidates = append(candidates, networkTraffic[len(networkTraffic)-1].Timestamp)
	}

	latest := time.Time{}
	for _, raw := range candidates {
		t, ok := parseRFC3339Timestamp(raw)
		if !ok {
			continue
		}
		if latest.IsZero() || t.After(latest) {
			latest = t
		}
	}
	if latest.IsZero() {
		latest = fallback
	}
	return latest.UTC().Format(time.RFC3339Nano)
}

func parseRFC3339Timestamp(raw string) (time.Time, bool) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return time.Time{}, false
	}
	if t, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return t, true
	}
	if t, err := time.Parse(time.RFC3339, value); err == nil {
		return t, true
	}
	return time.Time{}, false
}

func buildSectionStatus(err error, fallback string) monitoringSectionStatus {
	if err == nil {
		return monitoringSectionStatus{Ok: true}
	}
	msg := strings.TrimSpace(err.Error())
	if msg == "" {
		msg = fallback
	}
	return monitoringSectionStatus{Ok: false, Message: &msg}
}

func resolveTimeRangeFromString(timeRange string, fallback time.Duration) (time.Time, time.Time) {
	end := time.Now().UTC()
	trimmed := strings.ToLower(strings.TrimSpace(timeRange))
	if trimmed == "" {
		return end.Add(-fallback), end
	}

	// 支持格式：{数字}{h|d|w}，例如 24h / 7d / 4w
	valuePart := trimmed[:len(trimmed)-1]
	unit := trimmed[len(trimmed)-1]
	value, err := strconv.Atoi(valuePart)
	if err != nil || value <= 0 {
		return end.Add(-fallback), end
	}

	switch unit {
	case 'h':
		return end.Add(-time.Duration(value) * time.Hour), end
	case 'd':
		return end.Add(-time.Duration(value) * 24 * time.Hour), end
	case 'w':
		return end.Add(-time.Duration(value) * 7 * 24 * time.Hour), end
	default:
		return end.Add(-fallback), end
	}
}

func buildStatsV2(stats monitoring.MonitoringStats) []monitoringV2StatCardData {
	availability := safeFloat(stats.Availability)
	avgCPU := safeFloat(stats.AvgCPU)
	avgMemory := safeFloat(stats.AvgMemory)
	peakNetworkBps := safeFloat(stats.AvgNetwork)

	return []monitoringV2StatCardData{
		{ID: "total_devices", Title: "总设备", Value: strconv.Itoa(stats.TotalDevices)},
		{ID: "availability", Title: "可用性", Value: fmt.Sprintf("%.1f%%", availability)},
		{ID: "active_alerts", Title: "活跃告警", Value: strconv.Itoa(stats.ActiveAlerts)},
		{ID: "avg_cpu", Title: "平均 CPU", Value: fmt.Sprintf("%.1f%%", avgCPU)},
		{ID: "avg_memory", Title: "平均内存", Value: fmt.Sprintf("%.1f%%", avgMemory)},
		{ID: "avg_network", Title: "峰值流量", Value: formatBandwidthValue(peakNetworkBps)},
	}
}

func safeFloat(value float64) float64 {
	if value < 0 {
		return 0
	}
	return value
}

func formatBandwidthValue(bps float64) string {
	if bps <= 0 {
		return "0 bps"
	}

	units := []string{"bps", "Kbps", "Mbps", "Gbps", "Tbps"}
	k := 1000.0
	value := bps
	unitIndex := 0
	for unitIndex < len(units)-1 && value >= k {
		value = value / k
		unitIndex++
	}

	switch {
	case value >= 100:
		return fmt.Sprintf("%.0f %s", value, units[unitIndex])
	case value >= 10:
		return fmt.Sprintf("%.1f %s", value, units[unitIndex])
	default:
		return fmt.Sprintf("%.2f %s", value, units[unitIndex])
	}
}

func resolveDashboardAlertTimestamp(row alerts.AlertWithDevice) time.Time {
	if row.LastOccurred != nil && !row.LastOccurred.IsZero() {
		return row.LastOccurred.UTC()
	}
	if row.FirstOccurred != nil && !row.FirstOccurred.IsZero() {
		return row.FirstOccurred.UTC()
	}
	if row.CreatedAt != nil && !row.CreatedAt.IsZero() {
		return row.CreatedAt.UTC()
	}
	return time.Now().UTC()
}

func resolveDashboardAlertDevice(row alerts.AlertWithDevice) string {
	if row.DeviceName != nil && strings.TrimSpace(*row.DeviceName) != "" {
		return strings.TrimSpace(*row.DeviceName)
	}
	if row.DeviceIP != nil && strings.TrimSpace(*row.DeviceIP) != "" {
		return strings.TrimSpace(*row.DeviceIP)
	}
	if row.DeviceID > 0 {
		return "设备#" + strconv.Itoa(row.DeviceID)
	}
	return "未知设备"
}

func (h MonitoringHandler) DownloadMonitoringReport(c echo.Context) error {
	if err := h.ensurePermission(c, monitoringExportPermission); err != nil {
		return err
	}
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

type downloadReportByTokenRequest struct {
	Token         string `json:"token"`
	DownloadToken string `json:"download_token"`
}

func (h MonitoringHandler) DownloadMonitoringReportByToken(c echo.Context) error {
	if h.DownloadTokens == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report download token not configured")
	}
	if strings.TrimSpace(h.ReportOutputDir) == "" {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report output not configured")
	}

	token := strings.TrimSpace(c.FormValue("token"))
	if token == "" {
		token = strings.TrimSpace(c.FormValue("download_token"))
	}
	if token == "" {
		var req downloadReportByTokenRequest
		if err := c.Bind(&req); err == nil {
			token = strings.TrimSpace(req.Token)
			if token == "" {
				token = strings.TrimSpace(req.DownloadToken)
			}
		}
	}
	if token == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "token is required")
	}

	filename, ok, err := h.DownloadTokens.Consume(c.Request().Context(), token)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to verify download token")
	}
	if !ok {
		return echo.NewHTTPError(http.StatusNotFound, "download token expired")
	}

	rawName := strings.TrimSpace(filename)
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

	c.Response().Header().Set(echo.HeaderCacheControl, "no-store")
	return c.Attachment(filePath, safeName)
}

type checkReportDownloadTokenResponse struct {
	Valid         bool   `json:"valid"`
	Message       string `json:"message,omitempty"`
	Filename      string `json:"filename,omitempty"`
	ExpiresAt     string `json:"expires_at,omitempty"`
	RemainingUses int    `json:"remaining_uses,omitempty"`
}

func (h MonitoringHandler) CheckMonitoringReportDownloadToken(c echo.Context) error {
	if err := h.ensurePermission(c, monitoringExportPermission); err != nil {
		return err
	}
	if h.DownloadTokens == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report download token not configured")
	}
	if strings.TrimSpace(h.ReportOutputDir) == "" {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report output not configured")
	}

	token := strings.TrimSpace(c.FormValue("token"))
	if token == "" {
		token = strings.TrimSpace(c.FormValue("download_token"))
	}
	if token == "" {
		var req downloadReportByTokenRequest
		if err := c.Bind(&req); err == nil {
			token = strings.TrimSpace(req.Token)
			if token == "" {
				token = strings.TrimSpace(req.DownloadToken)
			}
		}
	}
	if token == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "token is required")
	}

	info, ok, err := h.DownloadTokens.Inspect(c.Request().Context(), token)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to verify download token")
	}
	if !ok {
		c.Response().Header().Set(echo.HeaderCacheControl, "no-store")
		return c.JSON(http.StatusOK, checkReportDownloadTokenResponse{
			Valid:   false,
			Message: "下载票据已过期或已使用，请重新导出",
		})
	}

	rawName := strings.TrimSpace(info.Filename)
	safeName := filepath.Base(rawName)
	if rawName == "" || safeName == "." || safeName != rawName {
		c.Response().Header().Set(echo.HeaderCacheControl, "no-store")
		return c.JSON(http.StatusOK, checkReportDownloadTokenResponse{
			Valid:   false,
			Message: "票据对应的文件名非法",
		})
	}

	filePath := filepath.Join(h.ReportOutputDir, safeName)
	if _, err := os.Stat(filePath); err != nil {
		if os.IsNotExist(err) {
			c.Response().Header().Set(echo.HeaderCacheControl, "no-store")
			return c.JSON(http.StatusOK, checkReportDownloadTokenResponse{
				Valid:   false,
				Message: "报告文件不存在或已过期，请重新导出",
			})
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to access report")
	}

	c.Response().Header().Set(echo.HeaderCacheControl, "no-store")
	return c.JSON(http.StatusOK, checkReportDownloadTokenResponse{
		Valid:         true,
		Filename:      safeName,
		ExpiresAt:     info.ExpiresAt.UTC().Format(time.RFC3339Nano),
		RemainingUses: info.RemainingUses,
	})
}

func (h MonitoringHandler) StartDeviceMonitoring(c echo.Context) error {
	return h.updateDeviceMonitoring(c, true)
}

func (h MonitoringHandler) StopDeviceMonitoring(c echo.Context) error {
	return h.updateDeviceMonitoring(c, false)
}

func (h MonitoringHandler) updateDeviceMonitoring(c echo.Context, enabled bool) error {
	if err := h.ensurePermission(c, monitoringControlPermission); err != nil {
		return err
	}
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
	if err := h.ensurePermission(c, monitoringReadPermission); err != nil {
		return err
	}
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
