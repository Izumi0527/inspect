package handlers_test

import (
	"encoding/json"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

// 本文件锁定光模块、BGP 邻居、部件状态三类检查项的结构化明细载荷。
//
// 明细的价值在于「摘要说有问题之后，报告能指出是哪一个」。ActualValue 只能放
// 一句话，超过两三个对象就必须截断；details 则是给报告出表用的完整清单。
//
// 三个共同约定：
//   - 顶层必须有 kind，消费方按 kind 分派渲染（PDF 与前端各自独立解析）
//   - 逐行的 verdict 复用检查状态词表 pass/warning/fail/skip，避免另造一套词
//     还要在 PDF 与前端两处维护映射
//   - 排序最坏优先，报告表格截断时留下的是需要处理的那几行

// decodeDetails 解析 details 载荷，顺带断言它非空且是合法 JSON。
func decodeDetails(t *testing.T, result *inspection.Result) map[string]interface{} {
	t.Helper()
	if len(result.Details) == 0 {
		t.Fatalf("details 为空，报告无从出明细表（状态 %q，消息 %v）", result.Status, result.Message)
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(result.Details, &payload); err != nil {
		t.Fatalf("details 解析失败: %v，内容 = %s", err, string(result.Details))
	}
	return payload
}

// detailRows 取出载荷里的行数组并断言其形状。
func detailRows(t *testing.T, payload map[string]interface{}, key string) []map[string]interface{} {
	t.Helper()
	raw, ok := payload[key]
	if !ok {
		t.Fatalf("details 缺少 %q 数组，实际字段 = %v", key, payloadKeys(payload))
	}
	list, ok := raw.([]interface{})
	if !ok {
		t.Fatalf("details[%q] 不是数组，实际 %T", key, raw)
	}
	rows := make([]map[string]interface{}, 0, len(list))
	for i, item := range list {
		row, ok := item.(map[string]interface{})
		if !ok {
			t.Fatalf("details[%q][%d] 不是对象，实际 %T", key, i, item)
		}
		rows = append(rows, row)
	}
	return rows
}

func payloadKeys(payload map[string]interface{}) []string {
	keys := make([]string, 0, len(payload))
	for key := range payload {
		keys = append(keys, key)
	}
	return keys
}

func rowString(t *testing.T, row map[string]interface{}, key string) string {
	t.Helper()
	value, ok := row[key].(string)
	if !ok {
		t.Fatalf("行缺少字符串字段 %q，实际行 = %v", key, row)
	}
	return value
}

func rowNumber(t *testing.T, row map[string]interface{}, key string) float64 {
	t.Helper()
	value, ok := row[key].(float64)
	if !ok {
		t.Fatalf("行缺少数值字段 %q，实际行 = %v", key, row)
	}
	return value
}

// ---------------------------------------------------------------------------
// 光模块光功率
// ---------------------------------------------------------------------------

func opticalModule(index string, rx float64) devices.OpticalTransceiverMetrics {
	return devices.OpticalTransceiverMetrics{
		Index: index, RxPower: f64(rx), RxPowerUnit: "dBm",
		TxPower: f64(-3.1), TxPowerUnit: "dBm",
		Voltage: f64(3.3), VoltageUnit: "V",
		BiasCurrent: f64(20.5), BiasCurrentUnit: "mA",
	}
}

// TestOpticalPowerDetails_ListsModulesWorstFirst 逐模块明细按收光功率升序，最差的排最前。
//
// 光衰是渐进劣化，报告里真正需要盯的是收光最低的那几个模块——它们是下一次
// 链路中断的候选。表格若按索引排，运维得自己扫一遍才能找到问题模块。
func TestOpticalPowerDetails_ListsModulesWorstFirst(t *testing.T) {
	result := runMetricCheck(t, "optical_power", &devices.SNMPMetrics{
		OpticalTransceivers: []devices.OpticalTransceiverMetrics{
			opticalModule("1", -12.5),
			opticalModule("2", -31.8),
			opticalModule("3", -26.4),
		},
	}, nil)

	payload := decodeDetails(t, result)
	if payload["kind"] != "optical_power" {
		t.Fatalf("kind 应为 optical_power，实际 %v", payload["kind"])
	}

	rows := detailRows(t, payload, "modules")
	if len(rows) != 3 {
		t.Fatalf("应列出 3 个模块，实际 %d", len(rows))
	}

	wantOrder := []string{"2", "3", "1"}
	for i, want := range wantOrder {
		if got := rowString(t, rows[i], "index"); got != want {
			t.Errorf("第 %d 行应为模块 %s（收光升序），实际 %s", i, want, got)
		}
	}

	// 逐行判定：-31.8 低于默认故障阈值 -30，-26.4 低于警告阈值 -25，-12.5 正常
	wantVerdicts := []string{"fail", "warning", "pass"}
	for i, want := range wantVerdicts {
		if got := rowString(t, rows[i], "verdict"); got != want {
			t.Errorf("第 %d 行判定应为 %s，实际 %s（行 = %v）", i, want, got, rows[i])
		}
	}
}

// TestOpticalPowerDetails_CarriesDiagnosticsWithUnits 明细须带上电压与偏置电流及各自单位。
//
// 收光偏低有两种成因：链路侧（光纤衰耗、接头脏污）与模块侧（激光器老化）。
// 偏置电流升高而发光下降指向后者，是「换模块」还是「查光纤」的判断依据。
// 单位必须随值一起给——catalog 各条目量纲不一，脱离单位的裸数字无法解读。
func TestOpticalPowerDetails_CarriesDiagnosticsWithUnits(t *testing.T) {
	result := runMetricCheck(t, "optical_power", &devices.SNMPMetrics{
		OpticalTransceivers: []devices.OpticalTransceiverMetrics{opticalModule("1", -12.5)},
	}, nil)

	rows := detailRows(t, decodeDetails(t, result), "modules")
	if len(rows) != 1 {
		t.Fatalf("应列出 1 个模块，实际 %d", len(rows))
	}
	row := rows[0]

	if got := rowNumber(t, row, "rx_power"); got != -12.5 {
		t.Errorf("rx_power 应为 -12.5，实际 %v", got)
	}
	if got := rowNumber(t, row, "tx_power"); got != -3.1 {
		t.Errorf("tx_power 应为 -3.1，实际 %v", got)
	}
	if got := rowNumber(t, row, "voltage"); got != 3.3 {
		t.Errorf("voltage 应为 3.3，实际 %v", got)
	}
	if got := rowNumber(t, row, "bias_current"); got != 20.5 {
		t.Errorf("bias_current 应为 20.5，实际 %v", got)
	}
	for key, want := range map[string]string{
		"rx_power_unit": "dBm", "tx_power_unit": "dBm",
		"voltage_unit": "V", "bias_current_unit": "mA",
	} {
		if got := rowString(t, row, key); got != want {
			t.Errorf("%s 应为 %q，实际 %q", key, want, got)
		}
	}
}

// TestOpticalPowerDetails_RecordsSkippedModules 未上报收光功率的模块进 skipped 并附原因。
//
// 「采到 8 个模块只评估了 3 个」必须在报告里可见。若把未评估的模块直接丢弃，
// 报告会给出「3 个模块均正常」的假全景，掩盖另外 5 个的状态未知。
func TestOpticalPowerDetails_RecordsSkippedModules(t *testing.T) {
	result := runMetricCheck(t, "optical_power", &devices.SNMPMetrics{
		OpticalTransceivers: []devices.OpticalTransceiverMetrics{
			opticalModule("1", -12.5),
			{Index: "2", Voltage: f64(3.3), VoltageUnit: "V"},
		},
	}, nil)

	payload := decodeDetails(t, result)
	if got := payload["total"]; got != float64(2) {
		t.Errorf("total 应为 2，实际 %v", got)
	}
	if got := payload["evaluated"]; got != float64(1) {
		t.Errorf("evaluated 应为 1，实际 %v", got)
	}

	skipped := detailRows(t, payload, "skipped")
	if len(skipped) != 1 {
		t.Fatalf("应记录 1 个未评估模块，实际 %d", len(skipped))
	}
	if got := rowString(t, skipped[0], "name"); got != "2" {
		t.Errorf("未评估模块应为 2，实际 %s", got)
	}
	if rowString(t, skipped[0], "reason") == "" {
		t.Error("未评估模块必须附原因，否则报告无从解释为何漏了它")
	}
}

// TestOpticalPowerDetails_KeepsThresholdPayload 明细载荷须并入阈值口径。
//
// 同一指标在不同模板下阈值可能不同，inspection_results 表没有阈值列，
// 报告要说明「本次按 -25/-30 判的」只能靠 details 透传。
func TestOpticalPowerDetails_KeepsThresholdPayload(t *testing.T) {
	result := runMetricCheck(t, "optical_power", &devices.SNMPMetrics{
		OpticalTransceivers: []devices.OpticalTransceiverMetrics{opticalModule("1", -12.5)},
	}, thresholdConfig(-20, -28, "dBm"))

	payload := decodeDetails(t, result)
	threshold, ok := payload["threshold"].(map[string]interface{})
	if !ok {
		t.Fatalf("details 缺少 threshold 字段，实际字段 = %v", payloadKeys(payload))
	}
	if threshold["warning"] != float64(-20) || threshold["critical"] != float64(-28) {
		t.Errorf("threshold 应回显生效阈值 -20/-28，实际 %v", threshold)
	}
	if threshold["unit"] != "dBm" {
		t.Errorf("threshold.unit 应为 dBm，实际 %v", threshold["unit"])
	}
}

// ---------------------------------------------------------------------------
// BGP 邻居
// ---------------------------------------------------------------------------

func bgpPeer(index string, state int) devices.BGPNeighborMetrics {
	return devices.BGPNeighborMetrics{Index: index, State: intPtr(state)}
}

// TestBGPPeersDetails_ListsPeersWithVerdict 逐邻居明细带判定，问题邻居排最前。
//
// 一台边界路由器可能有几十个邻居，摘要只能说「3 个未建立」。要定位是哪三个
// 必须有清单，且未建立与震荡的邻居要排在前面。
func TestBGPPeersDetails_ListsPeersWithVerdict(t *testing.T) {
	stable := bgpPeer("10.0.0.1", 6)
	stable.EstablishedTime = i64(864000)
	flapping := bgpPeer("10.0.0.2", 6)
	flapping.EstablishedTime = i64(120)
	down := bgpPeer("10.0.0.3", 2)
	down.StateLabel = "connect"

	result := runMetricCheck(t, "bgp_peers", &devices.SNMPMetrics{
		BGPPeers: []devices.BGPNeighborMetrics{stable, flapping, down},
	}, nil)

	payload := decodeDetails(t, result)
	if payload["kind"] != "bgp_peers" {
		t.Fatalf("kind 应为 bgp_peers，实际 %v", payload["kind"])
	}

	rows := detailRows(t, payload, "peers")
	if len(rows) != 3 {
		t.Fatalf("应列出 3 个邻居，实际 %d", len(rows))
	}

	wantOrder := []struct{ index, verdict string }{
		{"10.0.0.3", "fail"},    // 未建立：直接造成路由黑洞
		{"10.0.0.2", "warning"}, // 建立不足一小时：会话在反复重建
		{"10.0.0.1", "pass"},
	}
	for i, want := range wantOrder {
		if got := rowString(t, rows[i], "index"); got != want.index {
			t.Errorf("第 %d 行应为邻居 %s，实际 %s", i, want.index, got)
		}
		if got := rowString(t, rows[i], "verdict"); got != want.verdict {
			t.Errorf("邻居 %s 判定应为 %s，实际 %s（行 = %v）", want.index, want.verdict, got, rows[i])
		}
	}
}

// TestBGPPeersDetails_CarriesStateAndLastError 明细须带状态标签、建立时长与最后错误。
//
// LastError 是排障的起点——「hold timer expired」指向链路或负载，
// 「authentication failure」指向配置。这条信息只有 BGP MIB 有，丢了就得登设备查。
func TestBGPPeersDetails_CarriesStateAndLastError(t *testing.T) {
	peer := bgpPeer("10.0.0.9", 2)
	peer.StateLabel = "connect"
	peer.EstablishedTime = i64(45)
	lastError := "hold timer expired"
	peer.LastError = &lastError

	result := runMetricCheck(t, "bgp_peers", &devices.SNMPMetrics{
		BGPPeers: []devices.BGPNeighborMetrics{peer},
	}, nil)

	rows := detailRows(t, decodeDetails(t, result), "peers")
	if len(rows) != 1 {
		t.Fatalf("应列出 1 个邻居，实际 %d", len(rows))
	}
	row := rows[0]

	if got := rowString(t, row, "state_label"); got != "connect" {
		t.Errorf("state_label 应为 connect，实际 %q", got)
	}
	if got := rowNumber(t, row, "state"); got != 2 {
		t.Errorf("state 应回显原始状态码 2，实际 %v", got)
	}
	if got := rowNumber(t, row, "established_seconds"); got != 45 {
		t.Errorf("established_seconds 应为 45，实际 %v", got)
	}
	if got := rowString(t, row, "last_error"); got != lastError {
		t.Errorf("last_error 应为 %q，实际 %q", lastError, got)
	}
}

// TestBGPPeersDetails_ExposesFlappingThreshold 载荷须声明震荡判定口径。
//
// 「建立时长 120 秒」本身不说明问题，得知道判定线在哪。报告要能写出
// 「建立时长低于 3600 秒视为近期重建」，这个常量必须随载荷下发。
func TestBGPPeersDetails_ExposesFlappingThreshold(t *testing.T) {
	peer := bgpPeer("10.0.0.1", 6)
	peer.EstablishedTime = i64(864000)

	result := runMetricCheck(t, "bgp_peers", &devices.SNMPMetrics{
		BGPPeers: []devices.BGPNeighborMetrics{peer},
	}, nil)

	payload := decodeDetails(t, result)
	if got := payload["flapping_threshold_seconds"]; got != float64(3600) {
		t.Errorf("flapping_threshold_seconds 应为 3600，实际 %v", got)
	}
	for key, want := range map[string]float64{"total": 1, "established": 1, "down": 0, "flapping": 0} {
		if got := payload[key]; got != want {
			t.Errorf("%s 应为 %v，实际 %v", key, want, got)
		}
	}
}

// ---------------------------------------------------------------------------
// 部件状态（风扇 / 电源）
// ---------------------------------------------------------------------------

// TestComponentStatusDetails_ListsComponentsWorstFirst 逐部件明细带判定，异常与未知排前。
func TestComponentStatusDetails_ListsComponentsWorstFirst(t *testing.T) {
	result := runMetricCheck(t, "fan_status", &devices.SNMPMetrics{
		Components: []devices.ComponentStatusMetrics{
			component("fan", "1", 1),
			component("fan", "2", 2),
			component("fan", "3", 77),
		},
	}, nil)

	payload := decodeDetails(t, result)
	if payload["kind"] != "component_status" {
		t.Fatalf("kind 应为 component_status，实际 %v", payload["kind"])
	}
	if payload["component_kind"] != "fan" {
		t.Errorf("component_kind 应为 fan，实际 %v", payload["component_kind"])
	}

	rows := detailRows(t, payload, "components")
	if len(rows) != 3 {
		t.Fatalf("应列出 3 个部件，实际 %d", len(rows))
	}

	wantOrder := []struct{ index, verdict string }{
		{"2", "fail"}, // 已知异常码
		{"3", "skip"}, // 未知码：不作判定
		{"1", "pass"},
	}
	for i, want := range wantOrder {
		if got := rowString(t, rows[i], "index"); got != want.index {
			t.Errorf("第 %d 行应为部件 %s，实际 %s", i, want.index, got)
		}
		if got := rowString(t, rows[i], "verdict"); got != want.verdict {
			t.Errorf("部件 %s 判定应为 %s，实际 %s（行 = %v）", want.index, want.verdict, got, rows[i])
		}
	}
}

// TestComponentStatusDetails_EchoesStateCodeCriteria 载荷须回显本次生效的状态码集合。
//
// 这是本类明细最关键的一条。状态码语义因厂商而异，模板可覆盖 normal_states /
// abnormal_states。报告只给「码 77，未知」运维无从下手；连同「本次按正常={1}、
// 异常={2} 判的」一起给出，才能据此校准模板配置。
func TestComponentStatusDetails_EchoesStateCodeCriteria(t *testing.T) {
	result := runMetricCheck(t, "power_status", &devices.SNMPMetrics{
		Components: []devices.ComponentStatusMetrics{component("power", "1", 3)},
	}, map[string]interface{}{
		"normal_states":   []interface{}{float64(3)},
		"abnormal_states": []interface{}{float64(4), float64(5)},
	})

	payload := decodeDetails(t, result)
	normal, ok := payload["normal_states"].([]interface{})
	if !ok || len(normal) != 1 || normal[0] != float64(3) {
		t.Errorf("normal_states 应回显 [3]，实际 %v", payload["normal_states"])
	}
	abnormal, ok := payload["abnormal_states"].([]interface{})
	if !ok || len(abnormal) != 2 {
		t.Fatalf("abnormal_states 应回显 [4 5]，实际 %v", payload["abnormal_states"])
	}
	if abnormal[0] != float64(4) || abnormal[1] != float64(5) {
		t.Errorf("abnormal_states 应回显 [4 5]，实际 %v", abnormal)
	}

	rows := detailRows(t, payload, "components")
	if len(rows) != 1 || rowString(t, rows[0], "verdict") != "pass" {
		t.Errorf("配置 normal_states=[3] 后码 3 应判 pass，实际 %v", rows)
	}
	if got := rowNumber(t, rows[0], "state"); got != 3 {
		t.Errorf("state 应回显原始码 3，实际 %v", got)
	}
}

// TestComponentStatusDetails_ExcludesOtherKinds 风扇检查的明细不得混入电源部件。
//
// Components 是所有部件的混合清单，风扇与电源两个检查项共用它。明细若不按
// kind 过滤，风扇表里会出现电源行，且计数与摘要对不上。
func TestComponentStatusDetails_ExcludesOtherKinds(t *testing.T) {
	result := runMetricCheck(t, "fan_status", &devices.SNMPMetrics{
		Components: []devices.ComponentStatusMetrics{
			component("fan", "1", 1),
			component("power", "1", 2),
			component("board", "1", 2),
		},
	}, nil)

	payload := decodeDetails(t, result)
	rows := detailRows(t, payload, "components")
	if len(rows) != 1 {
		t.Fatalf("风扇明细应只含 1 个风扇部件，实际 %d 行：%v", len(rows), rows)
	}
	if got := rowString(t, rows[0], "kind"); got != "fan" {
		t.Errorf("行的 kind 应为 fan，实际 %s", got)
	}
	if got := payload["total"]; got != float64(1) {
		t.Errorf("total 应只统计风扇，实际 %v", got)
	}
}

// TestComponentStatusDetails_CountsByVerdict 载荷须给出正常/异常/未知计数。
func TestComponentStatusDetails_CountsByVerdict(t *testing.T) {
	result := runMetricCheck(t, "fan_status", &devices.SNMPMetrics{
		Components: []devices.ComponentStatusMetrics{
			component("fan", "1", 1),
			component("fan", "2", 1),
			component("fan", "3", 2),
			component("fan", "4", 99),
		},
	}, nil)

	payload := decodeDetails(t, result)
	for key, want := range map[string]float64{"total": 4, "normal": 2, "abnormal": 1, "unknown": 1} {
		if got := payload[key]; got != want {
			t.Errorf("%s 应为 %v，实际 %v", key, want, got)
		}
	}
}
