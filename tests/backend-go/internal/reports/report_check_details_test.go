package reports_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

// 本文件锁定 PDF 报告端对四类结构化明细的解析与渲染。
//
// PDF 走 buildInspectionReportDataFromDB 直接查库路径（snake_case 列名），
// 与 handlers 的 buildCheckResults（camelCase）互相独立——改一处不会惠及另一处。
// 解析函数是这条链路上唯一可纯函数测试的环节，因此契约全部锁在这里；
// 渲染层因 CJK 子集嵌入抽不出文本，只能断言结构完整性。

//go:linkname parseInterfaceRatioDetails github.com/your-org/inspect-system/backend-go/internal/reports.parseInterfaceRatioDetails
func parseInterfaceRatioDetails(raw *string) *reports.InterfaceRatioReport

//go:linkname parseOpticalPowerDetails github.com/your-org/inspect-system/backend-go/internal/reports.parseOpticalPowerDetails
func parseOpticalPowerDetails(raw *string) *reports.OpticalPowerReport

//go:linkname parseBGPPeersDetails github.com/your-org/inspect-system/backend-go/internal/reports.parseBGPPeersDetails
func parseBGPPeersDetails(raw *string) *reports.BGPPeersReport

//go:linkname parseComponentStatusDetails github.com/your-org/inspect-system/backend-go/internal/reports.parseComponentStatusDetails
func parseComponentStatusDetails(raw *string) *reports.ComponentStatusReport

//go:linkname writeInspectionPDF github.com/your-org/inspect-system/backend-go/internal/reports.writeInspectionPDF
func writeInspectionPDF(path string, data reports.InspectionReportData) error

//go:linkname bodyCellTextIndent github.com/your-org/inspect-system/backend-go/internal/reports.bodyCellTextIndent
func bodyCellTextIndent(accents [][3]int, rowIndex, colIndex int) float64

func rawJSON(s string) *string { return &s }

// ---------------------------------------------------------------------------
// 接口错包 / 丢弃率
// ---------------------------------------------------------------------------

const interfaceRatioPayload = `{
	"kind": "interface_errors",
	"total": 3, "evaluated": 2, "over_warning": 1, "over_critical": 1,
	"warning_threshold": 0.01, "critical_threshold": 0.1,
	"interfaces": [
		{"name": "GigabitEthernet0/0/1", "direction": "入", "percent": 1.2, "count": 1200, "packets": 98800},
		{"name": "GigabitEthernet0/0/2", "direction": "出", "percent": 0.0, "count": 0, "packets": 100000}
	],
	"skipped": [{"name": "NULL0", "reason": "设备未上报该计数器"}],
	"metric": "interface_errors",
	"threshold": {"warning": 0.01, "critical": 0.1, "unit": "%"}
}`

// TestParseInterfaceRatio_ReadsEntriesAndThresholds 错包明细须完整解析出逐接口行与生效阈值。
//
// 错包率的原始值（错包数与包数）必须一起带出：累计比率会被历史一次性故障长期
// 拉高，报告只给「1.2%」无法判断是持续劣化还是三年前的一次抖动。
func TestParseInterfaceRatio_ReadsEntriesAndThresholds(t *testing.T) {
	report := parseInterfaceRatioDetails(rawJSON(interfaceRatioPayload))
	if report == nil {
		t.Fatal("合法的 interface_errors 载荷应解析成功，实际返回 nil")
	}

	if report.Kind != "interface_errors" {
		t.Errorf("Kind = %q，want interface_errors", report.Kind)
	}
	if report.Total != 3 || report.Evaluated != 2 {
		t.Errorf("Total/Evaluated = %d/%d，want 3/2", report.Total, report.Evaluated)
	}
	if report.WarningThreshold != 0.01 || report.CriticalThreshold != 0.1 {
		t.Errorf("阈值 = %v/%v，want 0.01/0.1", report.WarningThreshold, report.CriticalThreshold)
	}

	if len(report.Interfaces) != 2 {
		t.Fatalf("接口行数 = %d，want 2", len(report.Interfaces))
	}
	first := report.Interfaces[0]
	if first.Name != "GigabitEthernet0/0/1" || first.Direction != "入" {
		t.Errorf("首行 = %q/%q，want GigabitEthernet0/0/1/入", first.Name, first.Direction)
	}
	if first.Count != 1200 || first.Packets != 98800 {
		t.Errorf("首行原始计数 = %d/%d，want 1200/98800", first.Count, first.Packets)
	}

	if len(report.Skipped) != 1 || report.Skipped[0].Reason == "" {
		t.Errorf("未评估接口应带原因，实际 %v", report.Skipped)
	}
}

// TestParseInterfaceRatio_AcceptsDiscardsKind 丢弃率与错包率共用载荷结构。
func TestParseInterfaceRatio_AcceptsDiscardsKind(t *testing.T) {
	payload := strings.Replace(interfaceRatioPayload, "interface_errors", "interface_discards", -1)
	if report := parseInterfaceRatioDetails(rawJSON(payload)); report == nil {
		t.Fatal("interface_discards 应复用同一解析器，实际返回 nil")
	}
}

// TestParseInterfaceRatio_RejectsOtherKinds 不得把别的 kind 误认成错包明细。
//
// 五种载荷共用 details 列，kind 是唯一的区分依据。解析器若不校验 kind，
// 接口利用率的载荷会被当成错包渲染出一张字段全空的表。
func TestParseInterfaceRatio_RejectsOtherKinds(t *testing.T) {
	payload := strings.Replace(interfaceRatioPayload, "interface_errors", "interface_utilization", -1)
	if report := parseInterfaceRatioDetails(rawJSON(payload)); report != nil {
		t.Errorf("interface_utilization 不应被当成错包明细，实际解析出 %v", report)
	}
}

// ---------------------------------------------------------------------------
// 光模块
// ---------------------------------------------------------------------------

const opticalPowerPayload = `{
	"kind": "optical_power",
	"total": 2, "evaluated": 1, "over_warning": 1, "over_critical": 0,
	"warning_threshold": -25, "critical_threshold": -30,
	"modules": [
		{"index": "GigabitEthernet0/0/1", "verdict": "warning",
		 "rx_power": -26.4, "rx_power_unit": "dBm",
		 "tx_power": -3.1, "tx_power_unit": "dBm",
		 "voltage": 3.3, "voltage_unit": "V",
		 "bias_current": 20.5, "bias_current_unit": "mA"}
	],
	"skipped": [{"name": "GigabitEthernet0/0/2", "reason": "设备未上报收光功率"}],
	"metric": "optical_power",
	"threshold": {"warning": -25, "critical": -30, "unit": "dBm"}
}`

// TestParseOpticalPower_ReadsDiagnosticsAndUnits 光模块明细须带诊断量及各自单位。
func TestParseOpticalPower_ReadsDiagnosticsAndUnits(t *testing.T) {
	report := parseOpticalPowerDetails(rawJSON(opticalPowerPayload))
	if report == nil {
		t.Fatal("合法的 optical_power 载荷应解析成功，实际返回 nil")
	}
	if len(report.Modules) != 1 {
		t.Fatalf("模块行数 = %d，want 1", len(report.Modules))
	}

	module := report.Modules[0]
	if module.Verdict != "warning" {
		t.Errorf("Verdict = %q，want warning", module.Verdict)
	}
	if module.RxPower != -26.4 || module.RxPowerUnit != "dBm" {
		t.Errorf("收光 = %v%s，want -26.4dBm", module.RxPower, module.RxPowerUnit)
	}
	if module.TxPower == nil || *module.TxPower != -3.1 {
		t.Errorf("发光 = %v，want -3.1", module.TxPower)
	}
	if module.Voltage == nil || *module.Voltage != 3.3 {
		t.Errorf("电压 = %v，want 3.3", module.Voltage)
	}
	if module.BiasCurrent == nil || *module.BiasCurrent != 20.5 {
		t.Errorf("偏置电流 = %v，want 20.5", module.BiasCurrent)
	}
	if module.BiasCurrentUnit != "mA" {
		t.Errorf("偏置电流单位 = %q，want mA", module.BiasCurrentUnit)
	}
	if len(report.Skipped) != 1 {
		t.Errorf("未评估模块应保留，实际 %v", report.Skipped)
	}
}

// TestParseOpticalPower_TolerantToMissingDiagnostics 缺诊断量的模块不应让整份载荷作废。
//
// 厂商对 DDM 的支持参差不齐：多数只给收光，电压与偏置电流常常缺失。
// 若因缺字段返回 nil，最有价值的收光清单会一并丢失。
func TestParseOpticalPower_TolerantToMissingDiagnostics(t *testing.T) {
	payload := `{"kind":"optical_power","total":1,"evaluated":1,
		"modules":[{"index":"1","verdict":"pass","rx_power":-12.5,"rx_power_unit":"dBm"}]}`

	report := parseOpticalPowerDetails(rawJSON(payload))
	if report == nil {
		t.Fatal("缺诊断量不应让载荷作废，实际返回 nil")
	}
	if len(report.Modules) != 1 {
		t.Fatalf("模块行数 = %d，want 1", len(report.Modules))
	}
	if report.Modules[0].TxPower != nil || report.Modules[0].Voltage != nil {
		t.Error("未上报的诊断量应保持 nil，供渲染层显示为「-」而非 0")
	}
}

// ---------------------------------------------------------------------------
// BGP 邻居
// ---------------------------------------------------------------------------

const bgpPeersPayload = `{
	"kind": "bgp_peers",
	"total": 3, "established": 2, "down": 1, "flapping": 1,
	"flapping_threshold_seconds": 3600,
	"peers": [
		{"index": "10.0.0.3", "verdict": "fail", "state": 2, "state_label": "connect",
		 "last_error": "hold timer expired"},
		{"index": "10.0.0.2", "verdict": "warning", "state": 6, "state_label": "established",
		 "established_seconds": 120},
		{"index": "10.0.0.1", "verdict": "pass", "state": 6, "established_seconds": 864000}
	]
}`

// TestParseBGPPeers_ReadsPeersAndThreshold BGP 明细须解析出逐邻居行与震荡判定线。
func TestParseBGPPeers_ReadsPeersAndThreshold(t *testing.T) {
	report := parseBGPPeersDetails(rawJSON(bgpPeersPayload))
	if report == nil {
		t.Fatal("合法的 bgp_peers 载荷应解析成功，实际返回 nil")
	}
	if report.Total != 3 || report.Established != 2 || report.Down != 1 || report.Flapping != 1 {
		t.Errorf("计数 = %d/%d/%d/%d，want 3/2/1/1",
			report.Total, report.Established, report.Down, report.Flapping)
	}
	if report.FlappingThresholdSeconds != 3600 {
		t.Errorf("震荡判定线 = %d，want 3600", report.FlappingThresholdSeconds)
	}

	if len(report.Peers) != 3 {
		t.Fatalf("邻居行数 = %d，want 3", len(report.Peers))
	}
	first := report.Peers[0]
	if first.Index != "10.0.0.3" || first.Verdict != "fail" {
		t.Errorf("首行 = %q/%q，want 10.0.0.3/fail", first.Index, first.Verdict)
	}
	if first.LastError != "hold timer expired" {
		t.Errorf("LastError = %q，want hold timer expired", first.LastError)
	}
	if first.StateLabel != "connect" {
		t.Errorf("StateLabel = %q，want connect", first.StateLabel)
	}
	if report.Peers[1].EstablishedSeconds == nil || *report.Peers[1].EstablishedSeconds != 120 {
		t.Errorf("震荡邻居建立时长 = %v，want 120", report.Peers[1].EstablishedSeconds)
	}
}

// ---------------------------------------------------------------------------
// 部件状态
// ---------------------------------------------------------------------------

const componentStatusPayload = `{
	"kind": "component_status",
	"component_kind": "fan", "label": "风扇",
	"total": 3, "normal": 1, "abnormal": 1, "unknown": 1,
	"normal_states": [1], "abnormal_states": [2],
	"components": [
		{"index": "2", "kind": "fan", "verdict": "fail", "state": 2},
		{"index": "3", "kind": "fan", "verdict": "skip", "state": 77},
		{"index": "1", "kind": "fan", "verdict": "pass", "state": 1}
	]
}`

// TestParseComponentStatus_ReadsComponentsAndCriteria 部件明细须带原始状态码与判定依据。
//
// 回显 normal_states / abnormal_states 是本类明细的核心：状态码语义因厂商而异，
// 报告只给「码 77，未知」运维无从下手，连同「本次按正常={1}、异常={2} 判的」
// 一起给出，才能据此校准模板配置。
func TestParseComponentStatus_ReadsComponentsAndCriteria(t *testing.T) {
	report := parseComponentStatusDetails(rawJSON(componentStatusPayload))
	if report == nil {
		t.Fatal("合法的 component_status 载荷应解析成功，实际返回 nil")
	}
	if report.ComponentKind != "fan" || report.Label != "风扇" {
		t.Errorf("部件类别 = %q/%q，want fan/风扇", report.ComponentKind, report.Label)
	}
	if report.Total != 3 || report.Normal != 1 || report.Abnormal != 1 || report.Unknown != 1 {
		t.Errorf("计数 = %d/%d/%d/%d，want 3/1/1/1",
			report.Total, report.Normal, report.Abnormal, report.Unknown)
	}

	if len(report.NormalStates) != 1 || report.NormalStates[0] != 1 {
		t.Errorf("NormalStates = %v，want [1]", report.NormalStates)
	}
	if len(report.AbnormalStates) != 1 || report.AbnormalStates[0] != 2 {
		t.Errorf("AbnormalStates = %v，want [2]", report.AbnormalStates)
	}

	if len(report.Components) != 3 {
		t.Fatalf("部件行数 = %d，want 3", len(report.Components))
	}
	unknown := report.Components[1]
	if unknown.Verdict != "skip" {
		t.Errorf("未知码行判定 = %q，want skip", unknown.Verdict)
	}
	if unknown.State == nil || *unknown.State != 77 {
		t.Errorf("未知码行须保留原始码，实际 %v", unknown.State)
	}
}

// ---------------------------------------------------------------------------
// 脏数据容错
// ---------------------------------------------------------------------------

// TestParseCheckDetails_TolerantToBadInput 空值、非 JSON、错误 kind 一律返回 nil。
//
// 报告的底线是「一条脏数据不中断出报」：解析失败就退回只渲染摘要行。
// 历史上 details 列存过手工写入的自由文本，解析器必须扛得住。
func TestParseCheckDetails_TolerantToBadInput(t *testing.T) {
	bad := []struct {
		name string
		raw  *string
	}{
		{"nil", nil},
		{"空串", rawJSON("")},
		{"空白", rawJSON("   ")},
		{"非 JSON", rawJSON("检查通过")},
		{"JSON 数组", rawJSON(`[1,2,3]`)},
		{"缺 kind", rawJSON(`{"total":3}`)},
		{"kind 不匹配", rawJSON(`{"kind":"threshold","threshold":{"warning":1}}`)},
	}

	for _, tc := range bad {
		t.Run(tc.name, func(t *testing.T) {
			if got := parseInterfaceRatioDetails(tc.raw); got != nil {
				t.Errorf("parseInterfaceRatioDetails 应返回 nil，实际 %v", got)
			}
			if got := parseOpticalPowerDetails(tc.raw); got != nil {
				t.Errorf("parseOpticalPowerDetails 应返回 nil，实际 %v", got)
			}
			if got := parseBGPPeersDetails(tc.raw); got != nil {
				t.Errorf("parseBGPPeersDetails 应返回 nil，实际 %v", got)
			}
			if got := parseComponentStatusDetails(tc.raw); got != nil {
				t.Errorf("parseComponentStatusDetails 应返回 nil，实际 %v", got)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

// inspectionDataWithDetailTables 构造一台设备跑完四类明细型检查项的报告数据。
func inspectionDataWithDetailTables() reports.InspectionReportData {
	return reports.InspectionReportData{
		InspectionName: "核心区例行巡检",
		InspectionID:   "INSP-90",
		Devices: []reports.InspectionDeviceData{
			{
				DeviceName: "核心交换机-01",
				IPAddress:  "192.168.20.1",
				DeviceType: "switch",
				CheckResults: []reports.InspectionCheckResult{
					{
						CheckItemName: "接口错包率", CheckItemType: "snmp", Status: "fail",
						InterfaceRatio: parseInterfaceRatioDetails(rawJSON(interfaceRatioPayload)),
					},
					{
						CheckItemName: "光模块光功率", CheckItemType: "snmp", Status: "warning",
						OpticalPower: parseOpticalPowerDetails(rawJSON(opticalPowerPayload)),
					},
					{
						CheckItemName: "BGP 邻居状态", CheckItemType: "snmp", Status: "fail",
						BGPPeers: parseBGPPeersDetails(rawJSON(bgpPeersPayload)),
					},
					{
						CheckItemName: "风扇状态", CheckItemType: "snmp", Status: "fail",
						ComponentStatus: parseComponentStatusDetails(rawJSON(componentStatusPayload)),
					},
				},
			},
		},
	}
}

// TestInspectionPDF_RendersDetailTables 四类明细必须实际渲染进 PDF。
//
// CJK 走子集嵌入，pdftotext 抽不出字符，无法断言文案。这里用「带明细的 PDF
// 显著大于不带明细的同构 PDF」来证明表格确实画出去了——若渲染函数被漏调，
// 两者体积会几乎一致。
func TestInspectionPDF_RendersDetailTables(t *testing.T) {
	withDetails := inspectionDataWithDetailTables()

	bare := inspectionDataWithDetailTables()
	for i := range bare.Devices[0].CheckResults {
		bare.Devices[0].CheckResults[i].InterfaceRatio = nil
		bare.Devices[0].CheckResults[i].OpticalPower = nil
		bare.Devices[0].CheckResults[i].BGPPeers = nil
		bare.Devices[0].CheckResults[i].ComponentStatus = nil
	}

	fullSize := renderInspectionPDFSize(t, withDetails, "with-details.pdf")
	bareSize := renderInspectionPDFSize(t, bare, "bare.pdf")

	if fullSize <= bareSize {
		t.Fatalf("带明细 PDF = %d 字节，不带明细 = %d 字节；明细表未被渲染", fullSize, bareSize)
	}
}

func renderInspectionPDFSize(t *testing.T, data reports.InspectionReportData, name string) int64 {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := writeInspectionPDF(path, data); err != nil {
		if strings.Contains(err.Error(), "未找到可用的PDF中文字体") {
			t.Skipf("当前环境缺少 PDF 中文字体，跳过渲染断言: %v", err)
		}
		t.Fatalf("writeInspectionPDF(%q) error = %v", name, err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Stat(%q) error = %v", path, err)
	}
	return info.Size()
}

// ---------------------------------------------------------------------------
// 行强调条与首列文本的位置冲突
// ---------------------------------------------------------------------------

// TestBodyCellTextIndent_AvoidsAccentBar 有强调条的行，首列文本必须让开条宽。
//
// 端到端验证时发现的真实缺陷：强调条是一条 1.5mm 宽的实心矩形，为了压住单元格
// 左边框而在最后绘制。首列文本只有 gofpdf 默认约 1mm 的内边距，于是被压在条下。
// 中文首字因字形左边距较大恰好躲开，所以这个缺陷一直没暴露——直到部件编号
// 「0.3」、邻居 IP「10.0.0.3」这类以数字起头的标识列出现，首字被裁掉半个。
func TestBodyCellTextIndent_AvoidsAccentBar(t *testing.T) {
	accents := [][3]int{{220, 38, 38}}

	if got := bodyCellTextIndent(accents, 0, 0); got < 1.5 {
		t.Errorf("有强调条的行首列缩进 = %v，应不小于条宽 1.5mm", got)
	}
}

// TestBodyCellTextIndent_OnlyFirstColumn 非首列不缩进，强调条只在最左侧。
func TestBodyCellTextIndent_OnlyFirstColumn(t *testing.T) {
	accents := [][3]int{{220, 38, 38}}

	if got := bodyCellTextIndent(accents, 0, 1); got != 0 {
		t.Errorf("非首列不应缩进，实际 %v", got)
	}
}

// TestBodyCellTextIndent_NoAccentNoIndent 无强调条的行保持原有排版。
//
// 绝大多数表格没有强调条，无端多缩进 1.5mm 会让列宽计算与既有报告不一致。
func TestBodyCellTextIndent_NoAccentNoIndent(t *testing.T) {
	cases := map[string][][3]int{
		"无强调条列表": nil,
		"该行为零值":  {{0, 0, 0}},
		"行索引越界":  {},
	}

	for name, accents := range cases {
		t.Run(name, func(t *testing.T) {
			if got := bodyCellTextIndent(accents, 0, 0); got != 0 {
				t.Errorf("无强调条时不应缩进，实际 %v", got)
			}
		})
	}
}
