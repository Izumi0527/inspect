package handlers_test

import (
	"testing"
	_ "unsafe"

	handlers "github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

// splitCheckItemsByApplicability 按设备类型把启用的检查项分成可执行与不适用两组。
//
//go:linkname splitCheckItemsByApplicability github.com/your-org/inspect-system/backend-go/internal/http/handlers.splitCheckItemsByApplicability
func splitCheckItemsByApplicability(checkItems []map[string]interface{}, deviceType string) ([]map[string]interface{}, []map[string]interface{})

// buildCheckResultResponse 是执行详情 API 的检查结果序列化入口，
// 前端拿到的每条检查项都出自这里。
//
//go:linkname buildCheckResultResponse github.com/your-org/inspect-system/backend-go/internal/http/handlers.buildCheckResultResponse
func buildCheckResultResponse(result inspection.Result) map[string]interface{}

// reconcileExecutedTotal 收口时应写回 inspections.total_checks 的值。
//
//go:linkname reconcileExecutedTotal github.com/your-org/inspect-system/backend-go/internal/http/handlers.reconcileExecutedTotal
func reconcileExecutedTotal(notApplicableCount, executedResultCount int) int

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

// ---------------------------------------------------------------------------
// API 响应的状态透传
// ---------------------------------------------------------------------------

// TestBuildCheckResultResponse_PreservesNotApplicable 不适用状态必须原样透传给前端。
//
// 这条锁的是一个真实事故：normalizeCheckResultStatus 在 inspection 与 handlers
// 两个包里各有一份，且 default 分支都返回 fail。给 not_applicable 加枚举时只改了
// inspection 那份，handlers 这份漏改，于是库里存的是「不适用」、API 吐出来的是
// 「失败」——不报错、无日志，前端徽章显示红色「失败」，而消息里写着「未执行」。
// 端到端跑通之前，单元测试全绿也发现不了。
func TestBuildCheckResultResponse_PreservesNotApplicable(t *testing.T) {
	payload := buildCheckResultResponse(inspection.Result{
		CheckItemName: "BGP 邻居状态",
		CheckItemType: "snmp",
		Status:        "not_applicable",
	})

	if got := payload["status"]; got != "not_applicable" {
		t.Errorf("status = %v，want not_applicable（被静默转成 %v 会让不适用显示成失败）", got, got)
	}
}

// TestBuildCheckResultResponse_KeepsKnownStatuses 其余已知状态原样透传。
func TestBuildCheckResultResponse_KeepsKnownStatuses(t *testing.T) {
	for _, status := range []string{"pass", "fail", "warning", "skip"} {
		t.Run(status, func(t *testing.T) {
			payload := buildCheckResultResponse(inspection.Result{Status: status})
			if got := payload["status"]; got != status {
				t.Errorf("status = %v，want %s", got, status)
			}
		})
	}
}

// TestBuildCheckResultResponse_UnknownStatusFallsBackToFail 未登记状态仍落 fail。
//
// 这是刻意保留的兜底：出现未知状态说明写入端有 bug，显示成「失败」促使人去查，
// 显示成「通过」则会把问题藏起来。
func TestBuildCheckResultResponse_UnknownStatusFallsBackToFail(t *testing.T) {
	payload := buildCheckResultResponse(inspection.Result{Status: "某种没见过的状态"})
	if got := payload["status"]; got != "fail" {
		t.Errorf("未知状态 = %v，want fail", got)
	}
}

// ---------------------------------------------------------------------------
// 收口统计的总数口径
// ---------------------------------------------------------------------------

// TestReconcileExecutedTotal_CountsNotApplicable 收口总数必须含不适用项。
//
// 真实缺陷：初始化时 total_checks 写的是「可执行 + 不适用」= 19，收口那一次
// 却只写 len(results)（executeCheckItems 只返回可执行那批）= 18，把正确值覆盖了。
// 于是库里有 19 条结果、total_checks 却是 18，执行历史显示「通过 11/18」。
//
// 这行代码在不适用项引入之前是对的——那时 results 就是全部。分流之后漏改，
// 而它离分流点有一百多行，看不出关联。
func TestReconcileExecutedTotal_CountsNotApplicable(t *testing.T) {
	// 一台交换机跑全面巡检：18 项可执行，BGP 因设备类型不适用
	if got := reconcileExecutedTotal(1, 18); got != 19 {
		t.Errorf("收口总数 = %d，want 19（18 项可执行 + 1 项不适用）", got)
	}
}

// TestReconcileExecutedTotal_MatchesInitialTotal 收口总数须与初始化时的总数一致。
//
// 这是本条的核心不变式：初始化写 len(active)+len(notApplicable)，收口若换一套
// 算法，两者就会不一致，而覆盖发生在最后，用户看到的永远是错的那个。
func TestReconcileExecutedTotal_MatchesInitialTotal(t *testing.T) {
	cases := []struct{ active, notApplicable int }{
		{18, 1}, // 交换机跑全面巡检
		{19, 0}, // 路由器跑全面巡检，无不适用项
		{2, 0},  // 连通性巡检
		{0, 3},  // 极端情况：全部不适用
	}

	for _, tc := range cases {
		initial := tc.active + tc.notApplicable
		if got := reconcileExecutedTotal(tc.notApplicable, tc.active); got != initial {
			t.Errorf("可执行 %d + 不适用 %d：收口总数 = %d，want %d（与初始化一致）",
				tc.active, tc.notApplicable, got, initial)
		}
	}
}
