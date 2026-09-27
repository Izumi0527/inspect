package inspection_test

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

// allBuiltinCheckItems 是 inspection 包未导出的内置检查项聚合函数，
// 通过 go:linkname 桥接做白盒测试（沿用本仓库约定）。
//
//go:linkname allBuiltinCheckItems github.com/your-org/inspect-system/backend-go/internal/inspection.allBuiltinCheckItems
func allBuiltinCheckItems() []map[string]interface{}

// builtinTemplateSeedsJSON 以 JSON 契约暴露内置模板种子：种子结构体未导出，
// 跨包无法 linkname 其类型，按项目约定改测序列化后的契约。
//
//go:linkname builtinTemplateSeedsJSON github.com/your-org/inspect-system/backend-go/internal/inspection.builtinTemplateSeedsJSON
func builtinTemplateSeedsJSON() []byte

type builtinSeedContract struct {
	Name        string                   `json:"name"`
	Description string                   `json:"description"`
	Category    string                   `json:"category"`
	DeviceTypes []string                 `json:"device_types"`
	CheckItems  []map[string]interface{} `json:"check_items"`
}

func decodeBuiltinSeeds(t *testing.T) []builtinSeedContract {
	t.Helper()
	var seeds []builtinSeedContract
	if err := json.Unmarshal(builtinTemplateSeedsJSON(), &seeds); err != nil {
		t.Fatalf("内置模板种子 JSON 解码失败: %v", err)
	}
	return seeds
}

// TestBuiltinCheckItems_ExecutableAndMetricValid 守护内置检查项的硬约束：
//  1. type 只能是 icmp/ping/snmp（其余类型会被后端 executeCheckItems 跳过）；
//  2. snmp 项必须带合法 metric，后端 executeSNMPCheck 按 metric 分派，
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
		// 接口健康类（标准 IF-MIB / EtherLike-MIB）
		"interface_errors": true, "interface_discards": true,
		"interface_admin_status": true, "interface_duplex": true,
		// 硬件部件与设备专项
		"fan_status": true, "power_status": true, "poe": true,
		"optical_power": true, "bgp_peers": true, "firmware_version": true,
		// 主机专项（HOST-RESOURCES-MIB）
		"disk_usage": true,
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

	// 覆盖度：四类模板合起来应覆盖全部核心指标。
	wantMetrics := []string{
		"reachable", "cpu", "memory", "temperature", "uptime", "interface",
		"interface_utilization", "bandwidth",
		"interface_errors", "interface_discards", "interface_admin_status", "interface_duplex",
		"fan_status", "power_status", "poe", "optical_power", "bgp_peers", "firmware_version",
		"disk_usage",
	}
	got := map[string]bool{}
	for _, it := range items {
		if m, ok := it["metric"].(string); ok {
			got[m] = true
		}
	}
	for _, m := range wantMetrics {
		if !got[m] {
			t.Fatalf("内置模板缺少 metric=%q 的检查项", m)
		}
	}
}

// TestBuiltinTemplates_OnePerInspectableDeviceType 内置模板按设备类型划分：
// 恰好四个，各绑定一种设备类型，名称与分类固定（策略迁移按名称定位模板）。
func TestBuiltinTemplates_OnePerInspectableDeviceType(t *testing.T) {
	seeds := decodeBuiltinSeeds(t)

	want := []struct {
		name       string
		category   string
		deviceType string
	}{
		{"交换机巡检", "network", "switch"},
		{"路由器巡检", "network", "router"},
		{"防火墙巡检", "network", "firewall"},
		{"服务器巡检", "system", "server"},
	}
	if len(seeds) != len(want) {
		t.Fatalf("内置模板数量 = %d, want %d", len(seeds), len(want))
	}
	for i, w := range want {
		s := seeds[i]
		if s.Name != w.name || s.Category != w.category {
			t.Errorf("第 %d 个模板 = %q/%q, want %q/%q", i, s.Name, s.Category, w.name, w.category)
		}
		if !reflect.DeepEqual(s.DeviceTypes, []string{w.deviceType}) {
			t.Errorf("模板 %q 的 device_types = %v, want [%s]（每个模板只能绑定一种设备类型）", s.Name, s.DeviceTypes, w.deviceType)
		}
		if strings.TrimSpace(s.Description) == "" {
			t.Errorf("模板 %q 缺少描述", s.Name)
		}
	}
}

// TestBuiltinTemplates_ItemsWellFormed 检查项本身的约束：模板内 id 唯一、
// 名称与说明齐全，且不再带检查项级 device_types——适用范围由模板整体绑定。
func TestBuiltinTemplates_ItemsWellFormed(t *testing.T) {
	for _, s := range decodeBuiltinSeeds(t) {
		ids := map[string]bool{}
		for _, item := range s.CheckItems {
			id, _ := item["id"].(string)
			name, _ := item["name"].(string)
			desc, _ := item["description"].(string)
			if id == "" || ids[id] {
				t.Errorf("模板 %q 的检查项 id %q 为空或重复", s.Name, id)
			}
			ids[id] = true
			if strings.TrimSpace(name) == "" || strings.TrimSpace(desc) == "" {
				t.Errorf("模板 %q 的检查项 %q 缺少名称或说明", s.Name, id)
			}
			if _, ok := item["device_types"]; ok {
				t.Errorf("模板 %q 的检查项 %q 不应再声明检查项级 device_types", s.Name, id)
			}
		}
	}
}

// TestBuiltinMetricsForDeviceType_PerTypeDesign 各类模板的检查项按设备特性设计：
// 交换机才有 PoE 与双工，路由器/防火墙才有 BGP 与吞吐量，服务器才有磁盘，
// 服务器没有风扇/电源/温度/光模块等网络设备硬件项。
func TestBuiltinMetricsForDeviceType_PerTypeDesign(t *testing.T) {
	common := []string{
		"connectivity", "reachable", "cpu", "memory", "uptime",
		"interface", "interface_admin_status", "interface_utilization",
		"interface_errors", "interface_discards",
	}
	networkHardware := []string{"temperature", "fan_status", "power_status", "optical_power", "firmware_version"}

	cases := []struct {
		deviceType string
		required   []string
		forbidden  []string
	}{
		{
			deviceType: "switch",
			required:   append(append([]string{}, networkHardware...), "interface_duplex", "poe"),
			forbidden:  []string{"bgp_peers", "bandwidth", "disk_usage"},
		},
		{
			deviceType: "router",
			required:   append(append([]string{}, networkHardware...), "bgp_peers", "bandwidth"),
			forbidden:  []string{"poe", "interface_duplex", "disk_usage"},
		},
		{
			deviceType: "firewall",
			required:   append(append([]string{}, networkHardware...), "bgp_peers", "bandwidth"),
			forbidden:  []string{"poe", "interface_duplex", "disk_usage"},
		},
		{
			deviceType: "server",
			required:   []string{"disk_usage"},
			forbidden: []string{
				"temperature", "fan_status", "power_status", "optical_power", "firmware_version",
				"poe", "interface_duplex", "bgp_peers", "bandwidth",
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.deviceType, func(t *testing.T) {
			got := map[string]bool{}
			for _, m := range inspection.BuiltinMetricsForDeviceType(tc.deviceType) {
				got[m] = true
			}
			for _, m := range append(append([]string{}, common...), tc.required...) {
				if !got[m] {
					t.Errorf("%s 模板缺少 %q", tc.deviceType, m)
				}
			}
			for _, m := range tc.forbidden {
				if got[m] {
					t.Errorf("%s 模板不应包含 %q", tc.deviceType, m)
				}
			}
		})
	}

	if got := inspection.BuiltinMetricsForDeviceType("wireless_ap"); len(got) != 0 {
		t.Errorf("无线 AP 没有内置模板，应返回空，实际 %v", got)
	}
	if got := inspection.BuiltinMetricsForDeviceType(" Switch "); len(got) == 0 {
		t.Errorf("设备类型应大小写与空白不敏感")
	}
}

// TestBuiltinTemplates_ServerThresholds 服务器的资源阈值高于网络设备：
// 主机常态负载更高，沿用网络设备阈值会让每台服务器都告警。
func TestBuiltinTemplates_ServerThresholds(t *testing.T) {
	want := map[string][2]float64{
		"cpu":        {80, 90},
		"memory":     {85, 95},
		"disk_usage": {80, 90},
	}
	for _, s := range decodeBuiltinSeeds(t) {
		if s.Name != "服务器巡检" {
			continue
		}
		for _, item := range s.CheckItems {
			metric, _ := item["metric"].(string)
			expect, ok := want[metric]
			if !ok {
				continue
			}
			config, _ := item["config"].(map[string]interface{})
			threshold, _ := config["threshold"].(map[string]interface{})
			warning, _ := threshold["warning"].(float64)
			critical, _ := threshold["critical"].(float64)
			if warning != expect[0] || critical != expect[1] {
				t.Errorf("服务器 %s 阈值 = %v/%v, want %v/%v", metric, warning, critical, expect[0], expect[1])
			}
			delete(want, metric)
		}
	}
	if len(want) != 0 {
		t.Errorf("服务器模板缺少这些带阈值的检查项: %v", want)
	}
}
