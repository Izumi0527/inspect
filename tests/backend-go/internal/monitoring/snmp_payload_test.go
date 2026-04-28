package monitoring_test

import (
	"testing"
	"time"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

func TestBuildSNMPDeviceMetricsRequest_ShouldIncludeCatalogDerivedMetricsAndTags(t *testing.T) {
	cpu := 18.5
	mem := 61.2
	collectedAt := time.Date(2026, 4, 29, 1, 12, 0, 0, time.UTC)
	inRate := 1024.0

	request := monitoring.BuildSNMPDeviceMetricsRequest(7, &devices.SNMPMetrics{
		CPUUsage:    &cpu,
		MemoryUsage: &mem,
		BGPPeers: []devices.BGPNeighborMetrics{
			{Index: "1", StateLabel: "established"},
			{Index: "2", StateLabel: "active"},
		},
		OpticalTransceivers: []devices.OpticalTransceiverMetrics{
			{Index: "10", RxPower: floatPtr(1.5), RxPowerUnit: "uW"},
		},
		Interfaces: []devices.InterfaceMetrics{
			{
				Name:   "if1",
				InRate: &inRate,
			},
		},
		CollectedAt: collectedAt,
	})

	if request.DeviceID != 7 {
		t.Fatalf("device_id=%d, want 7", request.DeviceID)
	}
	if request.CollectedAt == nil || !request.CollectedAt.Time.Equal(collectedAt) {
		t.Fatalf("collected_at=%v, want %v", request.CollectedAt, collectedAt)
	}

	if _, ok := request.Metrics["cpu_usage"]; !ok {
		t.Fatal("cpu_usage metric missing")
	}
	if _, ok := request.Metrics["memory_usage"]; !ok {
		t.Fatal("memory_usage metric missing")
	}
	if metric, ok := request.Metrics["bgp_peer_count"]; !ok || metric.Value == nil || *metric.Value != 2 {
		t.Fatalf("bgp_peer_count metric=%v, want 2", metric.Value)
	}
	if metric, ok := request.Metrics["bgp_established_count"]; !ok || metric.Value == nil || *metric.Value != 1 {
		t.Fatalf("bgp_established_count metric=%v, want 1", metric.Value)
	}
	if metric, ok := request.Metrics["optical_transceiver_count"]; !ok || metric.Value == nil || *metric.Value != 1 {
		t.Fatalf("optical_transceiver_count metric=%v, want 1", metric.Value)
	}

	snmpExtensions, ok := request.Tags["snmp_extensions"].(map[string]interface{})
	if !ok {
		t.Fatalf("snmp_extensions tag missing or invalid: %#v", request.Tags)
	}
	if _, ok := snmpExtensions["bgp_peers"]; !ok {
		t.Fatalf("bgp_peers tag missing: %#v", snmpExtensions)
	}
	if _, ok := snmpExtensions["optical_transceivers"]; !ok {
		t.Fatalf("optical_transceivers tag missing: %#v", snmpExtensions)
	}

	if len(request.Interfaces) != 1 {
		t.Fatalf("len(interfaces)=%d, want 1", len(request.Interfaces))
	}
}

func floatPtr(v float64) *float64 {
	return &v
}
