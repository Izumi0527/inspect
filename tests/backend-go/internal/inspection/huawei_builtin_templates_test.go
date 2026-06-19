package inspection_test

import (
	"strings"
	"testing"
	_ "unsafe"

	_ "github.com/your-org/inspect-system/backend-go/internal/inspection"
)

// huaweiInspectionCheckItems 是 inspection 包内置华为检查项的未导出构造函数，
// 通过 go:linkname 桥接做白盒测试（沿用本仓库约定）。
//
//go:linkname huaweiInspectionCheckItems github.com/your-org/inspect-system/backend-go/internal/inspection.huaweiInspectionCheckItems
func huaweiInspectionCheckItems() []map[string]interface{}

// TestHuaweiInspectionCheckItems_AreExecutable 守护内置华为检查项的两条硬约束：
// 1) 类型只能是 icmp/snmp（其余类型会被后端 executeCheckItems 跳过，不执行）；
// 2) SNMP 指标项的名称必须包含后端 executeSNMPCheck 用于分派的关键词，
//    且“带宽”项不能含“接口”（否则会被“接口”分支抢先匹配）。
func TestHuaweiInspectionCheckItems_AreExecutable(t *testing.T) {
	items := huaweiInspectionCheckItems()

	if len(items) < 5 {
		t.Fatalf("华为内置检查项应明显多于原始数量，实际 %d", len(items))
	}

	allowedTypes := map[string]bool{"icmp": true, "ping": true, "snmp": true}
	for _, it := range items {
		typ, _ := it["type"].(string)
		if !allowedTypes[strings.ToLower(typ)] {
			name, _ := it["name"].(string)
			t.Fatalf("检查项 %q 的类型 %q 不可执行（后端仅支持 icmp/ping/snmp）", name, typ)
		}
	}

	// 关键词 → 是否出现在某个检查项名称中
	wantKeywords := []string{"cpu", "内存", "温度", "运行时间", "接口", "带宽"}
	names := make([]string, 0, len(items))
	for _, it := range items {
		name, _ := it["name"].(string)
		names = append(names, strings.ToLower(name))
	}
	for _, kw := range wantKeywords {
		found := false
		for _, n := range names {
			if strings.Contains(n, strings.ToLower(kw)) {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("缺少匹配后端分派关键词 %q 的检查项", kw)
		}
	}

	// 带宽项不得包含“接口”，避免被后端“接口”分支优先匹配。
	for _, n := range names {
		if strings.Contains(n, "带宽") && strings.Contains(n, "接口") {
			t.Fatalf("带宽检查项名称 %q 含“接口”，会被错误分派为接口检查", n)
		}
	}
}
