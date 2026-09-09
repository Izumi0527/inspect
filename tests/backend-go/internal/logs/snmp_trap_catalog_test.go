package logs_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/gosnmp/gosnmp"

	"github.com/your-org/inspect-system/backend-go/internal/logs"
)

// Trap 解析接入华为告警知识库的契约测试。
//
// 用 gosnmp 真实编解码构造报文：解码后的 varbind Name 与 OID 型 Value 都带前导点
// （".1.3.6…"），这是此前 extractTrapOID 永远取不到 snmpTrapOID、覆盖表查不到、
// 华为 Trap 一律落 info 级别的根因，这里必须走真实解码路径而非手写不带点的 PDU。

const (
	oidSysUpTime      = "1.3.6.1.2.1.1.3.0"
	oidSnmpTrapOID    = "1.3.6.1.6.3.1.1.4.1.0"
	oidHwBoardFail    = "1.3.6.1.4.1.2011.5.25.219.2.2.3"
	oidHwBoardResume  = "1.3.6.1.4.1.2011.5.25.219.2.2.4"
	oidColdStart      = "1.3.6.1.6.3.1.1.5.1"
	oidEntPhysName    = "1.3.6.1.2.1.47.1.1.1.1.7.67108873"
	oidBaseTrapSev    = "1.3.6.1.4.1.2011.5.25.129.1.1.0"
	oidEntityReason   = "1.3.6.1.4.1.2011.5.25.219.1.13.0"
	oidUnknownPrivate = "1.3.6.1.4.1.99999.1.2.3.4"
)

// decodeTrap 用 gosnmp 编码再解码一个 v2c Trap，模拟监听器 OnNewTrap 收到的真实报文。
func decodeTrap(t *testing.T, trapOID string, vars ...gosnmp.SnmpPDU) *gosnmp.SnmpPacket {
	t.Helper()
	variables := []gosnmp.SnmpPDU{
		{Name: oidSysUpTime, Type: gosnmp.TimeTicks, Value: uint32(123456)},
		{Name: oidSnmpTrapOID, Type: gosnmp.ObjectIdentifier, Value: trapOID},
	}
	variables = append(variables, vars...)
	packet := &gosnmp.SnmpPacket{
		Version:   gosnmp.Version2c,
		Community: "public",
		PDUType:   gosnmp.SNMPv2Trap,
		Variables: variables,
	}
	raw, err := packet.MarshalMsg()
	if err != nil {
		t.Fatalf("MarshalMsg: %v", err)
	}
	client := &gosnmp.GoSNMP{Version: gosnmp.Version2c, Community: "public", Logger: gosnmp.NewLogger(nil)}
	decoded, err := client.SnmpDecodePacket(raw)
	if err != nil {
		t.Fatalf("SnmpDecodePacket: %v", err)
	}
	return decoded
}

func TestBuildTrapLog_ShouldResolveTrapOIDDespiteLeadingDot(t *testing.T) {
	packet := decodeTrap(t, oidHwBoardFail,
		gosnmp.SnmpPDU{Name: oidEntPhysName, Type: gosnmp.OctetString, Value: []byte("MPU Board 0")},
	)

	result := logs.BuildTrapLogForTest(packet, "192.168.20.1")

	if result.TrapOID != oidHwBoardFail {
		t.Fatalf("TrapOID=%q, want %q（应剥掉 gosnmp 的前导点）", result.TrapOID, oidHwBoardFail)
	}
	if !strings.HasPrefix(result.Message, "SNMP Trap "+oidHwBoardFail+" | ") {
		t.Fatalf("消息应保持 `SNMP Trap <oid> | 摘要` 形态: %q", result.Message)
	}
	// 摘要里 sysUpTime / snmpTrapOID 属于报文骨架，不是告警内容
	if strings.Contains(result.Message, oidSysUpTime) || strings.Contains(result.Message, oidSnmpTrapOID) {
		t.Fatalf("摘要不应包含报文骨架变量: %q", result.Message)
	}
	// 变量 OID 应解析为「名称.实例=值」
	if !strings.Contains(result.Message, "entPhysicalName.67108873=MPU Board 0") {
		t.Fatalf("摘要应把绑定变量 OID 解析为名称: %q", result.Message)
	}

	var raw map[string]interface{}
	if err := json.Unmarshal([]byte(result.Raw), &raw); err != nil {
		t.Fatalf("raw 应为 JSON: %v", err)
	}
	if raw["trap_oid"] != oidHwBoardFail {
		t.Fatalf("raw.trap_oid=%v, want %q", raw["trap_oid"], oidHwBoardFail)
	}
}

func TestBuildTrapLog_ShouldTakeLevelAndFacilityFromCatalog(t *testing.T) {
	fail := logs.BuildTrapLogForTest(decodeTrap(t, oidHwBoardFail), "192.168.20.1")
	if fail.Level != "critical" || fail.Facility != "hardware" {
		t.Fatalf("hwBoardFail level/facility=%q/%q, want critical/hardware", fail.Level, fail.Facility)
	}

	resume := logs.BuildTrapLogForTest(decodeTrap(t, oidHwBoardResume), "192.168.20.1")
	if resume.Level != "info" {
		t.Fatalf("hwBoardFailResume 是恢复类，level=%q, want info", resume.Level)
	}
}

func TestBuildTrapLog_SeverityVarbindShouldBeatCatalogDefault(t *testing.T) {
	// 设备在 hwBoardFail 里明确携带 hwBaseTrapSeverity=cleared(1)：以设备为准，降为 info
	packet := decodeTrap(t, oidHwBoardFail,
		gosnmp.SnmpPDU{Name: oidBaseTrapSev, Type: gosnmp.Integer, Value: 1},
		gosnmp.SnmpPDU{Name: oidEntityReason, Type: gosnmp.OctetString, Value: []byte("Board recovered")},
	)
	result := logs.BuildTrapLogForTest(packet, "192.168.20.1")

	if result.Level != "info" {
		t.Fatalf("level=%q, want info（hwBaseTrapSeverity=cleared 应覆盖知识库默认的 critical）", result.Level)
	}
	if !strings.Contains(result.Message, "hwBaseTrapSeverity.0=cleared(1)") {
		t.Fatalf("摘要应渲染枚举名: %q", result.Message)
	}
	if !strings.Contains(result.Message, "hwEntityTrapReasonDescr.0=Board recovered") {
		t.Fatalf("摘要应包含原因描述: %q", result.Message)
	}

	major := logs.BuildTrapLogForTest(decodeTrap(t, oidHwBoardResume,
		gosnmp.SnmpPDU{Name: oidBaseTrapSev, Type: gosnmp.Integer, Value: 4},
	), "192.168.20.1")
	if major.Level != "critical" {
		t.Fatalf("hwBaseTrapSeverity=major(4) 应折算为 critical，得 %q", major.Level)
	}
}

func TestBuildTrapLog_RegistryOverrideShouldBeatCatalog(t *testing.T) {
	// coldStart 在注册表 trap.overrides 里钉为 info/system；知识库按名称启发式会给 warning
	result := logs.BuildTrapLogForTest(decodeTrap(t, oidColdStart), "192.168.20.1")
	if result.Level != "info" || result.Facility != "system" {
		t.Fatalf("coldStart level/facility=%q/%q, want info/system（注册表覆盖优先）", result.Level, result.Facility)
	}
}

func TestBuildTrapLog_UnknownTrapShouldKeepLegacyFallback(t *testing.T) {
	packet := decodeTrap(t, oidUnknownPrivate,
		gosnmp.SnmpPDU{Name: "1.3.6.1.4.1.99999.2.1.0", Type: gosnmp.OctetString, Value: []byte("hello")},
	)
	result := logs.BuildTrapLogForTest(packet, "192.168.20.1")

	if result.Level != "info" || result.Facility != "snmp" {
		t.Fatalf("未知 Trap 应保持关键词兜底 info/snmp，得 %q/%q", result.Level, result.Facility)
	}
	// 未知变量 OID 原样保留（去前导点）
	if !strings.Contains(result.Message, "1.3.6.1.4.1.99999.2.1.0=hello") {
		t.Fatalf("未知变量应原样保留: %q", result.Message)
	}
}
