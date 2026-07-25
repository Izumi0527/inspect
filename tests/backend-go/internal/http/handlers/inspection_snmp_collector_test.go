package handlers_test

import (
	"context"
	"reflect"
	"testing"
	_ "unsafe"

	"go.uber.org/zap"
	"gorm.io/datatypes"

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

// linkname 声明必须与实际函数签名完全一致（*devices.Device）。
// 此前声明为 *devices.DeviceResponse，依赖两个 struct 字段偏移巧合，
// 布局漂移即静默取到零值 Tags，测试随构建产物随机失败。
//
//go:linkname collectInspectionSNMPMetrics github.com/your-org/inspect-system/backend-go/internal/http/handlers.collectInspectionSNMPMetrics
func collectInspectionSNMPMetrics(
	ctx context.Context,
	collector handlers.SNMPMetricsCollector,
	device *devices.Device,
	probeResult *devices.ProbeResult,
	logger *zap.Logger,
) *devices.SNMPMetrics

func TestCollectInspectionSNMPMetrics_ShouldPassDeviceTagsToCollector(t *testing.T) {
	tags := datatypes.JSON(`{"snmp_config":{"version":"v3","port":2161}}`)

	collector := &fakeInspectionSNMPCollector{
		metrics: &devices.SNMPMetrics{},
	}

	device := &devices.Device{
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
