package handlers_test

import (
	"strings"
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	handlers "github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

// executeSNMPCheck 是 InspectionHandler 的未导出方法，按仓库约定用 go:linkname 做白盒测试。
//
//go:linkname executeSNMPCheck github.com/your-org/inspect-system/backend-go/internal/http/handlers.InspectionHandler.executeSNMPCheck
func executeSNMPCheck(h handlers.InspectionHandler, result *inspection.Result, probeResult *devices.ProbeResult, snmpMetrics *devices.SNMPMetrics, checkItem map[string]interface{})

func snmpReachableProbe() *devices.ProbeResult {
	rt := 4.0
	sysInfo := "S5720-52X-SI-AC Huawei Versatile Routing Platform"
	return &devices.ProbeResult{
		SnmpReachable:    true,
		SnmpResponseTime: &rt,
		SnmpSystemInfo:   &sysInfo,
	}
}

// 空 metric（旧版模板检查项，如 SQL 种子遗留的"内存使用率检查"）必须显式 skip，
// 不得复用连通性检查结果把探测耗时当指标值假装通过。
func TestExecuteSNMPCheck_EmptyMetricSkipsExplicitly(t *testing.T) {
	var h handlers.InspectionHandler
	result := &inspection.Result{}
	item := map[string]interface{}{"name": "内存使用率检查", "type": "snmp"}

	executeSNMPCheck(h, result, snmpReachableProbe(), nil, item)

	if result.Status != "skip" {
		t.Fatalf("空 metric 应判 skip，实际 %q", result.Status)
	}
	if result.ActualValue != nil {
		t.Fatalf("空 metric 不应残留探测耗时作为实际值，实际 %q", *result.ActualValue)
	}
	if result.Message == nil || !strings.Contains(*result.Message, "metric") {
		t.Fatalf("提示应说明缺少采集指标(metric)，实际 %v", result.Message)
	}
}

// reachable 语义保持不变：pass + 探测响应耗时 + 系统信息。
func TestExecuteSNMPCheck_ReachableKeepsSemantics(t *testing.T) {
	var h handlers.InspectionHandler
	result := &inspection.Result{}
	item := map[string]interface{}{"name": "SNMP 服务可达", "type": "snmp", "metric": "reachable"}

	executeSNMPCheck(h, result, snmpReachableProbe(), nil, item)

	if result.Status != "pass" {
		t.Fatalf("reachable 应判 pass，实际 %q", result.Status)
	}
	if result.ActualValue == nil || *result.ActualValue != "4.00ms" {
		t.Fatalf("reachable 的实际值应为响应耗时 4.00ms，实际 %v", result.ActualValue)
	}
	if result.Message == nil || !strings.Contains(*result.Message, "SNMP服务正常") {
		t.Fatalf("reachable 消息应含 SNMP服务正常，实际 %v", result.Message)
	}
}

// 具体指标分支在采集数据缺失 skip 时同样不得残留探测耗时（同类量纲错乱误导）。
func TestExecuteSNMPCheck_MetricDataMissingNoStaleActualValue(t *testing.T) {
	var h handlers.InspectionHandler
	result := &inspection.Result{}
	item := map[string]interface{}{"name": "CPU 使用率", "type": "snmp", "metric": "cpu"}

	executeSNMPCheck(h, result, snmpReachableProbe(), nil, item)

	if result.Status != "skip" {
		t.Fatalf("无采集数据应判 skip，实际 %q", result.Status)
	}
	if result.ActualValue != nil {
		t.Fatalf("无采集数据不应残留探测耗时，实际 %q", *result.ActualValue)
	}
}
