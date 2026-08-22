package reports_test

import (
	"strings"
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

// 本文件锁定报告的「覆盖范围声明」。
//
// 19 项模板在不同设备上实际执行数不同：一台交换机跑全面巡检，BGP 因设备类型
// 不适用而不执行，通过率仍是 100%。没有这段声明，读者据此得出的结论是
// 「设备全面健康」，而实际有维度根本没查。这段话把「通过率 100%」
// 从「设备全面健康」限定回「所查项目均正常」。

//go:linkname summarizeTemplateCoverage github.com/your-org/inspect-system/backend-go/internal/reports.summarizeTemplateCoverage
func summarizeTemplateCoverage(checkItems []byte) (covered []string, uncovered []string)

//go:linkname describeInspectionScope github.com/your-org/inspect-system/backend-go/internal/reports.describeInspectionScope
func describeInspectionScope(data reports.InspectionReportData) string

//go:linkname describeInspectionThresholdPolicy github.com/your-org/inspect-system/backend-go/internal/reports.describeInspectionThresholdPolicy
func describeInspectionThresholdPolicy(data reports.InspectionReportData) string

//go:linkname buildInspectionNarrative github.com/your-org/inspect-system/backend-go/internal/reports.buildInspectionNarrative
func buildInspectionNarrative(data reports.InspectionReportData) []string

// fullTemplateCheckItems 是「全面巡检」的 19 项检查项，与内置模板一致：
// 1 项 ICMP 连通性 + 18 项 SNMP。
const fullTemplateCheckItems = `[
	{"id":"connectivity","type":"icmp"},
	{"id":"reachable","type":"snmp","metric":"reachable"},
	{"id":"cpu","type":"snmp","metric":"cpu"},
	{"id":"memory","type":"snmp","metric":"memory"},
	{"id":"fan","type":"snmp","metric":"fan_status"},
	{"id":"power","type":"snmp","metric":"power_status"},
	{"id":"temperature","type":"snmp","metric":"temperature"},
	{"id":"uptime","type":"snmp","metric":"uptime"},
	{"id":"interface","type":"snmp","metric":"interface"},
	{"id":"util","type":"snmp","metric":"interface_utilization"},
	{"id":"errors","type":"snmp","metric":"interface_errors"},
	{"id":"discards","type":"snmp","metric":"interface_discards"},
	{"id":"admin","type":"snmp","metric":"interface_admin_status"},
	{"id":"duplex","type":"snmp","metric":"interface_duplex"},
	{"id":"bandwidth","type":"snmp","metric":"bandwidth"},
	{"id":"poe","type":"snmp","metric":"poe"},
	{"id":"optical","type":"snmp","metric":"optical_power"},
	{"id":"bgp","type":"snmp","metric":"bgp_peers"},
	{"id":"firmware","type":"snmp","metric":"firmware_version"}
]`

// connectivityTemplateCheckItems 是「连通性巡检」的 2 项。
const connectivityTemplateCheckItems = `[
	{"id":"connectivity","type":"icmp"},
	{"id":"reachable","type":"snmp","metric":"reachable"}
]`

// ---------------------------------------------------------------------------
// 覆盖范围推导
// ---------------------------------------------------------------------------

// TestCoverage_FullTemplateCoversEveryDimension 全面巡检应覆盖全部 19 个维度。
//
// 这条同时是「第五处同步点」的守门人：新增 metric 若忘了加进维度清单，
// 该维度会被永远算作未覆盖，报告于是在已经查过的情况下平白给出
// 「某某维度未核查」的免责声明。
func TestCoverage_FullTemplateCoversEveryDimension(t *testing.T) {
	covered, uncovered := summarizeTemplateCoverage([]byte(fullTemplateCheckItems))

	if len(uncovered) != 0 {
		t.Errorf("全面巡检不应有未覆盖维度，实际 %v", uncovered)
	}
	if len(covered) != 19 {
		t.Errorf("覆盖维度数 = %d，want 19；清单 = %v", len(covered), covered)
	}
}

// TestCoverage_ConnectivityTemplateLeavesMostUncovered 连通性巡检只覆盖两个维度。
func TestCoverage_ConnectivityTemplateLeavesMostUncovered(t *testing.T) {
	covered, uncovered := summarizeTemplateCoverage([]byte(connectivityTemplateCheckItems))

	if len(covered) != 2 {
		t.Errorf("覆盖维度数 = %d，want 2；清单 = %v", len(covered), covered)
	}
	if len(uncovered) != 17 {
		t.Errorf("未覆盖维度数 = %d，want 17；清单 = %v", len(uncovered), uncovered)
	}
	// 未覆盖清单必须给中文维度名，不能是 metric 键
	for _, label := range uncovered {
		if strings.Contains(label, "_") {
			t.Errorf("未覆盖维度应为中文名，实际出现 metric 键 %q", label)
		}
	}
}

// TestCoverage_SkipsDisabledItems 显式停用的检查项不计入覆盖范围。
//
// 停用项不会被执行，算进覆盖范围就等于声称查过了。enabled 缺失视为启用，
// 与执行端 filterEnabledCheckItems 的口径一致。
func TestCoverage_SkipsDisabledItems(t *testing.T) {
	covered, _ := summarizeTemplateCoverage([]byte(`[
		{"id":"connectivity","type":"icmp"},
		{"id":"cpu","type":"snmp","metric":"cpu","enabled":false}
	]`))

	for _, label := range covered {
		if label == "CPU" {
			t.Error("已停用的 CPU 检查项不应计入覆盖范围")
		}
	}
	if len(covered) != 1 {
		t.Errorf("覆盖维度数 = %d，want 1（仅连通性）；清单 = %v", len(covered), covered)
	}
}

// TestCoverage_UnreadableTemplateYieldsNothing 读不到模板时返回空，而非「全部未覆盖」。
//
// 这是本轮最容易搞反的一处契约。历史记录的 template_id 为 NULL，
// 若把「读不到模板」当成「什么都没查」，一份两年前的正常报告会平白多出
// 「全部 19 个维度未核查」的免责声明——比不写更误导。
func TestCoverage_UnreadableTemplateYieldsNothing(t *testing.T) {
	cases := map[string][]byte{
		"nil":      nil,
		"空数组":      []byte(`[]`),
		"非 JSON":   []byte(`模板已删除`),
		"全部停用":     []byte(`[{"id":"cpu","type":"snmp","metric":"cpu","enabled":false}]`),
		"无可识别维度":   []byte(`[{"id":"x","type":"snmp","metric":"unknown_metric"}]`),
		"JSON 对象": []byte(`{"items":[]}`),
	}

	for name, checkItems := range cases {
		t.Run(name, func(t *testing.T) {
			covered, uncovered := summarizeTemplateCoverage(checkItems)
			if len(covered) != 0 || len(uncovered) != 0 {
				t.Errorf("读不到有效模板应返回空，实际 covered=%v uncovered=%v", covered, uncovered)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// 覆盖范围声明
// ---------------------------------------------------------------------------

func scopeData(templateName string, covered, uncovered []string) reports.InspectionReportData {
	return reports.InspectionReportData{
		TemplateName:     templateName,
		TemplateCount:    1,
		CoveredMetrics:   covered,
		UncoveredMetrics: uncovered,
	}
}

// TestScope_OmittedWhenTemplateUnknown 读不到模板信息时整段省略。
func TestScope_OmittedWhenTemplateUnknown(t *testing.T) {
	if got := describeInspectionScope(reports.InspectionReportData{}); got != "" {
		t.Errorf("模板未知时应省略覆盖范围声明，实际输出 %q", got)
	}
}

// TestScope_DeclaresFullCoverage 全覆盖时说明覆盖了全部维度。
func TestScope_DeclaresFullCoverage(t *testing.T) {
	covered := make([]string, 19)
	for i := range covered {
		covered[i] = "维度"
	}

	got := describeInspectionScope(scopeData("全面巡检", covered, nil))

	if !strings.Contains(got, "全面巡检") {
		t.Errorf("声明应点名模板，实际 %q", got)
	}
	if !strings.Contains(got, "19") {
		t.Errorf("声明应给出覆盖维度数，实际 %q", got)
	}
}

// TestScope_ListsUncoveredDimensions 部分覆盖时必须列出未查维度。
//
// 「通过率 100%」若不附带「这 17 个维度没查」，读者得到的是错误的安全感。
func TestScope_ListsUncoveredDimensions(t *testing.T) {
	got := describeInspectionScope(scopeData("连通性巡检",
		[]string{"连通性", "SNMP 可达"},
		[]string{"CPU", "内存", "风扇状态"}))

	if !strings.Contains(got, "连通性巡检") {
		t.Errorf("声明应点名模板，实际 %q", got)
	}
	for _, want := range []string{"CPU", "内存", "风扇状态"} {
		if !strings.Contains(got, want) {
			t.Errorf("声明应列出未查维度 %q，实际 %q", want, got)
		}
	}
	if !strings.Contains(got, "未经核查") {
		t.Errorf("声明须明说未查维度状态未知，实际 %q", got)
	}
}

// TestScope_MultiTemplateAggregationIsFlagged 跨模板聚合时标注模板数并提示不可横比。
//
// 报表中心按时间窗口聚合时，多台设备可能跑的是不同档位。各档位覆盖维度与
// 阈值都不同，把它们的通过率并排比较没有意义，必须写明。
func TestScope_MultiTemplateAggregationIsFlagged(t *testing.T) {
	data := reports.InspectionReportData{TemplateCount: 3}

	got := describeInspectionScope(data)

	if got == "" {
		t.Fatal("跨模板聚合时仍须给出说明，不能整段省略")
	}
	if !strings.Contains(got, "3") {
		t.Errorf("说明应给出模板种类数，实际 %q", got)
	}
	if !strings.Contains(got, "横向比较") && !strings.Contains(got, "横比") {
		t.Errorf("说明须提示通过率不宜横比，实际 %q", got)
	}
}

// TestScope_MentionsNotApplicableChecks 因设备类型不适用而未执行的项要点名。
//
// 「未覆盖」（模板里就没有）与「不适用」（模板里有但设备类型不匹配）是两件事，
// 报告必须分开讲：前者是档位选择问题，后者是设备本身没有这个部件。
func TestScope_MentionsNotApplicableChecks(t *testing.T) {
	data := scopeData("全面巡检", []string{"连通性", "BGP 邻居"}, nil)
	data.Devices = []reports.InspectionDeviceData{
		{
			DeviceName: "核心交换机-01",
			CheckResults: []reports.InspectionCheckResult{
				{CheckItemName: "设备连通性", Status: "pass"},
				{CheckItemName: "BGP 邻居状态", Status: "not_applicable"},
			},
		},
	}

	got := describeInspectionScope(data)

	if !strings.Contains(got, "BGP 邻居状态") {
		t.Errorf("声明应点名不适用的检查项，实际 %q", got)
	}
	if !strings.Contains(got, "不适用") {
		t.Errorf("声明须说明原因是设备类型不适用，实际 %q", got)
	}
}

// ---------------------------------------------------------------------------
// 判定口径声明
// ---------------------------------------------------------------------------

func thresholdCheck(name, metric string, warning, critical float64, unit string) reports.InspectionCheckResult {
	return reports.InspectionCheckResult{
		CheckItemName: name,
		Status:        "pass",
		Threshold: &reports.CheckThresholdReport{
			Metric: metric, Warning: warning, Critical: critical, Unit: unit,
		},
	}
}

func thresholdData(checks ...reports.InspectionCheckResult) reports.InspectionReportData {
	return reports.InspectionReportData{
		TemplateName:  "全面巡检",
		TemplateCount: 1,
		Devices:       []reports.InspectionDeviceData{{DeviceName: "核心交换机-01", CheckResults: checks}},
	}
}

// TestThresholdPolicy_ListsEffectiveThresholds 判定口径须列出本次实际生效的阈值。
//
// 同一台 CPU 72% 的设备，阈值 70/85 判警告、阈值 80/95 判通过。两份报告并排
// 看会自相矛盾，而矛盾的根源——口径不同——必须写在报告里才解释得通。
// inspection_results 表没有阈值列，这些值只能经 details 透传。
func TestThresholdPolicy_ListsEffectiveThresholds(t *testing.T) {
	got := describeInspectionThresholdPolicy(thresholdData(
		thresholdCheck("CPU 使用率", "cpu", 70, 85, "%"),
		thresholdCheck("接口错包率", "interface_errors", 0.01, 0.1, "%"),
	))

	if got == "" {
		t.Fatal("存在带阈值的检查项时应给出判定口径说明")
	}
	for _, want := range []string{"CPU", "70", "85", "0.01", "0.1"} {
		if !strings.Contains(got, want) {
			t.Errorf("口径说明应包含 %q，实际 %q", want, got)
		}
	}
}

// TestThresholdPolicy_SilentWithoutThresholds 没有带阈值的检查项时保持沉默。
func TestThresholdPolicy_SilentWithoutThresholds(t *testing.T) {
	data := thresholdData(reports.InspectionCheckResult{CheckItemName: "设备连通性", Status: "pass"})

	if got := describeInspectionThresholdPolicy(data); got != "" {
		t.Errorf("无阈值检查项时应保持沉默，实际输出 %q", got)
	}
}

// TestThresholdPolicy_SilentWhenConflicting 同一指标出现互不相同的阈值时保持沉默。
//
// 跨档位聚合时口径本就不统一，任选其一去解释全部结果只会误导。
func TestThresholdPolicy_SilentWhenConflicting(t *testing.T) {
	data := reports.InspectionReportData{
		TemplateName:  "混合",
		TemplateCount: 2,
		Devices: []reports.InspectionDeviceData{
			{DeviceName: "A", CheckResults: []reports.InspectionCheckResult{
				thresholdCheck("CPU 使用率", "cpu", 70, 85, "%"),
			}},
			{DeviceName: "B", CheckResults: []reports.InspectionCheckResult{
				thresholdCheck("CPU 使用率", "cpu", 90, 97, "%"),
			}},
		},
	}

	if got := describeInspectionThresholdPolicy(data); got != "" {
		t.Errorf("同一指标阈值不一致时应保持沉默，实际输出 %q", got)
	}
}

// ---------------------------------------------------------------------------
// 叙述段装配
// ---------------------------------------------------------------------------

// TestNarrative_ScopeLeadsAndPolicyFollows 覆盖范围是首句，判定口径紧随其后。
//
// 顺序不是排版偏好：这两句限定了后面所有数字的解读边界，
// 放在通过率之后读者已经先形成了结论。
func TestNarrative_ScopeLeadsAndPolicyFollows(t *testing.T) {
	data := thresholdData(thresholdCheck("CPU 使用率", "cpu", 70, 85, "%"))
	data.CoveredMetrics = []string{"连通性", "CPU"}
	data.UncoveredMetrics = []string{"内存"}

	lines := buildInspectionNarrative(data)

	if len(lines) < 3 {
		t.Fatalf("叙述段应至少有覆盖范围、判定口径、通过情况三句，实际 %d 句：%v", len(lines), lines)
	}
	if !strings.Contains(lines[0], "全面巡检") {
		t.Errorf("首句应为覆盖范围声明，实际 %q", lines[0])
	}
	if !strings.Contains(lines[1], "70") {
		t.Errorf("次句应为判定口径说明，实际 %q", lines[1])
	}
}

// TestNarrative_UnchangedWhenTemplateUnknown 模板未知时叙述段退回原有内容。
//
// 历史报告不应因为这次改动而多出任何声明。
func TestNarrative_UnchangedWhenTemplateUnknown(t *testing.T) {
	data := reports.InspectionReportData{
		Devices: []reports.InspectionDeviceData{
			{DeviceName: "核心交换机-01", CheckResults: []reports.InspectionCheckResult{
				{CheckItemName: "设备连通性", Status: "pass"},
			}},
		},
	}

	lines := buildInspectionNarrative(data)

	if len(lines) == 0 {
		t.Fatal("叙述段不应为空")
	}
	if !strings.Contains(lines[0], "本次巡检覆盖") {
		t.Errorf("模板未知时首句应仍是通过情况，实际 %q", lines[0])
	}
}
