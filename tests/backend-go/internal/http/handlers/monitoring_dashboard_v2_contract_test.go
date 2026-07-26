package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

type testMonitoringDashboardWriter struct{}

func (testMonitoringDashboardWriter) GetMonitoringStats(_ context.Context, _ []int) (monitoring.MonitoringStats, error) {
	return monitoring.MonitoringStats{
		TotalDevices: 1,
		ActiveAlerts: 3,
		AvgCPU:       1,
		AvgMemory:    2,
		PeakOutbound: 12266,
		PeakInbound:  2818,
	}, nil
}

func (testMonitoringDashboardWriter) GetSystemPerformanceHistory(_ context.Context, _ time.Time, _ time.Time, _ []string, _ []int) ([]monitoring.SystemPerformancePoint, error) {
	return []monitoring.SystemPerformancePoint{
		{
			Timestamp:      "2026-03-15T00:00:00Z",
			CPUUsage:       1,
			MemoryUsage:    2,
			NetworkTraffic: 3,
		},
	}, nil
}

func (testMonitoringDashboardWriter) GetTemperatureHistory(_ context.Context, _ time.Time, _ time.Time, _ []int) ([]monitoring.TemperatureHistoryPoint, error) {
	return []monitoring.TemperatureHistoryPoint{
		{
			Timestamp: "2026-03-15T01:00:00Z",
			Devices:   map[string]float64{"device-1": 42},
		},
	}, nil
}

func (testMonitoringDashboardWriter) GetDeviceStatusDistribution(_ context.Context, _ []int) (monitoring.DeviceStatusDistribution, error) {
	return monitoring.DeviceStatusDistribution{Healthy: 1, Warning: 0, Critical: 0, Offline: 0}, nil
}

func (testMonitoringDashboardWriter) GetNetworkTrafficHistory(_ context.Context, _ time.Time, _ time.Time, _ []int) ([]monitoring.NetworkTrafficPoint, error) {
	return []monitoring.NetworkTrafficPoint{
		{
			Timestamp: "2026-03-15T02:00:00Z",
			Inbound:   1,
			Outbound:  2,
		},
	}, nil
}

func TestGetMonitoringDashboardV2_ContractKeysAndSections(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/dashboard/v2", bytes.NewBufferString(`{"time_range":"24h","alerts_limit":10}`))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	authService, token := newAuthServiceWithPermissions(t, []string{"monitoring:read"})
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	// 故意不包含 alerts:read，验证 realtimeAlerts 分区“权限降级”契约
	handler := handlers.MonitoringHandler{
		DashboardWriter: testMonitoringDashboardWriter{},
		Auth:            authService,
	}

	if err := handler.GetMonitoringDashboardV2(c); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", rec.Code, rec.Body.String())
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("invalid json: %v, body=%s", err, rec.Body.String())
	}

	// 顶层字段必须为 camelCase（前端按该契约解析）
	requiredTopKeys := []string{"data", "sections", "failedSections", "hasPartialFailure", "lastUpdate"}
	for _, key := range requiredTopKeys {
		if _, ok := payload[key]; !ok {
			t.Fatalf("missing top-level key: %s", key)
		}
	}
	if _, ok := payload["failed_sections"]; ok {
		t.Fatalf("should not output snake_case key: failed_sections")
	}

	sections, ok := payload["sections"].(map[string]interface{})
	if !ok {
		t.Fatalf("sections should be object, got %T", payload["sections"])
	}

	requiredSectionKeys := []string{"stats", "systemPerformance", "temperature", "deviceStatus", "networkTraffic", "realtimeAlerts"}
	for _, key := range requiredSectionKeys {
		if _, ok := sections[key]; !ok {
			t.Fatalf("missing sections key: %s", key)
		}
	}
	if _, ok := sections["availability"]; ok {
		t.Fatalf("sections should not contain removed key: availability")
	}

	realtime, ok := sections["realtimeAlerts"].(map[string]interface{})
	if !ok {
		t.Fatalf("sections.realtimeAlerts should be object, got %T", sections["realtimeAlerts"])
	}
	if realtime["limitedByPermission"] != true {
		t.Fatalf("expected realtimeAlerts.limitedByPermission=true, got %v", realtime["limitedByPermission"])
	}
	if realtime["requiredPermission"] != "alerts:read" {
		t.Fatalf("expected realtimeAlerts.requiredPermission=alerts:read, got %v", realtime["requiredPermission"])
	}

	// 权限受限分区不应进入 failedSections
	failed, ok := payload["failedSections"].([]interface{})
	if !ok {
		t.Fatalf("failedSections should be array, got %T", payload["failedSections"])
	}
	for _, item := range failed {
		if s, ok := item.(string); ok && s == "realtimeAlerts" {
			t.Fatalf("realtimeAlerts should not be in failedSections when limited by permission")
		}
	}

	data, ok := payload["data"].(map[string]interface{})
	if !ok {
		t.Fatalf("data should be object, got %T", payload["data"])
	}
	requiredDataKeys := []string{"systemPerformance", "temperatureHistory", "deviceStatusDistribution", "networkTrafficHistory", "statsV2", "realtimeAlerts", "lastUpdate"}
	for _, key := range requiredDataKeys {
		if _, ok := data[key]; !ok {
			t.Fatalf("missing data key: %s", key)
		}
	}
	if _, ok := data["availability"]; ok {
		t.Fatalf("data should not contain removed key: availability")
	}
	if _, ok := data["realtimeAlerts"].([]interface{}); !ok {
		t.Fatalf("data.realtimeAlerts should be array, got %T", data["realtimeAlerts"])
	}

	// statsV2 六卡契约：可用性卡移除，峰值流量拆分为上行/下行
	statsV2, ok := data["statsV2"].([]interface{})
	if !ok {
		t.Fatalf("data.statsV2 should be array, got %T", data["statsV2"])
	}
	wantStatIDs := []string{"total_devices", "active_alerts", "avg_cpu", "avg_memory", "peak_outbound", "peak_inbound"}
	if len(statsV2) != len(wantStatIDs) {
		t.Fatalf("statsV2 length = %d, want %d", len(statsV2), len(wantStatIDs))
	}
	for i, want := range wantStatIDs {
		card, ok := statsV2[i].(map[string]interface{})
		if !ok {
			t.Fatalf("statsV2[%d] should be object, got %T", i, statsV2[i])
		}
		if card["id"] != want {
			t.Fatalf("statsV2[%d].id = %v, want %s", i, card["id"], want)
		}
	}
	upstreamCard := statsV2[4].(map[string]interface{})
	if upstreamCard["title"] != "上行流量" || upstreamCard["value"] != "12.3 Kbps" {
		t.Fatalf("upstream card = %v, want title 上行流量 value 12.3 Kbps", upstreamCard)
	}
	downstreamCard := statsV2[5].(map[string]interface{})
	if downstreamCard["title"] != "下行流量" || downstreamCard["value"] != "2.82 Kbps" {
		t.Fatalf("downstream card = %v, want title 下行流量 value 2.82 Kbps", downstreamCard)
	}

	// lastUpdate 语义：应尽量反映“最新数据时间”，这里取系统性能/温度/流量中最新的时间点（02:00）。
	if payload["lastUpdate"] != "2026-03-15T02:00:00Z" {
		t.Fatalf("expected lastUpdate=2026-03-15T02:00:00Z, got %v", payload["lastUpdate"])
	}
	if data["lastUpdate"] != "2026-03-15T02:00:00Z" {
		t.Fatalf("expected data.lastUpdate=2026-03-15T02:00:00Z, got %v", data["lastUpdate"])
	}
}
