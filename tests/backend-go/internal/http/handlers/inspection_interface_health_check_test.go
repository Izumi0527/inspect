package handlers_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	handlers "github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

func u64(v uint64) *uint64 { return &v }
func boolPtr(v bool) *bool { return &v }
func intPtr(v int) *int    { return &v }
func i64(v int64) *int64   { return &v }

// healthyPort 是一个干净的千兆全双工口：无错包、无丢弃、admin/oper 均 up。
func healthyPort(name string) devices.InterfaceMetrics {
	return devices.InterfaceMetrics{
		Name: name, Description: name,
		Speed: i64(1000), IsUp: boolPtr(true), AdminUp: boolPtr(true),
		InErrors: u64(0), OutErrors: u64(0),
		InDiscards: u64(0), OutDiscards: u64(0),
		InUcastPkts: u64(1000000), OutUcastPkts: u64(1000000),
		DuplexStatus: intPtr(3),
	}
}

func runMetricCheck(t *testing.T, metric string, metrics *devices.SNMPMetrics, config map[string]interface{}) *inspection.Result {
	t.Helper()
	var h handlers.InspectionHandler
	result := &inspection.Result{}
	item := map[string]interface{}{"name": metric, "type": "snmp", "metric": metric}
	if config != nil {
		item["config"] = config
	}
	executeSNMPCheck(h, result, snmpReachableProbe(), metrics, item)
	return result
}

func thresholdConfig(warning, critical float64, unit string) map[string]interface{} {
	return map[string]interface{}{
		"unit":      unit,
		"threshold": map[string]interface{}{"warning": warning, "critical": critical},
	}
}

// ---------------------------------------------------------------------------
// 接口错包率
// ---------------------------------------------------------------------------

// TestInterfaceErrors_HighRatioFails 错包率超过严重阈值应判失败。
//
// 错包是物理层劣化的直接证据——光衰、跳线老化、接头氧化、电磁干扰。这类问题
// 会持续恶化，发现越早处理成本越低。
func TestInterfaceErrors_HighRatioFails(t *testing.T) {
	bad := healthyPort("GigabitEthernet0/0/1")
	// 1200 错包 / (1200 + 98800) = 1.2%，远超默认严重阈值
	bad.InErrors = u64(1200)
	bad.InUcastPkts = u64(98800)

	result := runMetricCheck(t, "interface_errors", &devices.SNMPMetrics{
		Interfaces: []devices.InterfaceMetrics{bad, healthyPort("GigabitEthernet0/0/2")},
	}, nil)

	if result.Status != "fail" {
		t.Errorf("错包率 1.2%% 应判 fail，实际 %q（消息：%v）", result.Status, result.Message)
	}
	if result.ActualValue == nil || !strings.Contains(*result.ActualValue, "GigabitEthernet0/0/1") {
		t.Errorf("实际值应点名问题接口，实际 %v", result.ActualValue)
	}
	if result.ExpectedValue == nil {
		t.Error("必须写入参考标准")
	}
}

// TestInterfaceErrors_CleanPortsPass 全部接口干净时判通过。
func TestInterfaceErrors_CleanPortsPass(t *testing.T) {
	result := runMetricCheck(t, "interface_errors", &devices.SNMPMetrics{
		Interfaces: []devices.InterfaceMetrics{healthyPort("GE0/0/1"), healthyPort("GE0/0/2")},
	}, nil)

	if result.Status != "pass" {
		t.Errorf("无错包应判 pass，实际 %q（消息：%v）", result.Status, result.Message)
	}
}

// TestInterfaceErrors_NoCounterSkips 采集不到错包计数时判 skip 而非 pass。
//
// 假通过是最危险的结果：设备可能正在大量丢包，报告却显示一切正常。老设备或
// 精简 agent 不上报这些 OID 属常见情况，必须显式暴露为「没查成」。
func TestInterfaceErrors_NoCounterSkips(t *testing.T) {
	noCounter := healthyPort("GE0/0/1")
	noCounter.InErrors = nil
	noCounter.OutErrors = nil

	result := runMetricCheck(t, "interface_errors", &devices.SNMPMetrics{
		Interfaces: []devices.InterfaceMetrics{noCounter},
	}, nil)

	if result.Status != "skip" {
		t.Errorf("无错包计数应判 skip，实际 %q", result.Status)
	}
}

// TestInterfaceErrors_RespectsTemplateThreshold 模板阈值必须生效。
func TestInterfaceErrors_RespectsTemplateThreshold(t *testing.T) {
	port := healthyPort("GE0/0/1")
	// 50 / (50 + 999950) = 0.005%
	port.InErrors = u64(50)
	port.InUcastPkts = u64(999950)

	loose := runMetricCheck(t, "interface_errors", &devices.SNMPMetrics{
		Interfaces: []devices.InterfaceMetrics{port},
	}, thresholdConfig(1, 5, "%"))
	if loose.Status != "pass" {
		t.Errorf("阈值 1/5%% 下 0.005%% 应通过，实际 %q", loose.Status)
	}

	strict := runMetricCheck(t, "interface_errors", &devices.SNMPMetrics{
		Interfaces: []devices.InterfaceMetrics{port},
	}, thresholdConfig(0.001, 0.002, "%"))
	if strict.Status != "fail" {
		t.Errorf("阈值 0.001/0.002%% 下 0.005%% 应判失败，实际 %q", strict.Status)
	}
}

// TestInterfaceErrors_WritesDetails 逐接口明细必须落 details，供报告出表。
func TestInterfaceErrors_WritesDetails(t *testing.T) {
	bad := healthyPort("GE0/0/1")
	bad.InErrors = u64(1200)
	bad.InUcastPkts = u64(98800)

	result := runMetricCheck(t, "interface_errors", &devices.SNMPMetrics{
		Interfaces: []devices.InterfaceMetrics{bad},
	}, nil)

	if len(result.Details) == 0 {
		t.Fatal("未写入 details，报告无法渲染逐接口明细")
	}
	var payload struct {
		Kind       string `json:"kind"`
		Total      int    `json:"total"`
		Evaluated  int    `json:"evaluated"`
		Interfaces []struct {
			Name    string  `json:"name"`
			Percent float64 `json:"percent"`
		} `json:"interfaces"`
	}
	if err := json.Unmarshal(result.Details, &payload); err != nil {
		t.Fatalf("details 解析失败: %v，内容 = %s", err, string(result.Details))
	}
	if payload.Kind != "interface_errors" {
		t.Errorf("details kind = %q，want interface_errors", payload.Kind)
	}
	if len(payload.Interfaces) == 0 {
		t.Error("details 应含逐接口清单")
	}
}

// ---------------------------------------------------------------------------
// 接口丢弃率
// ---------------------------------------------------------------------------

// TestInterfaceDiscards_SeparateFromErrors 丢弃与错包是两类问题，判定必须独立。
//
// 错包指向物理层故障，丢弃指向拥塞或 ACL/QoS 配置。一个口错包为零但大量丢弃，
// 说明线路是好的、是队列或策略在丢——若两者合并成一个指标，运维会误判为线路故障
// 而去换光模块，实际该做的是查 QoS 配置。
func TestInterfaceDiscards_SeparateFromErrors(t *testing.T) {
	congested := healthyPort("GE0/0/1")
	congested.InDiscards = u64(50000) // 5% 丢弃
	congested.InUcastPkts = u64(950000)

	discards := runMetricCheck(t, "interface_discards", &devices.SNMPMetrics{
		Interfaces: []devices.InterfaceMetrics{congested},
	}, nil)
	if discards.Status == "pass" {
		t.Errorf("5%% 丢弃率不应判通过，实际 %q", discards.Status)
	}

	errorsCheck := runMetricCheck(t, "interface_errors", &devices.SNMPMetrics{
		Interfaces: []devices.InterfaceMetrics{congested},
	}, nil)
	if errorsCheck.Status != "pass" {
		t.Errorf("该口错包为零，错包检查应判通过，实际 %q——丢弃不应污染错包判定", errorsCheck.Status)
	}
}

// ---------------------------------------------------------------------------
// 接口管理状态一致性
// ---------------------------------------------------------------------------

// TestInterfaceAdminStatus_AdminUpOperDownFails admin up 但 oper down 是真故障。
func TestInterfaceAdminStatus_AdminUpOperDownFails(t *testing.T) {
	broken := healthyPort("GE0/0/1")
	broken.AdminUp = boolPtr(true)
	broken.IsUp = boolPtr(false)

	result := runMetricCheck(t, "interface_admin_status", &devices.SNMPMetrics{
		Interfaces: []devices.InterfaceMetrics{broken, healthyPort("GE0/0/2")},
	}, nil)

	if result.Status != "fail" {
		t.Errorf("admin up 但 oper down 应判 fail，实际 %q（消息：%v）", result.Status, result.Message)
	}
}

// TestInterfaceAdminStatus_AdminDownIsNormal 人为关闭的端口不是故障。
//
// 这正是本检查项存在的意义：现有「接口状态」只看 oper，把运维主动 shutdown 的
// 端口也报成警告，久而久之运维就学会了忽略这类告警——真故障也一起被忽略。
func TestInterfaceAdminStatus_AdminDownIsNormal(t *testing.T) {
	shutdown := healthyPort("GE0/0/24")
	shutdown.AdminUp = boolPtr(false)
	shutdown.IsUp = boolPtr(false)

	result := runMetricCheck(t, "interface_admin_status", &devices.SNMPMetrics{
		Interfaces: []devices.InterfaceMetrics{shutdown, healthyPort("GE0/0/1")},
	}, nil)

	if result.Status != "pass" {
		t.Errorf("人为 shutdown 的端口不应判异常，实际 %q（消息：%v）", result.Status, result.Message)
	}
}

// TestInterfaceAdminStatus_NoDataSkips 采不到 ifAdminStatus 时判 skip。
func TestInterfaceAdminStatus_NoDataSkips(t *testing.T) {
	noAdmin := healthyPort("GE0/0/1")
	noAdmin.AdminUp = nil

	result := runMetricCheck(t, "interface_admin_status", &devices.SNMPMetrics{
		Interfaces: []devices.InterfaceMetrics{noAdmin},
	}, nil)

	if result.Status != "skip" {
		t.Errorf("无 admin 状态数据应判 skip，实际 %q", result.Status)
	}
}

// ---------------------------------------------------------------------------
// 接口双工模式
// ---------------------------------------------------------------------------

// TestInterfaceDuplex_HalfDuplexOnGigabitWarns 千兆口协商成半双工是经典故障。
//
// 它会同时引发大量错包与性能腰斩。与错包检查互补：错包说「有问题」，
// 双工说「为什么」——运维看到这两项一起告警就知道该去核对两端速率双工配置。
func TestInterfaceDuplex_HalfDuplexOnGigabitWarns(t *testing.T) {
	half := healthyPort("GE0/0/1")
	half.DuplexStatus = intPtr(2)

	result := runMetricCheck(t, "interface_duplex", &devices.SNMPMetrics{
		Interfaces: []devices.InterfaceMetrics{half, healthyPort("GE0/0/2")},
	}, nil)

	if result.Status != "warning" && result.Status != "fail" {
		t.Errorf("千兆口半双工应告警，实际 %q（消息：%v）", result.Status, result.Message)
	}
}

// TestInterfaceDuplex_FullDuplexPasses 全双工正常。
func TestInterfaceDuplex_FullDuplexPasses(t *testing.T) {
	result := runMetricCheck(t, "interface_duplex", &devices.SNMPMetrics{
		Interfaces: []devices.InterfaceMetrics{healthyPort("GE0/0/1")},
	}, nil)

	if result.Status != "pass" {
		t.Errorf("全双工应判通过，实际 %q", result.Status)
	}
}

// TestInterfaceDuplex_DownPortIgnored 未 UP 的端口不参与双工判定——
// 没链路时双工状态无意义，纳入只会产生噪声。
func TestInterfaceDuplex_DownPortIgnored(t *testing.T) {
	down := healthyPort("GE0/0/24")
	down.IsUp = boolPtr(false)
	down.DuplexStatus = intPtr(2)

	result := runMetricCheck(t, "interface_duplex", &devices.SNMPMetrics{
		Interfaces: []devices.InterfaceMetrics{down, healthyPort("GE0/0/1")},
	}, nil)

	if result.Status != "pass" {
		t.Errorf("已 down 的端口不应参与双工判定，实际 %q（消息：%v）", result.Status, result.Message)
	}
}
