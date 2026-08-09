package inspection_test

import (
	"strings"
	"testing"
	_ "unsafe"

	_ "github.com/your-org/inspect-system/backend-go/internal/inspection"
)

// allBuiltinCheckItems 是 inspection 包未导出的内置检查项聚合函数，
// 通过 go:linkname 桥接做白盒测试（沿用本仓库约定）。
//
//go:linkname allBuiltinCheckItems github.com/your-org/inspect-system/backend-go/internal/inspection.allBuiltinCheckItems
func allBuiltinCheckItems() []map[string]interface{}

// TestBuiltinCheckItems_ExecutableAndMetricValid 守护内置检查项的硬约束：
//  1. type 只能是 icmp/ping/snmp（其余类型会被后端 executeCheckItems 跳过）；
//  2. snmp 项必须带合法 metric（reachable/cpu/memory/temperature/uptime/interface/
//     interface_utilization/bandwidth），后端 executeSNMPCheck 按 metric 分派，
//     名称可随意修改而不影响分派。
//
// 新增 metric 时这里是第三处需要同步的清单，另两处为 internal/inspection/validator.go
// 的 validSNMPMetrics 与 internal/http/handlers/inspection_execution.go 的分派分支。
func TestBuiltinCheckItems_ExecutableAndMetricValid(t *testing.T) {
	items := allBuiltinCheckItems()
	if len(items) < 5 {
		t.Fatalf("内置检查项数量应明显多于原始数量，实际 %d", len(items))
	}

	allowedTypes := map[string]bool{"icmp": true, "ping": true, "snmp": true}
	validMetrics := map[string]bool{
		"reachable": true, "cpu": true, "memory": true, "temperature": true,
		"uptime": true, "interface": true, "interface_utilization": true,
		"bandwidth": true, "system_info": true,
	}

	for _, it := range items {
		name, _ := it["name"].(string)
		typ, _ := it["type"].(string)
		if !allowedTypes[strings.ToLower(typ)] {
			t.Fatalf("检查项 %q 的类型 %q 不可执行（后端仅支持 icmp/ping/snmp）", name, typ)
		}
		if strings.ToLower(typ) == "snmp" {
			metric, _ := it["metric"].(string)
			if !validMetrics[strings.ToLower(strings.TrimSpace(metric))] {
				t.Fatalf("SNMP 检查项 %q 的 metric %q 非法（后端无法分派）", name, metric)
			}
		}
	}

	// 覆盖度：内置档位应覆盖全部核心指标。
	wantMetrics := []string{"reachable", "cpu", "memory", "temperature", "uptime", "interface", "interface_utilization", "bandwidth"}
	got := map[string]bool{}
	for _, it := range items {
		if m, ok := it["metric"].(string); ok {
			got[m] = true
		}
	}
	for _, m := range wantMetrics {
		if !got[m] {
			t.Fatalf("内置档位缺少 metric=%q 的检查项", m)
		}
	}
}
