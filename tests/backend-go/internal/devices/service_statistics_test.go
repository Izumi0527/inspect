package devices_test

import (
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
)

//go:linkname buildDeviceStatistics github.com/your-org/inspect-system/backend-go/internal/devices.buildDeviceStatistics
func buildDeviceStatistics(
	total int64,
	online int64,
	offline int64,
	warning int64,
	totalAlerts int64,
	alertingDevices int64,
	typeDistribution map[string]int,
) devices.DeviceStatistics

func TestGetDeviceStatistics_ShouldUseActiveAlertsInsteadOfDeviceAlertCache(t *testing.T) {
	stats := buildDeviceStatistics(
		3,
		1,
		1,
		1,
		3,
		2,
		map[string]int{
			"router":   1,
			"switch":   1,
			"firewall": 1,
		},
	)

	if stats.TotalDevices != 3 {
		t.Fatalf("TotalDevices = %d, want 3", stats.TotalDevices)
	}
	if stats.WarningDevices != 1 {
		t.Fatalf("WarningDevices = %d, want 1", stats.WarningDevices)
	}
	if stats.TotalAlerts != 3 {
		t.Fatalf("TotalAlerts = %d, want 3 active alerts", stats.TotalAlerts)
	}
	if stats.AlertingDevices != 2 {
		t.Fatalf("AlertingDevices = %d, want 2", stats.AlertingDevices)
	}
	if stats.TypeDistribution["router"] != 1 {
		t.Fatalf("router distribution = %d, want 1", stats.TypeDistribution["router"])
	}
}

func TestBuildDeviceStatistics_ShouldNotGenerateNegativeUnknownDevices(t *testing.T) {
	stats := buildDeviceStatistics(1, 1, 1, 1, 0, 0, nil)

	if stats.UnknownDevices != 0 {
		t.Fatalf("UnknownDevices = %d, want 0", stats.UnknownDevices)
	}
	if len(stats.TypeDistribution) != 0 {
		t.Fatalf("TypeDistribution length = %d, want 0", len(stats.TypeDistribution))
	}
}
