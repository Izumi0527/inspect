package monitoring

import (
	"context"
	"testing"
	"time"

	"gorm.io/gorm"
)

func TestComputeAggregateTrends(t *testing.T) {
	t.Run("empty input returns empty slice", func(t *testing.T) {
		if got := computeAggregateTrends(nil, nil); len(got) != 0 {
			t.Fatalf("expected empty slice for nil input, got %d items", len(got))
		}
		emptyDevices := []DevicePerformancePoint{{Timestamp: "2026-11-24T00:00:00Z", Devices: map[string]DevicePerformanceValue{}}}
		if got := computeAggregateTrends(emptyDevices, nil); len(got) != 0 {
			t.Fatalf("expected empty slice when devices map is empty, got %d items", len(got))
		}
	})

	t.Run("multi-device stats and distinct CPU vs memory peak devices", func(t *testing.T) {
		points := []DevicePerformancePoint{
			{
				Timestamp: "2026-11-24T08:00:00Z",
				Devices: map[string]DevicePerformanceValue{
					"core-sw-01": {CPU: 91.5, Memory: 42.0},
					"db-srv-02":  {CPU: 35.0, Memory: 88.5},
					"edge-03":    {CPU: 53.5, Memory: 64.5},
				},
			},
		}
		nameToID := map[string]int{
			"core-sw-01": 101,
			"db-srv-02":  202,
			"edge-03":    303,
		}

		got := computeAggregateTrends(points, nameToID)
		if len(got) != 1 {
			t.Fatalf("expected 1 point, got %d", len(got))
		}
		pt := got[0]
		if pt.MeanCPU != 60.0 || pt.P95CPU != 91.5 || pt.MaxCPU != 91.5 {
			t.Fatalf("unexpected CPU stats: mean=%v p95=%v max=%v", pt.MeanCPU, pt.P95CPU, pt.MaxCPU)
		}
		if pt.MeanMemory != 65.0 || pt.P95Memory != 88.5 || pt.MaxMemory != 88.5 {
			t.Fatalf("unexpected memory stats: mean=%v p95=%v max=%v", pt.MeanMemory, pt.P95Memory, pt.MaxMemory)
		}
		if pt.PeakDeviceID != 101 || pt.PeakDeviceName != "core-sw-01" {
			t.Fatalf("unexpected CPU peak device: id=%d name=%q", pt.PeakDeviceID, pt.PeakDeviceName)
		}
		if pt.PeakMemoryDeviceID != 202 || pt.PeakMemoryDeviceName != "db-srv-02" {
			t.Fatalf("unexpected memory peak device: id=%d name=%q", pt.PeakMemoryDeviceID, pt.PeakMemoryDeviceName)
		}
	})

	t.Run("tied peaks resolve deterministically by sorted device name", func(t *testing.T) {
		points := []DevicePerformancePoint{
			{
				Timestamp: "2026-11-24T08:05:00Z",
				Devices: map[string]DevicePerformanceValue{
					"zeta-node":  {CPU: 80.0, Memory: 75.0},
					"alpha-node": {CPU: 80.0, Memory: 75.0},
					"mid-node":   {CPU: 80.0, Memory: 75.0},
				},
			},
		}
		nameToID := map[string]int{
			"alpha-node": 1,
			"mid-node":   2,
			"zeta-node":  3,
		}

		for i := 0; i < 20; i++ {
			got := computeAggregateTrends(points, nameToID)
			if len(got) != 1 {
				t.Fatalf("expected 1 point, got %d", len(got))
			}
			if got[0].PeakDeviceName != "alpha-node" || got[0].PeakDeviceID != 1 {
				t.Fatalf("iteration %d: expected deterministic CPU peak alpha-node (1), got %q (%d)", i, got[0].PeakDeviceName, got[0].PeakDeviceID)
			}
			if got[0].PeakMemoryDeviceName != "alpha-node" || got[0].PeakMemoryDeviceID != 1 {
				t.Fatalf("iteration %d: expected deterministic memory peak alpha-node (1), got %q (%d)", i, got[0].PeakMemoryDeviceName, got[0].PeakMemoryDeviceID)
			}
		}
	})
}

func TestLookupDeviceIDsByNamesFallback(t *testing.T) {
	writer := NewMetricsWriter(nil, nil, nil)
	points := []DevicePerformancePoint{
		{
			Timestamp: "2026-11-24T08:00:00Z",
			Devices: map[string]DevicePerformanceValue{
				"device_42":  {CPU: 77.0, Memory: 30.0},
				"device_99":  {CPU: 20.0, Memory: 85.0},
				"device_abc": {CPU: 10.0, Memory: 10.0},
				"device_0":   {CPU: 5.0, Memory: 5.0},
			},
		},
	}

	got := writer.lookupDeviceIDsByNames(context.Background(), points, nil)
	if got["device_42"] != 42 {
		t.Fatalf("expected device_42 -> 42, got %d", got["device_42"])
	}
	if got["device_99"] != 99 {
		t.Fatalf("expected device_99 -> 99, got %d", got["device_99"])
	}
	if _, ok := got["device_abc"]; ok {
		t.Fatalf("expected invalid fallback device_abc to be ignored")
	}
	if _, ok := got["device_0"]; ok {
		t.Fatalf("expected non-positive fallback device_0 to be ignored")
	}

	filtered := writer.lookupDeviceIDsByNames(context.Background(), points, []int{42})
	if filtered["device_42"] != 42 {
		t.Fatalf("expected whitelisted device_42 -> 42, got %d", filtered["device_42"])
	}
	if _, ok := filtered["device_99"]; ok {
		t.Fatalf("expected non-whitelisted device_99 to be excluded when deviceIDs=[42]")
	}

	emptyWriter := &MetricsWriter{db: &gorm.DB{}}
	if emptyMap := emptyWriter.lookupDeviceIDsByNames(context.Background(), points, []int{}); len(emptyMap) != 0 {
		t.Fatalf("expected empty map for non-nil empty deviceIDs, got %#v", emptyMap)
	}

	enrichment := writer.BuildDashboardV2Enrichment(
		context.Background(),
		time.Now().Add(-time.Hour),
		time.Now(),
		nil,
		DashboardSampleInterval,
		points,
		false,
		false,
	)
	if len(enrichment.AggregateTrends) != 1 {
		t.Fatalf("expected 1 aggregate trend point, got %d", len(enrichment.AggregateTrends))
	}
	trend := enrichment.AggregateTrends[0]
	if trend.PeakDeviceID != 42 || trend.PeakDeviceName != "device_42" {
		t.Fatalf("unexpected CPU peak in enrichment: id=%d name=%q", trend.PeakDeviceID, trend.PeakDeviceName)
	}
	if trend.PeakMemoryDeviceID != 99 || trend.PeakMemoryDeviceName != "device_99" {
		t.Fatalf("unexpected memory peak in enrichment: id=%d name=%q", trend.PeakMemoryDeviceID, trend.PeakMemoryDeviceName)
	}
}

func TestEmptyDeviceIDsShortCircuit(t *testing.T) {
	// 使用非 nil 的占位 gorm.DB 确认空切片 []int{} 在访问 DB 前即短路返回。
	writer := &MetricsWriter{db: &gorm.DB{}}
	ctx := context.Background()
	start := time.Date(2026, 11, 24, 0, 0, 0, 0, time.UTC)
	end := start.Add(6 * time.Hour)
	emptyIDs := []int{}

	perfPoints, err := writer.GetDevicePerformanceHistory(ctx, start, end, emptyIDs, DashboardSampleInterval)
	if err != nil {
		t.Fatalf("GetDevicePerformanceHistory unexpected err: %v", err)
	}
	if perfPoints == nil || len(perfPoints) != 0 {
		t.Fatalf("expected non-nil empty DevicePerformancePoint slice, got %#v", perfPoints)
	}

	tempPoints, err := writer.GetTemperatureHistory(ctx, start, end, emptyIDs, DashboardSampleInterval)
	if err != nil {
		t.Fatalf("GetTemperatureHistory unexpected err: %v", err)
	}
	if tempPoints == nil || len(tempPoints) != 0 {
		t.Fatalf("expected non-nil empty TemperatureHistoryPoint slice, got %#v", tempPoints)
	}

	trafficPoints, err := writer.GetNetworkTrafficHistory(ctx, start, end, emptyIDs, DashboardSampleInterval)
	if err != nil {
		t.Fatalf("GetNetworkTrafficHistory unexpected err: %v", err)
	}
	if trafficPoints == nil || len(trafficPoints) != 0 {
		t.Fatalf("expected non-nil empty NetworkTrafficPoint slice, got %#v", trafficPoints)
	}

	stats, err := writer.GetMonitoringStats(ctx, emptyIDs)
	if err != nil {
		t.Fatalf("GetMonitoringStats unexpected err: %v", err)
	}
	if stats != (MonitoringStats{}) {
		t.Fatalf("expected zero MonitoringStats, got %#v", stats)
	}

	annotations := writer.queryDashboardAnnotations(ctx, start, end, emptyIDs, true)
	if annotations == nil || len(annotations) != 0 {
		t.Fatalf("expected non-nil empty DashboardAnnotation slice, got %#v", annotations)
	}

	resolved, err := writer.ResolveGroupDeviceIDs(ctx, 10, emptyIDs)
	if err != nil {
		t.Fatalf("ResolveGroupDeviceIDs unexpected err: %v", err)
	}
	if resolved == nil || len(resolved) != 0 {
		t.Fatalf("expected non-nil empty resolved slice for empty baseDeviceIDs, got %#v", resolved)
	}
}

func TestShiftPerformancePointsBy24h(t *testing.T) {
	if got := shiftPerformancePointsBy24h(nil); len(got) != 0 {
		t.Fatalf("expected empty slice for nil input, got %d items", len(got))
	}

	in := []DevicePerformancePoint{
		{
			Timestamp: "2026-11-23T08:15:30.123456Z",
			Devices:   map[string]DevicePerformanceValue{"sw-1": {CPU: 22.5, Memory: 48.0}},
		},
		{
			Timestamp: "2026-11-23T09:00:00Z",
			Devices:   map[string]DevicePerformanceValue{"sw-1": {CPU: 30.0, Memory: 50.0}},
		},
	}

	got := shiftPerformancePointsBy24h(in)
	if len(got) != 2 {
		t.Fatalf("expected 2 shifted points, got %d", len(got))
	}
	if got[0].Timestamp != "2026-11-24T08:15:30Z" {
		t.Fatalf("unexpected first shifted timestamp: %q", got[0].Timestamp)
	}
	if got[1].Timestamp != "2026-11-24T09:00:00Z" {
		t.Fatalf("unexpected second shifted timestamp: %q", got[1].Timestamp)
	}
	if got[0].Devices["sw-1"].CPU != 22.5 || got[0].Devices["sw-1"].Memory != 48.0 {
		t.Fatalf("unexpected shifted device metrics: %#v", got[0].Devices)
	}
}
