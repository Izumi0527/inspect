package snmpmib_test

import (
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
)

// 华为告警知识库由 scripts/mib/extract-huawei-alarms.py 从产品文档生成并嵌入。
// 这里锁定加载、查找与级别推导的契约；条目内容本身以文档为准，不逐条断言。

func loadCatalog(t *testing.T) *snmpmib.AlarmCatalog {
	t.Helper()
	catalog, err := snmpmib.DefaultAlarmCatalog()
	if err != nil {
		t.Fatalf("DefaultAlarmCatalog error: %v", err)
	}
	return catalog
}

func TestDefaultAlarmCatalog_ShouldLoadFullTrapSet(t *testing.T) {
	catalog := loadCatalog(t)

	if catalog.SchemaVersion != 1 {
		t.Fatalf("SchemaVersion=%d, want 1", catalog.SchemaVersion)
	}
	// 文档「告警节点详细描述」全量 1157 条；留余量防止文档小改就断
	if len(catalog.Traps) < 1100 {
		t.Fatalf("traps=%d, want >= 1100（应为全量而非主题子集）", len(catalog.Traps))
	}
	if len(catalog.Nodes) < 800 {
		t.Fatalf("nodes=%d, want >= 800", len(catalog.Nodes))
	}
}

func TestLookupTrap_ShouldNormalizeLeadingDotAndExposeLevelFacility(t *testing.T) {
	catalog := loadCatalog(t)

	// gosnmp 解码出的 OID 值带前导点，查找必须容忍
	def, ok := catalog.LookupTrap(".1.3.6.1.4.1.2011.5.25.219.2.2.3")
	if !ok {
		t.Fatal("hwBoardFail 未收录")
	}
	if def.Name != "hwBoardFail" {
		t.Fatalf("name=%q, want hwBoardFail", def.Name)
	}
	if def.Level != "critical" || def.Facility != "hardware" {
		t.Fatalf("level/facility=%q/%q, want critical/hardware", def.Level, def.Facility)
	}
	if def.Cleared {
		t.Fatal("hwBoardFail 不是恢复类告警")
	}
	if def.Meaning == "" || def.MIB != "HUAWEI-ENTITY-TRAP-MIB" {
		t.Fatalf("meaning/mib 缺失: %+v", def)
	}

	resume, ok := catalog.LookupTrap("1.3.6.1.4.1.2011.5.25.219.2.2.4")
	if !ok || resume.Name != "hwBoardFailResume" {
		t.Fatalf("hwBoardFailResume 未收录: %+v", resume)
	}
	if resume.Level != "info" || !resume.Cleared {
		t.Fatalf("恢复类应为 info 且 cleared: %+v", resume)
	}

	if _, ok := catalog.LookupTrap("1.3.6.1.6.3.1.1.5.3"); !ok {
		t.Fatal("标准 linkDown 未收录")
	}
	if _, ok := catalog.LookupTrap("1.2.3.4.5.6.7.8.9"); ok {
		t.Fatal("未知 OID 不应命中")
	}
}

func TestLookupNode_ShouldStripInstanceSuffixAndExposeEnum(t *testing.T) {
	catalog := loadCatalog(t)

	// 标量实例 .0
	node, instance, ok := catalog.LookupNode(".1.3.6.1.4.1.2011.5.25.129.1.1.0")
	if !ok {
		t.Fatal("hwBaseTrapSeverity 未收录")
	}
	if node.Name != "hwBaseTrapSeverity" || instance != "0" {
		t.Fatalf("name/instance=%q/%q", node.Name, instance)
	}
	if node.Enum["3"] != "critical" || node.Enum["1"] != "cleared" {
		t.Fatalf("hwBaseTrapSeverity 枚举错误: %v", node.Enum)
	}

	// 表列实例 ifOperStatus.12
	node, instance, ok = catalog.LookupNode("1.3.6.1.2.1.2.2.1.8.12")
	if !ok || node.Name != "ifOperStatus" || instance != "12" {
		t.Fatalf("ifOperStatus.12 解析错误: %+v / %q / %v", node, instance, ok)
	}
	if node.Enum["2"] != "down" {
		t.Fatalf("ifOperStatus 枚举错误: %v", node.Enum)
	}

	// 精确命中无实例
	node, instance, ok = catalog.LookupNode("1.3.6.1.2.1.92.1.3.1.1.9")
	if !ok || node.Name != "nlmLogNotificationID" || instance != "" {
		t.Fatalf("nlmLogNotificationID 解析错误: %+v / %q", node, instance)
	}

	if _, _, ok := catalog.LookupNode("1.2.3.4.5.6.7.8.9.10"); ok {
		t.Fatal("未知 OID 不应命中")
	}
}

func TestSeverityFromVarbinds_ShouldMapVendorEnumsToLevel(t *testing.T) {
	catalog := loadCatalog(t)

	cases := []struct {
		name  string
		vars  map[string]string
		level string
		ok    bool
	}{
		{"hwBaseTrapSeverity=critical(3)", map[string]string{".1.3.6.1.4.1.2011.5.25.129.1.1": "3"}, "critical", true},
		{"hwBaseTrapSeverity=major(4)", map[string]string{"1.3.6.1.4.1.2011.5.25.129.1.1": "4"}, "critical", true},
		{"hwBaseTrapSeverity=minor(5)", map[string]string{"1.3.6.1.4.1.2011.5.25.129.1.1": "5"}, "warning", true},
		{"hwBaseTrapSeverity=warning(6)", map[string]string{"1.3.6.1.4.1.2011.5.25.129.1.1": "6"}, "warning", true},
		{"hwBaseTrapSeverity=cleared(1)", map[string]string{"1.3.6.1.4.1.2011.5.25.129.1.1": "1"}, "info", true},
		// HUAWEI-ALARM-MIB 私有 VB 的枚举编码与 BASE-TRAP 相反（1=critical … 6=cleared）
		{"hwAlarmSeverity=critical(1)", map[string]string{"1.3.6.1.4.1.2011.5.25.180.1.25": "1"}, "critical", true},
		{"hwAlarmSeverity=cleared(6)", map[string]string{"1.3.6.1.4.1.2011.5.25.180.1.25": "6"}, "info", true},
		{"带实例后缀 .0", map[string]string{"1.3.6.1.4.1.2011.5.25.129.1.1.0": "3"}, "critical", true},
		{"非法枚举值", map[string]string{"1.3.6.1.4.1.2011.5.25.129.1.1": "9"}, "", false},
		{"无严重级别变量", map[string]string{"1.3.6.1.2.1.2.2.1.1.5": "5"}, "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			level, ok := catalog.SeverityFromVarbinds(tc.vars)
			if ok != tc.ok || level != tc.level {
				t.Fatalf("got (%q,%v), want (%q,%v)", level, ok, tc.level, tc.ok)
			}
		})
	}
}

func TestAlarmCatalogValidate_ShouldRejectBadLevelOrFacility(t *testing.T) {
	bad := snmpmib.AlarmCatalog{
		SchemaVersion: 1,
		Traps: map[string]snmpmib.TrapDefinition{
			"1.3.6.1.4.1.2011.1": {Name: "x", Level: "fatal", Facility: "hardware"},
		},
	}
	if err := bad.Validate(); err == nil {
		t.Fatal("非法 level 应校验失败")
	}

	bad.Traps["1.3.6.1.4.1.2011.1"] = snmpmib.TrapDefinition{Name: "x", Level: "warning", Facility: "cpu"}
	if err := bad.Validate(); err == nil {
		t.Fatal("非法 facility 应校验失败")
	}

	bad.Traps["1.3.6.1.4.1.2011.1"] = snmpmib.TrapDefinition{Name: "x", Level: "warning", Facility: "hardware"}
	if err := bad.Validate(); err != nil {
		t.Fatalf("合法条目不应报错: %v", err)
	}
}
