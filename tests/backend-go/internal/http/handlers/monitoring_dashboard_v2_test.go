package handlers_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

type stubDashboardWriter struct {
	stats             monitoring.MonitoringStats
	statsErr          error
	systemPerf        []monitoring.SystemPerformancePoint
	systemPerfErr     error
	temperature       []monitoring.TemperatureHistoryPoint
	temperatureErr    error
	deviceStatus      monitoring.DeviceStatusDistribution
	deviceStatusErr   error
	availability      monitoring.AvailabilitySnapshot
	availabilityErr   error
	networkTraffic    []monitoring.NetworkTrafficPoint
	networkTrafficErr error
}

func (s stubDashboardWriter) GetMonitoringStats(_ context.Context) (monitoring.MonitoringStats, error) {
	return s.stats, s.statsErr
}

func (s stubDashboardWriter) GetSystemPerformanceHistory(_ context.Context, _ time.Time, _ time.Time, _ []string) ([]monitoring.SystemPerformancePoint, error) {
	return s.systemPerf, s.systemPerfErr
}

func (s stubDashboardWriter) GetTemperatureHistory(_ context.Context, _ time.Time, _ time.Time) ([]monitoring.TemperatureHistoryPoint, error) {
	return s.temperature, s.temperatureErr
}

func (s stubDashboardWriter) GetDeviceStatusDistribution(_ context.Context) (monitoring.DeviceStatusDistribution, error) {
	return s.deviceStatus, s.deviceStatusErr
}

func (s stubDashboardWriter) GetAvailability(_ context.Context) (monitoring.AvailabilitySnapshot, error) {
	return s.availability, s.availabilityErr
}

func (s stubDashboardWriter) GetNetworkTrafficHistory(_ context.Context, _ time.Time, _ time.Time) ([]monitoring.NetworkTrafficPoint, error) {
	return s.networkTraffic, s.networkTrafficErr
}

type dashboardV2SectionStatus struct {
	Ok                  bool   `json:"ok"`
	LimitedByPermission bool   `json:"limitedByPermission"`
	RequiredPermission  string `json:"requiredPermission"`
}

type dashboardV2StatCard struct {
	ID    string `json:"id"`
	Value string `json:"value"`
}

type dashboardV2Envelope struct {
	Data struct {
		StatsV2            []dashboardV2StatCard `json:"statsV2"`
		RealtimeAlerts     []interface{}         `json:"realtimeAlerts"`
		TemperatureHistory []interface{}         `json:"temperatureHistory"`
	} `json:"data"`
	Sections          map[string]dashboardV2SectionStatus `json:"sections"`
	HasPartialFailure bool                               `json:"hasPartialFailure"`
	FailedSections    []string                           `json:"failedSections"`
}

func TestMonitoringHandler_GetMonitoringDashboardV2_AlertsLimitedByPermission(t *testing.T) {
	e := echo.New()
	authService, token := newAuthServiceWithPermissions(t, []string{"monitoring:read"})

	h := handlers.MonitoringHandler{
		DashboardWriter: stubDashboardWriter{
			stats: monitoring.MonitoringStats{
				TotalDevices: 3,
				Availability: 99.9,
				ActiveAlerts: 7,
				AvgCPU:       1.2,
				AvgMemory:    3.4,
				AvgNetwork:   1000,
			},
			systemPerf:     []monitoring.SystemPerformancePoint{},
			temperature:    []monitoring.TemperatureHistoryPoint{},
			deviceStatus:   monitoring.DeviceStatusDistribution{Healthy: 1, Warning: 0, Critical: 0, Offline: 2},
			availability:   monitoring.AvailabilitySnapshot{Current: 99.9, Target: 99.9, Trend: "stable"},
			networkTraffic: []monitoring.NetworkTrafficPoint{},
		},
		Auth: authService,
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/dashboard/v2", strings.NewReader(`{}`))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.GetMonitoringDashboardV2(c); err != nil {
		e.HTTPErrorHandler(err, c)
	}

	res := rec.Result()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("期望 200，实际=%d body=%s", res.StatusCode, rec.Body.String())
	}

	var envelope dashboardV2Envelope
	if err := json.Unmarshal(rec.Body.Bytes(), &envelope); err != nil {
		t.Fatalf("json.Unmarshal err=%v body=%s", err, rec.Body.String())
	}

	if envelope.HasPartialFailure {
		t.Fatalf("期望 hasPartialFailure=false，failed=%v", envelope.FailedSections)
	}
	if len(envelope.FailedSections) != 0 {
		t.Fatalf("期望 failedSections 为空，got=%v", envelope.FailedSections)
	}

	realtimeStatus, ok := envelope.Sections["realtimeAlerts"]
	if !ok {
		t.Fatalf("期望包含 realtimeAlerts 分区状态")
	}
	if !realtimeStatus.Ok || !realtimeStatus.LimitedByPermission || realtimeStatus.RequiredPermission != "alerts:read" {
		t.Fatalf("期望 realtimeAlerts=Ok 且 LimitedByPermission=true，got=%+v", realtimeStatus)
	}
	if len(envelope.Data.RealtimeAlerts) != 0 {
		t.Fatalf("期望 realtimeAlerts 数据为空，got=%v", envelope.Data.RealtimeAlerts)
	}

	var activeAlertsValue *string
	for _, card := range envelope.Data.StatsV2 {
		if card.ID == "active_alerts" {
			value := card.Value
			activeAlertsValue = &value
			break
		}
	}
	if activeAlertsValue == nil {
		t.Fatalf("期望 statsV2 包含 active_alerts 卡片")
	}
	if *activeAlertsValue != "0" {
		t.Fatalf("期望 active_alerts 被权限遮蔽为 0，got=%q", *activeAlertsValue)
	}
}

func TestMonitoringHandler_GetMonitoringDashboardV2_PartialFailureTemperature(t *testing.T) {
	e := echo.New()
	authService, token := newAuthServiceWithPermissions(t, []string{"monitoring:read"})

	h := handlers.MonitoringHandler{
		DashboardWriter: stubDashboardWriter{
			stats: monitoring.MonitoringStats{
				TotalDevices: 3,
				Availability: 99.9,
				ActiveAlerts: 7,
				AvgCPU:       1.2,
				AvgMemory:    3.4,
				AvgNetwork:   1000,
			},
			systemPerf:     []monitoring.SystemPerformancePoint{},
			temperatureErr: errors.New("temperature query failed"),
			deviceStatus:   monitoring.DeviceStatusDistribution{Healthy: 1, Warning: 0, Critical: 0, Offline: 2},
			availability:   monitoring.AvailabilitySnapshot{Current: 99.9, Target: 99.9, Trend: "stable"},
			networkTraffic: []monitoring.NetworkTrafficPoint{},
		},
		Auth: authService,
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/dashboard/v2", strings.NewReader(`{"time_range":"24h"}`))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.GetMonitoringDashboardV2(c); err != nil {
		e.HTTPErrorHandler(err, c)
	}

	res := rec.Result()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("期望 200，实际=%d body=%s", res.StatusCode, rec.Body.String())
	}

	var envelope dashboardV2Envelope
	if err := json.Unmarshal(rec.Body.Bytes(), &envelope); err != nil {
		t.Fatalf("json.Unmarshal err=%v body=%s", err, rec.Body.String())
	}

	if !envelope.HasPartialFailure {
		t.Fatalf("期望 hasPartialFailure=true")
	}

	found := false
	for _, item := range envelope.FailedSections {
		if item == "temperature" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("期望 failedSections 包含 temperature，got=%v", envelope.FailedSections)
	}
	if status, ok := envelope.Sections["temperature"]; !ok || status.Ok {
		t.Fatalf("期望 temperature 分区状态为失败，got=%+v", status)
	}
	if len(envelope.Data.TemperatureHistory) != 0 {
		t.Fatalf("期望 temperatureHistory 降级为空，got=%v", envelope.Data.TemperatureHistory)
	}
}

func TestMonitoringHandler_GetMonitoringDashboardV2_AllAccessibleSectionsFailed_Returns500(t *testing.T) {
	e := echo.New()
	authService, token := newAuthServiceWithPermissions(t, []string{"monitoring:read"})

	h := handlers.MonitoringHandler{
		DashboardWriter: stubDashboardWriter{
			statsErr:          errors.New("stats failed"),
			systemPerfErr:     errors.New("perf failed"),
			temperatureErr:    errors.New("temp failed"),
			deviceStatusErr:   errors.New("status failed"),
			availabilityErr:   errors.New("availability failed"),
			networkTrafficErr: errors.New("network failed"),
		},
		Auth: authService,
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/dashboard/v2", strings.NewReader(`{}`))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.GetMonitoringDashboardV2(c); err != nil {
		e.HTTPErrorHandler(err, c)
	}

	res := rec.Result()
	if res.StatusCode != http.StatusInternalServerError {
		t.Fatalf("期望 500，实际=%d body=%s", res.StatusCode, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "监控数据加载失败") {
		t.Fatalf("期望错误信息包含“监控数据加载失败”，body=%s", rec.Body.String())
	}
}

func TestMonitoringHandler_GetMonitoringStats_MasksActiveAlertsWithoutPermission(t *testing.T) {
	e := echo.New()
	authService, token := newAuthServiceWithPermissions(t, []string{"monitoring:read"})

	h := handlers.MonitoringHandler{
		DashboardWriter: stubDashboardWriter{
			stats: monitoring.MonitoringStats{
				TotalDevices: 3,
				Availability: 99.9,
				ActiveAlerts: 9,
				AvgCPU:       1.2,
				AvgMemory:    3.4,
				AvgNetwork:   1000,
			},
		},
		Auth: authService,
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/monitoring/stats", nil)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.GetMonitoringStats(c); err != nil {
		e.HTTPErrorHandler(err, c)
	}

	res := rec.Result()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("期望 200，实际=%d body=%s", res.StatusCode, rec.Body.String())
	}

	var out monitoring.MonitoringStats
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("json.Unmarshal err=%v body=%s", err, rec.Body.String())
	}
	if out.ActiveAlerts != 0 {
		t.Fatalf("期望 active_alerts 被遮蔽为 0，got=%d", out.ActiveAlerts)
	}
}

