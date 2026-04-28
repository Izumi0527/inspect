package handlers_test

import (
	"context"
	"reflect"
	"testing"
	_ "unsafe"

	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	handlers "github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

type fakeInspectionSNMPCollector struct {
	calls   int
	gotTags interface{}
	metrics *devices.SNMPMetrics
	err     error
}

func (f *fakeInspectionSNMPCollector) CollectMetrics(
	ctx context.Context,
	ipAddress string,
	vendor string,
	snmpCommunity *string,
	snmpVersion *string,
	snmpPort *int,
	tags interface{},
) (*devices.SNMPMetrics, error) {
	f.calls++
	f.gotTags = tags
	return f.metrics, f.err
}

//go:linkname collectInspectionSNMPMetrics github.com/your-org/inspect-system/backend-go/internal/http/handlers.collectInspectionSNMPMetrics
func collectInspectionSNMPMetrics(
	ctx context.Context,
	collector handlers.SNMPMetricsCollector,
	device *devices.DeviceResponse,
	probeResult *devices.ProbeResult,
	logger *zap.Logger,
) *devices.SNMPMetrics

func TestCollectInspectionSNMPMetrics_ShouldPassDeviceTagsToCollector(t *testing.T) {
	tags := map[string]interface{}{
		"snmp_config": map[string]interface{}{
			"version": "v3",
			"port":    2161.0,
		},
	}

	collector := &fakeInspectionSNMPCollector{
		metrics: &devices.SNMPMetrics{},
	}

	device := &devices.DeviceResponse{
		IPAddress: "10.0.0.8",
		Tags:      tags,
	}
	probeResult := &devices.ProbeResult{
		SnmpReachable: true,
	}

	metrics := collectInspectionSNMPMetrics(
		context.Background(),
		collector,
		device,
		probeResult,
		zap.NewNop(),
	)

	if metrics == nil {
		t.Fatal("metrics = nil, want non-nil")
	}

	if collector.calls != 1 {
		t.Fatalf("collector calls = %d, want 1", collector.calls)
	}

	if !reflect.DeepEqual(collector.gotTags, tags) {
		t.Fatalf("collector got tags = %#v, want %#v", collector.gotTags, tags)
	}
}
