package handlers_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
)

func strPtr(s string) *string { return &s }

func TestBoardStatus_FaultLightsAndCompatibility(t *testing.T) {
	red := runMetricCheck(t, "board_status", &devices.SNMPMetrics{
		Components: []devices.ComponentStatusMetrics{
			{Index: "0/1", Name: "MPU Board 1", Kind: "board", State: i64(1), StatusLevel: "critical", StatusLabel: "故障灯告警"},
		},
	}, nil)
	if red.Status != "fail" {
		t.Fatalf("红灯告警应判 fail，实际 %q", red.Status)
	}
	payload := decodeDetails(t, red)
	rows := detailRows(t, payload, "components")
	if rowString(t, rows[0], "name") != "MPU Board 1" || rowString(t, rows[0], "status_label") != "故障灯告警" {
		t.Errorf("board 明细缺少 name/status_label: %v", rows[0])
	}

	yellow := runMetricCheck(t, "board_status", &devices.SNMPMetrics{
		Components: []devices.ComponentStatusMetrics{
			{Index: "0/2", Name: "LPU Board 2", Kind: "board", State: i64(1), StatusLevel: "warning", StatusLabel: "黄灯告警"},
		},
	}, nil)
	if yellow.Status != "warning" {
		t.Errorf("黄灯告警应判 warning，实际 %q", yellow.Status)
	}

	if res := runMetricCheck(t, "board_status", &devices.SNMPMetrics{Components: []devices.ComponentStatusMetrics{component("fan", "1", 1)}}, nil); res.Status != "skip" {
		t.Errorf("无 board 数据应判 skip，实际 %q", res.Status)
	}
}

func TestPowerStatus_DualRedundancyDegradedWarns(t *testing.T) {
	degraded := runMetricCheck(t, "power_status", &devices.SNMPMetrics{
		Components: []devices.ComponentStatusMetrics{
			{Index: "1", Name: "PWR1", Kind: "power", State: i64(1), StatusLevel: "normal", StatusLabel: "正常"},
			{Index: "2", Name: "PWR2", Kind: "power", State: i64(3), StatusLevel: "warning", StatusLabel: "备用/休眠"},
		},
	}, nil)
	if degraded.Status != "warning" {
		t.Fatalf("双电源冗余降级应判 warning，实际 %q（消息：%v）", degraded.Status, degraded.Message)
	}

	allUnknown := runMetricCheck(t, "power_status", &devices.SNMPMetrics{
		Components: []devices.ComponentStatusMetrics{component("power", "1", 77), component("power", "2", 77)},
	}, nil)
	if allUnknown.Status != "skip" {
		t.Errorf("双电源均为未知状态码应判 skip，实际 %q", allUnknown.Status)
	}
}

func TestStackStatus_AllCases(t *testing.T) {
	if res := runMetricCheck(t, "stack_status", &devices.SNMPMetrics{}, nil); res.Status != "skip" {
		t.Fatalf("空堆叠数据应判 skip，实际 %q", res.Status)
	}

	standalone := runMetricCheck(t, "stack_status", &devices.SNMPMetrics{
		Stack: devices.StackMetrics{IsStackDevice: boolPtr(false), Members: []devices.StackMemberMetrics{{Index: "1", RoleLabel: "master"}}},
	}, nil)
	if standalone.Status != "pass" || !decodeDetails(t, standalone)["standalone"].(bool) {
		t.Errorf("单机模式应判 pass 且 standalone=true，实际 %q", standalone.Status)
	}

	ringOK := runMetricCheck(t, "stack_status", &devices.SNMPMetrics{
		Stack: devices.StackMetrics{
			Enabled: boolPtr(true), TopoType: i64(2), TopoTypeLabel: "ring",
			Members: []devices.StackMemberMetrics{
				{Index: "1", MemberID: i64(1), RoleLabel: "master", Priority: i64(200), MAC: "00:11:22:33:44:55"},
				{Index: "2", MemberID: i64(2), RoleLabel: "standby", Priority: i64(150), MAC: "00:11:22:33:44:66"},
			},
			Ports: []devices.StackPortMetrics{{Index: "1", Name: "stack-port1/1", Status: i64(1), StatusLabel: "up"}},
		},
	}, nil)
	if ringOK.Status != "pass" {
		t.Errorf("环形堆叠+主备完整+端口UP 应判 pass，实际 %q", ringOK.Status)
	}
	ringPayload := decodeDetails(t, ringOK)
	if ringPayload["topology"] != "ring" || ringPayload["member_count"] != float64(2) || ringPayload["port_up_count"] != float64(1) {
		t.Errorf("stack_status details 字段异常: %v", ringPayload)
	}

	chainWarn := runMetricCheck(t, "stack_status", &devices.SNMPMetrics{
		Stack: devices.StackMetrics{
			Enabled: boolPtr(true), TopoType: i64(1), TopoTypeLabel: "chain",
			Members: []devices.StackMemberMetrics{{Index: "1", RoleLabel: "master"}, {Index: "2", RoleLabel: "standby"}},
			Ports:   []devices.StackPortMetrics{{Index: "1", Name: "stack-port1/1", Status: i64(1), StatusLabel: "up"}},
		},
	}, nil)
	if chainWarn.Status != "warning" {
		t.Errorf("链形拓扑应判 warning，实际 %q", chainWarn.Status)
	}

	h3cDown := runMetricCheck(t, "stack_status", &devices.SNMPMetrics{
		Stack: devices.StackMetrics{
			Enabled: boolPtr(true), TopoType: i64(2),
			Members: []devices.StackMemberMetrics{{Index: "1", RoleLabel: "master"}, {Index: "2", RoleLabel: "standby"}},
			Ports:   []devices.StackPortMetrics{{Index: "1", Name: "IRF-Port1/1", Status: i64(4), StatusLabel: "down"}},
		},
	}, nil)
	if h3cDown.Status != "fail" {
		t.Errorf("H3C IRF 端口 status=4 应判 fail，实际 %q", h3cDown.Status)
	}
}

func TestConfigSaveStatus_AllCases(t *testing.T) {
	if res := runMetricCheck(t, "config_save_status", &devices.SNMPMetrics{}, nil); res.Status != "skip" {
		t.Fatalf("无时间戳应判 skip，实际 %q", res.Status)
	}
	unsaved := runMetricCheck(t, "config_save_status", &devices.SNMPMetrics{
		ConfigSave: devices.ConfigSaveMetrics{RunModifiedLast: i64(500), RunSavedLast: i64(100)},
	}, nil)
	if unsaved.Status != "warning" || !decodeDetails(t, unsaved)["unsaved"].(bool) {
		t.Errorf("存在未保存变更应判 warning，实际 %q", unsaved.Status)
	}
	neverSaved := runMetricCheck(t, "config_save_status", &devices.SNMPMetrics{
		ConfigSave: devices.ConfigSaveMetrics{RunModifiedLast: i64(60), RunSavedLast: i64(0), StartModifiedLast: i64(0)},
	}, nil)
	if neverSaved.Status != "warning" {
		t.Errorf("从未保存变更应判 warning，实际 %q", neverSaved.Status)
	}
	jitterOK := runMetricCheck(t, "config_save_status", &devices.SNMPMetrics{
		ConfigSave: devices.ConfigSaveMetrics{RunModifiedLast: i64(103), RunSavedLast: i64(100)},
	}, nil)
	if jitterOK.Status != "pass" || decodeDetails(t, jitterOK)["unsaved"].(bool) {
		t.Errorf("5秒内抖动应判 pass，实际 %q", jitterOK.Status)
	}
}

func TestVLANStatus_AllCases(t *testing.T) {
	if res := runMetricCheck(t, "vlan_status", &devices.SNMPMetrics{}, nil); res.Status != "skip" {
		t.Fatalf("无 VLAN 数据应判 skip，实际 %q", res.Status)
	}
	countsOnly := runMetricCheck(t, "vlan_status", &devices.SNMPMetrics{
		VLAN: devices.VLANMetrics{NumVlans: i64(32), FdbDynamicCount: i64(1024)},
	}, nil)
	if countsOnly.Status != "pass" {
		t.Errorf("仅计数无上限应判 pass，实际 %q", countsOnly.Status)
	}
	warn := runMetricCheck(t, "vlan_status", &devices.SNMPMetrics{
		VLAN: devices.VLANMetrics{NumVlans: i64(85), MaxSupportedVlans: i64(100), GvrpStatus: i64(1)},
	}, nil)
	if warn.Status != "warning" {
		t.Errorf("85%% 使用率应判 warning，实际 %q", warn.Status)
	}
	fail := runMetricCheck(t, "vlan_status", &devices.SNMPMetrics{
		VLAN: devices.VLANMetrics{NumVlans: i64(96), MaxSupportedVlans: i64(100)},
	}, nil)
	if fail.Status != "fail" {
		t.Errorf("96%% 使用率应判 fail，实际 %q", fail.Status)
	}
	p := decodeDetails(t, fail)
	if p["kind"] != "vlan_status" || p["threshold"] == nil {
		t.Errorf("vlan_status details 缺少必要字段: %v", p)
	}
}

func TestFlashUsage_AllCases(t *testing.T) {
	if res := runMetricCheck(t, "flash_usage", &devices.SNMPMetrics{}, nil); res.Status != "skip" {
		t.Fatalf("无 Flash 数据应判 skip，实际 %q", res.Status)
	}
	res := runMetricCheck(t, "flash_usage", &devices.SNMPMetrics{
		FlashPartitions: []devices.FlashPartitionMetrics{
			{Index: "1", Name: "flash:/", TotalBytes: i64(1000), FreeBytes: i64(50)},
			{Index: "2", Name: "slave#flash:/", TotalBytes: i64(1000), FreeBytes: i64(150)},
			{Index: "3", Name: "bad:/", TotalBytes: i64(0), FreeBytes: i64(0)},
		},
	}, nil)
	if res.Status != "fail" {
		t.Fatalf("95%% 分区应判 fail，实际 %q", res.Status)
	}
	payload := decodeDetails(t, res)
	if payload["kind"] != "flash_usage" || payload["evaluated"] != float64(2) {
		t.Errorf("flash_usage details 异常: %v", payload)
	}
	parts := detailRows(t, payload, "partitions")
	if rowString(t, parts[0], "name") != "flash:/" || rowString(t, parts[0], "verdict") != "fail" {
		t.Errorf("partitions 首行应为最坏分区 flash:/，实际 %v", parts[0])
	}
	if len(detailRows(t, payload, "skipped")) != 1 {
		t.Errorf("容量为 0 的分区应计入 skipped")
	}
}

func TestOpticalPower_OverloadAndHighTemp(t *testing.T) {
	res := runMetricCheck(t, "optical_power", &devices.SNMPMetrics{
		OpticalTransceivers: []devices.OpticalTransceiverMetrics{
			{Index: "10", Name: "XGigabitEthernet0/0/1", VendorSN: "SN12345", RxPower: f64(6.0), RxPowerUnit: "dBm", Temperature: f64(88.0), TemperatureUnit: "C"},
			{Index: "11", Name: "XGigabitEthernet0/0/2", RxPower: f64(-5.0), RxPowerUnit: "dBm", Temperature: f64(76.0), TemperatureUnit: "C"},
		},
	}, nil)
	if res.Status != "fail" {
		t.Fatalf("过载+高温应判 fail，实际 %q", res.Status)
	}
	rows := detailRows(t, decodeDetails(t, res), "modules")
	if rowString(t, rows[0], "name") != "XGigabitEthernet0/0/1" || rowString(t, rows[0], "vendor_sn") != "SN12345" || rowNumber(t, rows[0], "temperature") != 88.0 {
		t.Errorf("光模块扩展字段异常: %v", rows[0])
	}
	if rowString(t, rows[1], "verdict") != "warning" {
		t.Errorf("76°C 应判 warning，实际 %v", rows[1])
	}
}

func TestInterfaceEnhancements_DetailsAliasNUcastPoEAndSTP(t *testing.T) {
	broken := healthyPort("GE0/0/1")
	broken.PortDescription = strPtr("Uplink-Core")
	broken.IsUp = boolPtr(false)
	adminRes := runMetricCheck(t, "interface_admin_status", &devices.SNMPMetrics{Interfaces: []devices.InterfaceMetrics{broken}}, nil)
	adminPayload := decodeDetails(t, adminRes)
	if adminPayload["kind"] != "interface_status_detail" || adminPayload["sub_kind"] != "admin_status" {
		t.Errorf("admin_status details 异常: %v", adminPayload)
	}
	if rowString(t, detailRows(t, adminPayload, "entries")[0], "alias") != "Uplink-Core" {
		t.Errorf("admin_status entry 缺少 alias")
	}

	half := healthyPort("GE0/0/2")
	half.DuplexStatus = intPtr(2)
	half.PortDescription = strPtr("Access-Printer")
	duplexRes := runMetricCheck(t, "interface_duplex", &devices.SNMPMetrics{Interfaces: []devices.InterfaceMetrics{half}}, nil)
	duplexPayload := decodeDetails(t, duplexRes)
	if duplexPayload["sub_kind"] != "duplex" || rowString(t, detailRows(t, duplexPayload, "entries")[0], "duplex_label") == "" {
		t.Errorf("duplex details 异常: %v", duplexPayload)
	}

	// 错包率计入 NUcastPkts：100 / (100 + 999900 + 1000000) = 0.005% < 0.01% => pass
	errPort := healthyPort("GE0/0/3")
	errPort.PortDescription = strPtr("Trunk-A")
	errPort.InErrors = u64(100)
	errPort.InUcastPkts = u64(999900)
	errPort.InNUcastPkts = u64(1000000)
	errRes := runMetricCheck(t, "interface_errors", &devices.SNMPMetrics{Interfaces: []devices.InterfaceMetrics{errPort}}, nil)
	if errRes.Status != "pass" {
		t.Errorf("计入 NUcastPkts 后错包率应为 0.005%% 并判 pass，实际 %q", errRes.Status)
	}
	if rowString(t, detailRows(t, decodeDetails(t, errRes), "interfaces")[0], "alias") != "Trunk-A" {
		t.Errorf("interface_errors 应输出 alias")
	}

	poeRes := runMetricCheck(t, "poe", &devices.SNMPMetrics{
		PoE: devices.PoEMetrics{Ports: []devices.PoEPortMetrics{{Index: "1", Name: "GE0/0/10", ConsumingPower: f64(15.4), Unit: "W"}}},
	}, nil)
	if poeRes.Message == nil || !strings.Contains(*poeRes.Message, "GE0/0/10") {
		t.Errorf("PoE 消息应优先展示端口 Name，实际 %v", poeRes.Message)
	}

	stpRes := runMetricCheck(t, "stp_status", &devices.SNMPMetrics{
		STP: devices.STPMetrics{
			TimeSinceTopologyChange: i64(90060), TopChanges: i64(2),
			DesignatedRoot: "32768/00:11:22:33:44:55", RootCost: i64(20000), RootPort: i64(1), BpduGuard: i64(1),
		},
	}, thresholdConfig(3600, 300, "s"))
	if stpRes.ActualValue == nil || !strings.Contains(*stpRes.ActualValue, "1天1小时1分钟") {
		t.Errorf("STP ActualValue 应含可读时长 1天1小时1分钟，实际 %v", stpRes.ActualValue)
	}
	var stpMap map[string]interface{}
	if err := json.Unmarshal(stpRes.Details, &stpMap); err != nil {
		t.Fatalf("STP details JSON 解析失败: %v", err)
	}
	if stpMap["kind"] != "stp_status" || stpMap["designated_root"] != "32768/00:11:22:33:44:55" || stpMap["threshold"] == nil {
		t.Errorf("STP details 缺少字段或未合并 threshold: %v", stpMap)
	}
}

func TestSecurityAuditRegressions_ZeroThresholdAndTimeTicksRollover(t *testing.T) {
	// 1. 合法 0 阈值不被默认值覆盖反转（optical_power: warning=0, critical=-5）
	optRes := runMetricCheck(t, "optical_power", &devices.SNMPMetrics{
		OpticalTransceivers: []devices.OpticalTransceiverMetrics{
			{Index: "1", RxPower: f64(-3.0), RxPowerUnit: "dBm"},
		},
	}, thresholdConfig(0, -5, "dBm"))
	if optRes.Status != "warning" {
		t.Errorf("optical_power(0/-5) 对 -3.0dBm 应判 warning，实际 %q（%v）", optRes.Status, optRes.Message)
	}

	// poe: warning=5, critical=0 时 0W 才 fail，3W 应判 warning 而非因 critical 被覆写为 10 误判 fail
	poeRes := runMetricCheck(t, "poe", &devices.SNMPMetrics{
		PoE: devices.PoEMetrics{RemainingPower: f64(3.0), RemainingUnit: "W"},
	}, thresholdConfig(5, 0, "W"))
	if poeRes.Status != "warning" {
		t.Errorf("poe(5/0) 对 3.0W 应判 warning，实际 %q（%v）", poeRes.Status, poeRes.Message)
	}

	// 2. TimeTicks 32 位回绕：saved 在回绕前 (4294967000)，mod 在回绕后 (1000) -> 未保存变更判 warning
	cfgWrapUnsaved := runMetricCheck(t, "config_save_status", &devices.SNMPMetrics{
		ConfigSave: devices.ConfigSaveMetrics{
			RunModifiedLast:  i64(10),
			RunSavedLast:     i64(42949670),
			RunModifiedTicks: i64(1000),
			RunSavedTicks:    i64(4294967000),
		},
	}, nil)
	if cfgWrapUnsaved.Status != "warning" {
		t.Errorf("TimeTicks 回绕后修改应判 warning，实际 %q", cfgWrapUnsaved.Status)
	}

	// saved 在回绕后 (1000)，mod 在回绕前 (4294967000) -> 已保存判 pass
	cfgWrapSaved := runMetricCheck(t, "config_save_status", &devices.SNMPMetrics{
		ConfigSave: devices.ConfigSaveMetrics{
			RunModifiedLast:  i64(42949670),
			RunSavedLast:     i64(10),
			RunModifiedTicks: i64(4294967000),
			RunSavedTicks:    i64(1000),
		},
	}, nil)
	if cfgWrapSaved.Status != "pass" {
		t.Errorf("TimeTicks 回绕后保存应判 pass，实际 %q", cfgWrapSaved.Status)
	}
}
