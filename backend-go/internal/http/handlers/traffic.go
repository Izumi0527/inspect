package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/traffic"
)

type TrafficHandler struct {
	Service *traffic.Service
	Auth    PermissionService
}

func (h TrafficHandler) Register(group *echo.Group) {
	group.GET("/traffic/summary", h.GetTrafficSummary)
	group.GET("/traffic/devices/:device_id", h.GetDeviceTraffic)
	group.GET("/traffic/devices/:device_id/trend", h.GetDeviceTrafficTrend)
	group.POST("/traffic/collect", h.CollectTrafficData)
	group.GET("/traffic/anomalies", h.GetTrafficAnomalies)
	group.GET("/traffic/trends/:device_ip", h.GetTrafficTrends)
	group.GET("/traffic/top-talkers", h.GetTopTalkers)
	group.GET("/traffic/bandwidth-utilization", h.GetBandwidthUtilization)
	group.GET("/traffic/high-utilization", h.GetHighUtilizationInterfaces)
	group.POST("/traffic/baseline/calculate", h.CalculateBaseline)
	group.POST("/traffic/monitoring/start", h.StartMonitoring)
	group.DELETE("/traffic/data/cleanup", h.CleanupData)
}

func (h TrafficHandler) GetTrafficSummary(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "traffic service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	timeRange := strings.TrimSpace(c.QueryParam("time_range"))
	deviceIPs := parseQueryValues(c.QueryParams()["device_ips"])
	hours := parseIntDefault(c.QueryParam("hours"), 24)

	resp, err := h.Service.GetNetworkTrafficSummary(c.Request().Context(), timeRange)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load traffic summary")
	}

	summary, err := h.Service.GetTrafficSummary(c.Request().Context(), deviceIPs, hours)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load traffic analysis summary")
	}
	resp.Summary = &summary

	return c.JSON(http.StatusOK, resp)
}

func (h TrafficHandler) GetDeviceTraffic(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "traffic service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	deviceID, err := parseIDParam(c, "device_id")
	if err != nil {
		return err
	}

	resp, err := h.Service.GetDeviceTraffic(c.Request().Context(), deviceID)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return echo.NewHTTPError(http.StatusNotFound, "device not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load device traffic")
	}

	return c.JSON(http.StatusOK, resp)
}

func (h TrafficHandler) GetDeviceTrafficTrend(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "traffic service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	deviceID, err := parseIDParam(c, "device_id")
	if err != nil {
		return err
	}

	interfaceIndex := strings.TrimSpace(c.QueryParam("interface_index"))
	var interfacePtr *string
	if interfaceIndex != "" {
		interfacePtr = &interfaceIndex
	}

	startValue, err := parseTimeOptional(c.QueryParam("start_time"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid start_time")
	}
	endValue, err := parseTimeOptional(c.QueryParam("end_time"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid end_time")
	}

	endTime := time.Now().UTC()
	if endValue != nil {
		endTime = endValue.UTC()
	}
	startTime := endTime.Add(-24 * time.Hour)
	if startValue != nil {
		startTime = startValue.UTC()
	}
	if startTime.After(endTime) {
		return echo.NewHTTPError(http.StatusBadRequest, "start_time must be before end_time")
	}

	interval := strings.TrimSpace(c.QueryParam("interval"))
	if interval == "" {
		interval = "5m"
	}

	resp, err := h.Service.GetTrafficTrend(c.Request().Context(), deviceID, interfacePtr, startTime, endTime, interval)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return echo.NewHTTPError(http.StatusNotFound, "device not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load traffic trend")
	}

	return c.JSON(http.StatusOK, resp)
}

func (h TrafficHandler) GetTopTalkers(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "traffic service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	limit := parseIntDefault(c.QueryParam("limit"), 10)
	if limit <= 0 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}
	sortBy := strings.TrimSpace(c.QueryParam("sort_by"))
	if sortBy == "" {
		sortBy = "total"
	}

	resp, err := h.Service.GetTopTalkers(c.Request().Context(), limit, sortBy)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load top talkers")
	}

	return c.JSON(http.StatusOK, resp)
}

func (h TrafficHandler) GetBandwidthUtilization(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "traffic service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	var deviceID *int
	if value := strings.TrimSpace(c.QueryParam("device_id")); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed <= 0 {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid device_id")
		}
		deviceID = &parsed
	}

	threshold := parseFloatDefault(c.QueryParam("threshold"), 0)
	if threshold < 0 {
		threshold = 0
	}
	if threshold > 100 {
		threshold = 100
	}

	resp, err := h.Service.GetBandwidthUtilization(c.Request().Context(), deviceID, threshold, 0)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load bandwidth utilization")
	}

	return c.JSON(http.StatusOK, resp)
}

func (h TrafficHandler) GetHighUtilizationInterfaces(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "traffic service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	threshold := parseFloatDefault(c.QueryParam("threshold"), 80)
	if threshold < 0 {
		threshold = 0
	}
	if threshold > 100 {
		threshold = 100
	}

	limit := parseIntDefault(c.QueryParam("limit"), 20)
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	resp, err := h.Service.GetBandwidthUtilization(c.Request().Context(), nil, threshold, limit)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load high utilization interfaces")
	}

	return c.JSON(http.StatusOK, resp)
}

func (h TrafficHandler) CollectTrafficData(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "traffic service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	deviceIP := strings.TrimSpace(c.QueryParam("device_ip"))
	if deviceIP == "" {
		payload := map[string]interface{}{}
		_ = c.Bind(&payload)
		if value, ok := payload["device_ip"].(string); ok {
			deviceIP = strings.TrimSpace(value)
		}
	}
	if deviceIP == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "device_ip is required")
	}

	resp, err := h.Service.CollectTrafficData(c.Request().Context(), deviceIP)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return echo.NewHTTPError(http.StatusNotFound, "device not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to collect traffic data")
	}

	return c.JSON(http.StatusOK, resp)
}

func (h TrafficHandler) GetTrafficTrends(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "traffic service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	deviceIP := strings.TrimSpace(c.Param("device_ip"))
	if deviceIP == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "device_ip is required")
	}
	hours := parseIntDefault(c.QueryParam("hours"), 24)

	resp, err := h.Service.GetTrafficTrends(c.Request().Context(), deviceIP, hours)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return echo.NewHTTPError(http.StatusNotFound, "device not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load traffic trends")
	}

	return c.JSON(http.StatusOK, resp)
}

func (h TrafficHandler) GetTrafficAnomalies(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "traffic service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	var deviceIP *string
	if value := strings.TrimSpace(c.QueryParam("device_ip")); value != "" {
		deviceIP = &value
	}
	var severity *string
	if value := strings.TrimSpace(c.QueryParam("severity")); value != "" {
		severity = &value
	}
	hours := parseIntDefault(c.QueryParam("hours"), 24)

	resp, err := h.Service.GetTrafficAnomalies(c.Request().Context(), deviceIP, severity, hours)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return echo.NewHTTPError(http.StatusNotFound, "device not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load traffic anomalies")
	}

	return c.JSON(http.StatusOK, resp)
}

func (h TrafficHandler) CalculateBaseline(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "traffic service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	deviceIP := strings.TrimSpace(c.QueryParam("device_ip"))
	if deviceIP == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "device_ip is required")
	}
	iface := strings.TrimSpace(c.QueryParam("interface"))
	if iface == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "interface is required")
	}
	hours := parseIntDefault(c.QueryParam("hours"), 24)

	baseline, err := h.Service.CalculateBaseline(c.Request().Context(), deviceIP, iface, hours)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return echo.NewHTTPError(http.StatusNotFound, "device not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to calculate baseline")
	}

	return c.JSON(http.StatusOK, traffic.TrafficBaselineResponse{
		Success:  true,
		Baseline: baseline,
	})
}

func (h TrafficHandler) StartMonitoring(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "traffic service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	deviceIPs := readStringSlice(payload, "device_ips", "deviceIps")
	hours, _ := readInt(payload, "analysis_period_hours", "analysisPeriodHours")
	enableAnomaly, ok := readBool(payload, "enable_anomaly_detection", "enableAnomalyDetection")
	if !ok {
		enableAnomaly = true
	}

	config, err := h.Service.SaveMonitoringConfig(c.Request().Context(), deviceIPs, hours, enableAnomaly)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to save monitoring config")
	}

	return c.JSON(http.StatusOK, config)
}

func (h TrafficHandler) CleanupData(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "traffic service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	olderThan := parseIntDefault(c.QueryParam("older_than_hours"), 168)
	deleted, err := h.Service.CleanupData(c.Request().Context(), olderThan)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to cleanup traffic data")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success":       true,
		"deleted_count": deleted,
	})
}

func parseFloatDefault(raw string, fallback float64) float64 {
	value := strings.TrimSpace(raw)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return fallback
	}
	return parsed
}
