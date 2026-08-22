package handlers_test

import (
	"testing"
	_ "unsafe"

	handlers "github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

// splitCheckItemsByApplicability 按设备类型把启用的检查项分成可执行与不适用两组。
//
//go:linkname splitCheckItemsByApplicability github.com/your-org/inspect-system/backend-go/internal/http/handlers.splitCheckItemsByApplicability
func splitCheckItemsByApplicability(checkItems []map[string]interface{}, deviceType string) ([]map[string]interface{}, []map[string]interface{})

var _ = handlers.InspectionHandler{}

func itemWithDeviceTypes(id string, deviceTypes ...string) map[string]interface{} {
	item := map[string]interface{}{"id": id, "name": id, "type": "snmp", "metric": id, "enabled": true}
	if len(deviceTypes) > 0 {
		generic := make([]interface{}, 0, len(deviceTypes))
		for _, dt := range deviceTypes {
			generic = append(generic, dt)
		}
		item["device_types"] = generic
	}
	return item
}

func itemIDs(items []map[string]interface{}) []string {
	ids := make([]string, 0, len(items))
	for _, item := range items {
		id, _ := item["id"].(string)
		ids = append(ids, id)
	}
	return ids
}

func containsID(items []map[string]interface{}, want string) bool {
	for _, id := range itemIDs(items) {
		if id == want {
			return true
		}
	}
	return false
}

// TestSplitByApplicability_FiltersByDeviceType 检查项声明的适用设备类型必须生效。
//
// BGP 只对路由器与防火墙有意义，PoE 只对交换机有意义。不过滤的话，一台交换机
// 跑全面巡检会产出一堆采集不到的项，真正的异常被淹没在噪声里。
func TestSplitByApplicability_FiltersByDeviceType(t *testing.T) {
	items := []map[string]interface{}{
		itemWithDeviceTypes("cpu"),                             // 未声明 = 适用全部
		itemWithDeviceTypes("bgp", "router", "firewall"),       // 交换机不适用
		itemWithDeviceTypes("poe", "switch"),                   // 交换机适用
	}

	applicable, notApplicable := splitCheckItemsByApplicability(items, "switch")

	if !containsID(applicable, "cpu") || !containsID(applicable, "poe") {
		t.Errorf("交换机应可执行 cpu 与 poe，实际 = %v", itemIDs(applicable))
	}
	if containsID(applicable, "bgp") {
		t.Errorf("交换机不应执行 bgp，实际 = %v", itemIDs(applicable))
	}
	if !containsID(notApplicable, "bgp") {
		t.Errorf("bgp 应归入不适用，实际 = %v", itemIDs(notApplicable))
	}
	if len(notApplicable) != 1 {
		t.Errorf("不适用项数 = %d，want 1，实际 = %v", len(notApplicable), itemIDs(notApplicable))
	}
}

// TestSplitByApplicability_UndeclaredAppliesToAll 未声明 device_types 的检查项适用全部设备。
// 这保证存量模板与用户自建模板不受影响——它们都没有这个字段。
func TestSplitByApplicability_UndeclaredAppliesToAll(t *testing.T) {
	items := []map[string]interface{}{
		itemWithDeviceTypes("cpu"),
		itemWithDeviceTypes("memory"),
	}

	for _, deviceType := range []string{"switch", "router", "firewall", "server"} {
		applicable, notApplicable := splitCheckItemsByApplicability(items, deviceType)
		if len(applicable) != 2 || len(notApplicable) != 0 {
			t.Errorf("设备类型 %q：未声明适用范围的项应全部可执行，实际可执行 %v、不适用 %v",
				deviceType, itemIDs(applicable), itemIDs(notApplicable))
		}
	}
}

// TestSplitByApplicability_UnknownDeviceTypeRunsAll 设备类型缺失时全部执行。
//
// 设备档案里的 device_type 可能为空（自动发现尚未归类）。此时按"不确定就都查"
// 处理：漏查一项的代价远大于多跑一次采集，而且采不到自然会 skip。
func TestSplitByApplicability_UnknownDeviceTypeRunsAll(t *testing.T) {
	items := []map[string]interface{}{
		itemWithDeviceTypes("bgp", "router"),
		itemWithDeviceTypes("poe", "switch"),
	}

	for _, deviceType := range []string{"", "   ", "unknown-model"} {
		applicable, notApplicable := splitCheckItemsByApplicability(items, deviceType)
		if len(applicable) != 2 || len(notApplicable) != 0 {
			t.Errorf("设备类型 %q：应全部执行，实际可执行 %v、不适用 %v",
				deviceType, itemIDs(applicable), itemIDs(notApplicable))
		}
	}
}

// TestSplitByApplicability_DropsDisabledItems 停用的检查项两组都不进——
// 它既不该执行，也不该在报告里以"不适用"的名义占一行。
func TestSplitByApplicability_DropsDisabledItems(t *testing.T) {
	disabled := itemWithDeviceTypes("bgp", "router")
	disabled["enabled"] = false
	items := []map[string]interface{}{
		itemWithDeviceTypes("cpu"),
		disabled,
	}

	applicable, notApplicable := splitCheckItemsByApplicability(items, "switch")

	if containsID(applicable, "bgp") || containsID(notApplicable, "bgp") {
		t.Errorf("停用项不应出现在任何一组，可执行 %v、不适用 %v",
			itemIDs(applicable), itemIDs(notApplicable))
	}
	if len(applicable) != 1 {
		t.Errorf("可执行项数 = %d，want 1", len(applicable))
	}
}

// TestSplitByApplicability_CaseInsensitive 设备类型比较不区分大小写与首尾空格。
// 设备档案里的 device_type 来源不一（自动发现、手工录入、Excel 导入），大小写不统一。
func TestSplitByApplicability_CaseInsensitive(t *testing.T) {
	items := []map[string]interface{}{itemWithDeviceTypes("poe", "Switch")}

	for _, deviceType := range []string{"switch", "SWITCH", " Switch "} {
		applicable, _ := splitCheckItemsByApplicability(items, deviceType)
		if len(applicable) != 1 {
			t.Errorf("设备类型 %q 应匹配 Switch，实际可执行 %v", deviceType, itemIDs(applicable))
		}
	}
}
