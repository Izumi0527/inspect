package handlers_test

import (
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
)

func f64(v float64) *float64 { return &v }

func component(kind string, index string, state int64) devices.ComponentStatusMetrics {
	return devices.ComponentStatusMetrics{Index: index, Kind: kind, State: &state}
}

// ---------------------------------------------------------------------------
// 风扇 / 电源
// ---------------------------------------------------------------------------

// TestFanStatus_AbnormalStateFails 处于已知异常码的风扇应判失败。
//
// 单风扇故障会让散热余量不足，等温度检查发现时设备往往已在劣化。
func TestFanStatus_AbnormalStateFails(t *testing.T) {
	result := runMetricCheck(t, "fan_status", &devices.SNMPMetrics{
		Components: []devices.ComponentStatusMetrics{
			component("fan", "1", 1),
			component("fan", "2", 2),
		},
	}, nil)

	if result.Status != "fail" {
		t.Errorf("存在异常风扇应判 fail，实际 %q（消息：%v）", result.Status, result.Message)
	}
}

// TestFanStatus_AllNormalPasses 全部风扇正常时通过。
func TestFanStatus_AllNormalPasses(t *testing.T) {
	result := runMetricCheck(t, "fan_status", &devices.SNMPMetrics{
		Components: []devices.ComponentStatusMetrics{component("fan", "1", 1), component("fan", "2", 1)},
	}, nil)

	if result.Status != "pass" {
		t.Errorf("风扇全正常应判 pass，实际 %q（消息：%v）", result.Status, result.Message)
	}
}

// TestFanStatus_UnknownStateSkips 状态码不在已知集合内时判 skip，绝不猜测。
//
// 这是本检查项最关键的一条约束。风扇状态码的语义因厂商甚至型号而异，MIB
// registry 里只有「风扇状态」这样的中文描述，取值含义无从查证。把未知码猜成
// 异常会造成误报；猜成正常则更糟——故障设备被报成健康，静默失效直到设备真挂。
// 宁可判「没查成」，也不能判错。
func TestFanStatus_UnknownStateSkips(t *testing.T) {
	result := runMetricCheck(t, "fan_status", &devices.SNMPMetrics{
		Components: []devices.ComponentStatusMetrics{component("fan", "1", 77)},
	}, nil)

	if result.Status != "skip" {
		t.Errorf("未知状态码应判 skip 而非猜测，实际 %q（消息：%v）", result.Status, result.Message)
	}
}

// TestFanStatus_TemplateOverridesStateCodes 模板可覆盖状态码映射。
//
// 默认映射基于通用约定，实际部署时应按设备实测校准。没有这个开关，遇到取值
// 不同的型号就只能改代码。
func TestFanStatus_TemplateOverridesStateCodes(t *testing.T) {
	config := map[string]interface{}{
		"normal_states":   []interface{}{2.0},
		"abnormal_states": []interface{}{1.0},
	}
	result := runMetricCheck(t, "fan_status", &devices.SNMPMetrics{
		Components: []devices.ComponentStatusMetrics{component("fan", "1", 2)},
	}, config)

	if result.Status != "pass" {
		t.Errorf("模板声明 2 为正常码时应判 pass，实际 %q（消息：%v）", result.Status, result.Message)
	}
}

// TestFanStatus_NoComponentsSkips 采不到部件数据时判 skip。
// 非华为/H3C 设备没有对应 catalog 条目，属预期。
func TestFanStatus_NoComponentsSkips(t *testing.T) {
	result := runMetricCheck(t, "fan_status", &devices.SNMPMetrics{}, nil)

	if result.Status != "skip" {
		t.Errorf("无部件数据应判 skip，实际 %q", result.Status)
	}
}

// TestPowerStatus_IgnoresFanComponents 电源检查不得把风扇算进去。
// 两者运维含义不同：风扇故障是渐进劣化，电源故障是冗余失效。
func TestPowerStatus_IgnoresFanComponents(t *testing.T) {
	result := runMetricCheck(t, "power_status", &devices.SNMPMetrics{
		Components: []devices.ComponentStatusMetrics{
			component("fan", "1", 2), // 风扇异常
			component("power", "1", 1),
		},
	}, nil)

	if result.Status != "pass" {
		t.Errorf("风扇异常不应影响电源检查，实际 %q（消息：%v）", result.Status, result.Message)
	}
}

// ---------------------------------------------------------------------------
// PoE
// ---------------------------------------------------------------------------

// TestPoE_LowRemainingPowerWarns 剩余保障功率不足时告警。
// 预算耗尽后新接的 AP 与 IP 话机直接不上电，现象诡异难查。
func TestPoE_LowRemainingPowerWarns(t *testing.T) {
	result := runMetricCheck(t, "poe", &devices.SNMPMetrics{
		PoE: devices.PoEMetrics{
			RemainingPower: f64(8),
			RemainingUnit:  "W",
			Ports: []devices.PoEPortMetrics{
				{Index: "1", ConsumingPower: f64(15400)},
			},
		},
	}, map[string]interface{}{
		"threshold": map[string]interface{}{"warning": 30.0, "critical": 10.0},
	})

	if result.Status != "fail" && result.Status != "warning" {
		t.Errorf("剩余功率 8W 低于严重阈值 10W 应告警，实际 %q（消息：%v）", result.Status, result.Message)
	}
}

// TestPoE_PortsOnlyIsDisplayOnly 只有端口功率没有剩余保障功率时仅展示不判定。
//
// 华为的 PoE OID 只上报端口消耗功率，没有系统额定总功率，算不出使用率。
// 此时硬判会是无根据的猜测，因此退化为纯展示——与「带宽吞吐量」项同样的定位。
func TestPoE_PortsOnlyIsDisplayOnly(t *testing.T) {
	result := runMetricCheck(t, "poe", &devices.SNMPMetrics{
		PoE: devices.PoEMetrics{
			Ports: []devices.PoEPortMetrics{
				{Index: "1", ConsumingPower: f64(15400)},
				{Index: "2", ConsumingPower: f64(6900)},
			},
		},
	}, nil)

	if result.Status != "pass" {
		t.Errorf("仅有端口功率时应判 pass（纯展示），实际 %q（消息：%v）", result.Status, result.Message)
	}
	if result.ActualValue == nil {
		t.Error("应给出总消耗功率作为实际值")
	}
}

// TestPoE_NoDataSkips 非 PoE 设备判 skip。
func TestPoE_NoDataSkips(t *testing.T) {
	if result := runMetricCheck(t, "poe", &devices.SNMPMetrics{}, nil); result.Status != "skip" {
		t.Errorf("无 PoE 数据应判 skip，实际 %q", result.Status)
	}
}

// ---------------------------------------------------------------------------
// 光模块
// ---------------------------------------------------------------------------

// TestOpticalPower_LowRxPowerFails 收光功率过低应告警。
// 光衰比错包更早暴露链路劣化，是提前更换光模块的依据。
func TestOpticalPower_LowRxPowerFails(t *testing.T) {
	result := runMetricCheck(t, "optical_power", &devices.SNMPMetrics{
		OpticalTransceivers: []devices.OpticalTransceiverMetrics{
			{Index: "1", RxPower: f64(-35), RxPowerUnit: "dBm", TxPower: f64(-3)},
			{Index: "2", RxPower: f64(-5), RxPowerUnit: "dBm", TxPower: f64(-3)},
		},
	}, nil)

	if result.Status != "fail" && result.Status != "warning" {
		t.Errorf("收光 -35dBm 应告警，实际 %q（消息：%v）", result.Status, result.Message)
	}
}

// TestOpticalPower_NormalRangePasses 光功率在正常区间内通过。
func TestOpticalPower_NormalRangePasses(t *testing.T) {
	result := runMetricCheck(t, "optical_power", &devices.SNMPMetrics{
		OpticalTransceivers: []devices.OpticalTransceiverMetrics{
			{Index: "1", RxPower: f64(-6), RxPowerUnit: "dBm", TxPower: f64(-3)},
		},
	}, nil)

	if result.Status != "pass" {
		t.Errorf("光功率正常应判 pass，实际 %q（消息：%v）", result.Status, result.Message)
	}
}

// TestOpticalPower_NoModulesSkips 无光模块（纯电口设备）判 skip。
func TestOpticalPower_NoModulesSkips(t *testing.T) {
	if result := runMetricCheck(t, "optical_power", &devices.SNMPMetrics{}, nil); result.Status != "skip" {
		t.Errorf("无光模块数据应判 skip，实际 %q", result.Status)
	}
}

// ---------------------------------------------------------------------------
// BGP 邻居
// ---------------------------------------------------------------------------

// TestBGPPeers_NonEstablishedFails 存在非 Established 邻居应判失败。
// 邻居断开直接导致路由黑洞，是路由器最严重的故障之一。
func TestBGPPeers_NonEstablishedFails(t *testing.T) {
	established, idle := 6, 1
	result := runMetricCheck(t, "bgp_peers", &devices.SNMPMetrics{
		BGPPeers: []devices.BGPNeighborMetrics{
			{Index: "10.0.0.1", State: &established, StateLabel: "established"},
			{Index: "10.0.0.2", State: &idle, StateLabel: "idle"},
		},
	}, nil)

	if result.Status != "fail" {
		t.Errorf("存在非 Established 邻居应判 fail，实际 %q（消息：%v）", result.Status, result.Message)
	}
}

// TestBGPPeers_ShortEstablishedTimeWarns 建立时间过短说明会话在反复重建。
// 比单纯断开更隐蔽：巡检时刚好是 Established，但会话其实一直在震荡。
func TestBGPPeers_ShortEstablishedTimeWarns(t *testing.T) {
	established := 6
	shortTime := int64(120)
	result := runMetricCheck(t, "bgp_peers", &devices.SNMPMetrics{
		BGPPeers: []devices.BGPNeighborMetrics{
			{Index: "10.0.0.1", State: &established, StateLabel: "established", EstablishedTime: &shortTime},
		},
	}, nil)

	if result.Status != "warning" {
		t.Errorf("建立时间仅 120 秒应判 warning（近期震荡），实际 %q（消息：%v）", result.Status, result.Message)
	}
}

// TestBGPPeers_AllEstablishedPasses 全部邻居稳定建立时通过。
func TestBGPPeers_AllEstablishedPasses(t *testing.T) {
	established := 6
	longTime := int64(864000)
	result := runMetricCheck(t, "bgp_peers", &devices.SNMPMetrics{
		BGPPeers: []devices.BGPNeighborMetrics{
			{Index: "10.0.0.1", State: &established, StateLabel: "established", EstablishedTime: &longTime},
		},
	}, nil)

	if result.Status != "pass" {
		t.Errorf("邻居全部稳定建立应判 pass，实际 %q（消息：%v）", result.Status, result.Message)
	}
}

// TestBGPPeers_NoPeersSkips 未配置 BGP 的设备判 skip。
//
// 注意与「不适用」的区别：交换机根本不跑 BGP，那由 device_types 过滤成
// not_applicable；这里是路由器但没配邻居，属于该查而查不到内容。
func TestBGPPeers_NoPeersSkips(t *testing.T) {
	if result := runMetricCheck(t, "bgp_peers", &devices.SNMPMetrics{}, nil); result.Status != "skip" {
		t.Errorf("无 BGP 邻居数据应判 skip，实际 %q", result.Status)
	}
}

// ---------------------------------------------------------------------------
// 固件版本
// ---------------------------------------------------------------------------

// TestFirmwareVersion_AlwaysPassesWhenCollected 固件版本仅采集展示，不做判定。
// 作用是让报告自带版本清单，便于事后与安全公告、厂商推荐版本比对。
func TestFirmwareVersion_AlwaysPassesWhenCollected(t *testing.T) {
	model := "S5700-28C-HI"
	version := "V200R019C00SPC500"
	result := runMetricCheck(t, "firmware_version", &devices.SNMPMetrics{
		Model: &model, FirmwareVersion: &version,
	}, nil)

	if result.Status != "pass" {
		t.Errorf("采集到版本应判 pass（仅展示不判定），实际 %q", result.Status)
	}
	if result.ActualValue == nil {
		t.Fatal("应把型号与版本写入实际值")
	}
}

// TestFirmwareVersion_NotCollectedSkips 采不到版本时判 skip 而非 fail。
func TestFirmwareVersion_NotCollectedSkips(t *testing.T) {
	if result := runMetricCheck(t, "firmware_version", &devices.SNMPMetrics{}, nil); result.Status != "skip" {
		t.Errorf("未采集到版本应判 skip，实际 %q", result.Status)
	}
}
