package logs_test

import (
	"strings"
	"testing"
	"time"

	"github.com/gosnmp/gosnmp"

	"github.com/your-org/inspect-system/backend-go/internal/logs"
)

// SNMP 轮询采集的解析契约：
// - display trapbuffer 的 SNMP 等价物是 NOTIFICATION-LOG-MIB 的 nlmLogTable + nlmLogVariableTable
//   （文档 §1.166，读取无限制）；
// - display alarm active 的等价物是 HUAWEI-ALARM-MIB 的 hwAlarmActiveTable（文档 §1.13.4.3）。
// PDU 名称按 gosnmp 真实返回形态带前导点。

const (
	nlmLogEntry = ".1.3.6.1.2.1.92.1.3.1.1"
	nlmVarEntry = ".1.3.6.1.2.1.92.1.3.2.1"
	// nlmLogName 为零长度 OCTET STRING 索引 → 编码为单段 "0"
	nlmIdx17 = ".0.17"
	nlmIdx18 = ".0.18"
)

var snmpCollectedAt = time.Date(2026, 9, 9, 12, 0, 0, 0, time.UTC)

// dateAndTime 构造 8 或 11 字节的 SNMPv2-TC DateAndTime。
func dateAndTime(year int, month, day, hour, min, sec, deci byte, tz ...byte) []byte {
	out := []byte{byte(year >> 8), byte(year & 0xff), month, day, hour, min, sec, deci}
	return append(out, tz...)
}

func nlmLogPDUs() []gosnmp.SnmpPDU {
	return []gosnmp.SnmpPDU{
		// 第 17 条：linkDown，2026-09-09 11:58:30.0 +08:00
		{Name: nlmLogEntry + ".3" + nlmIdx17, Type: gosnmp.OctetString, Value: dateAndTime(2026, 9, 9, 11, 58, 30, 0, '+', 8, 0)},
		{Name: nlmLogEntry + ".9" + nlmIdx17, Type: gosnmp.ObjectIdentifier, Value: ".1.3.6.1.6.3.1.1.5.3"},
		// 第 18 条：hwBoardFail，无时区形态
		{Name: nlmLogEntry + ".3" + nlmIdx18, Type: gosnmp.OctetString, Value: dateAndTime(2026, 9, 9, 11, 59, 0, 5)},
		{Name: nlmLogEntry + ".9" + nlmIdx18, Type: gosnmp.ObjectIdentifier, Value: ".1.3.6.1.4.1.2011.5.25.219.2.2.3"},
	}
}

func nlmVarPDUs() []gosnmp.SnmpPDU {
	return []gosnmp.SnmpPDU{
		// 第 17 条的三个变量：ifIndex.12=12 (integer32)，ifAdminStatus.12=up(1)，ifOperStatus.12=down(2)
		{Name: nlmVarEntry + ".2" + nlmIdx17 + ".1", Type: gosnmp.ObjectIdentifier, Value: ".1.3.6.1.2.1.2.2.1.1.12"},
		{Name: nlmVarEntry + ".3" + nlmIdx17 + ".1", Type: gosnmp.Integer, Value: 4},
		{Name: nlmVarEntry + ".7" + nlmIdx17 + ".1", Type: gosnmp.Integer, Value: 12},
		{Name: nlmVarEntry + ".2" + nlmIdx17 + ".2", Type: gosnmp.ObjectIdentifier, Value: ".1.3.6.1.2.1.2.2.1.7.12"},
		{Name: nlmVarEntry + ".3" + nlmIdx17 + ".2", Type: gosnmp.Integer, Value: 4},
		{Name: nlmVarEntry + ".7" + nlmIdx17 + ".2", Type: gosnmp.Integer, Value: 1},
		{Name: nlmVarEntry + ".2" + nlmIdx17 + ".3", Type: gosnmp.ObjectIdentifier, Value: ".1.3.6.1.2.1.2.2.1.8.12"},
		{Name: nlmVarEntry + ".3" + nlmIdx17 + ".3", Type: gosnmp.Integer, Value: 4},
		{Name: nlmVarEntry + ".7" + nlmIdx17 + ".3", Type: gosnmp.Integer, Value: 2},
		// 第 18 条：entPhysicalName（octetString）
		{Name: nlmVarEntry + ".2" + nlmIdx18 + ".1", Type: gosnmp.ObjectIdentifier, Value: ".1.3.6.1.2.1.47.1.1.1.1.7.67108873"},
		{Name: nlmVarEntry + ".3" + nlmIdx18 + ".1", Type: gosnmp.Integer, Value: 6},
		{Name: nlmVarEntry + ".8" + nlmIdx18 + ".1", Type: gosnmp.OctetString, Value: []byte("MPU Board 0")},
	}
}

func TestParseNotificationLog_ShouldBuildTrapEntriesNewestFirst(t *testing.T) {
	entries := logs.ParseNotificationLogPDUsForTest(nlmLogPDUs(), nlmVarPDUs(), 6, snmpCollectedAt, 100)
	if len(entries) != 2 {
		t.Fatalf("entries=%d, want 2", len(entries))
	}

	// 最新（logIndex 大）在前
	board, link := entries[0], entries[1]
	if !strings.Contains(board.Message, "1.3.6.1.4.1.2011.5.25.219.2.2.3") {
		t.Fatalf("首条应是 hwBoardFail: %q", board.Message)
	}
	if board.Source != "snmp" || board.DeviceID != 6 {
		t.Fatalf("source/device=%q/%d, want snmp/6", board.Source, board.DeviceID)
	}
	if board.Level != "critical" || board.Facility != "system" {
		// hardware 只影响告警分类，入库前折回 system
		t.Fatalf("hwBoardFail level/facility=%q/%q, want critical/system", board.Level, board.Facility)
	}
	if !strings.Contains(board.Message, "entPhysicalName.67108873=MPU Board 0") {
		t.Fatalf("变量应解析为名称: %q", board.Message)
	}
	// 无时区形态按服务器本地时间解释，与 SSH 采集口径一致
	wantBoardTS := time.Date(2026, 9, 9, 11, 59, 0, 500_000_000, time.Local).UTC()
	if !board.LogTimestamp.Equal(wantBoardTS) {
		t.Fatalf("hwBoardFail 时间=%v, want %v", board.LogTimestamp, wantBoardTS)
	}
	if board.CollectedAt != snmpCollectedAt {
		t.Fatalf("collected_at 应为采集时刻")
	}

	if !strings.HasPrefix(link.Message, "SNMP Trap 1.3.6.1.6.3.1.1.5.3 | ") {
		t.Fatalf("linkDown 消息骨架应与实时 Trap 一致: %q", link.Message)
	}
	if link.Level != "warning" || link.Facility != "interface" {
		t.Fatalf("linkDown level/facility=%q/%q, want warning/interface", link.Level, link.Facility)
	}
	for _, want := range []string{"ifIndex.12=12", "ifAdminStatus.12=up(1)", "ifOperStatus.12=down(2)"} {
		if !strings.Contains(link.Message, want) {
			t.Fatalf("摘要缺少 %q: %q", want, link.Message)
		}
	}
	wantLinkTS := time.Date(2026, 9, 9, 11, 58, 30, 0, time.FixedZone("", 8*3600)).UTC()
	if !link.LogTimestamp.Equal(wantLinkTS) {
		t.Fatalf("linkDown 时间=%v, want %v", link.LogTimestamp, wantLinkTS)
	}
	if link.RawMessage == nil || !strings.Contains(*link.RawMessage, `"trap_oid":"1.3.6.1.6.3.1.1.5.3"`) {
		t.Fatalf("原文应为含 trap_oid 的 JSON: %v", link.RawMessage)
	}
}

func TestParseNotificationLog_ShouldRespectMaxEntriesAndSkipRowsWithoutNotificationID(t *testing.T) {
	pdus := append(nlmLogPDUs(),
		// 第 19 条只有时间没有 NotificationID（残缺行），应跳过
		gosnmp.SnmpPDU{Name: nlmLogEntry + ".3.0.19", Type: gosnmp.OctetString, Value: dateAndTime(2026, 9, 9, 12, 0, 0, 0)},
	)
	entries := logs.ParseNotificationLogPDUsForTest(pdus, nil, 6, snmpCollectedAt, 1)
	if len(entries) != 1 {
		t.Fatalf("entries=%d, want 1（maxEntries 截断且残缺行跳过）", len(entries))
	}
	if !strings.Contains(entries[0].Message, "219.2.2.3") {
		t.Fatalf("截断应保留最新一条: %q", entries[0].Message)
	}
	// 变量表为空时时间戳解析仍然成立，摘要退化为无变量
	if entries[0].LogTimestamp.IsZero() {
		t.Fatal("时间戳不应为零值")
	}
}

func TestParseNotificationLog_BadDateShouldFallbackToCollectedAt(t *testing.T) {
	pdus := []gosnmp.SnmpPDU{
		{Name: nlmLogEntry + ".3.0.5", Type: gosnmp.OctetString, Value: []byte{1, 2, 3}},
		{Name: nlmLogEntry + ".9.0.5", Type: gosnmp.ObjectIdentifier, Value: ".1.3.6.1.6.3.1.1.5.1"},
	}
	entries := logs.ParseNotificationLogPDUsForTest(pdus, nil, 6, snmpCollectedAt, 10)
	if len(entries) != 1 {
		t.Fatalf("entries=%d, want 1", len(entries))
	}
	if !entries[0].LogTimestamp.Equal(snmpCollectedAt) {
		t.Fatalf("非法 DateAndTime 应回退采集时间，得 %v", entries[0].LogTimestamp)
	}
}

func TestParseAlarmActive_ShouldUseCatalogNameAndLevel(t *testing.T) {
	const alarmEntry = ".1.3.6.1.4.1.2011.5.25.180.1.8.1"
	// 索引 = hwSnmpTargetAddrExtIndex（OCTET STRING "nms"：3.110.109.115）+ hwActiveAlarmIndex
	const idx = ".3.110.109.115.42"
	pdus := []gosnmp.SnmpPDU{
		{Name: alarmEntry + ".2" + idx, Type: gosnmp.ObjectIdentifier, Value: ".1.3.6.1.4.1.2011.5.25.219.2.6.1"},
		{Name: alarmEntry + ".3" + idx, Type: gosnmp.OctetString, Value: []byte("EntityPhysicalIndex=67108875, EntityPhysicalName=FAN 1")},
		{Name: alarmEntry + ".4" + idx, Type: gosnmp.Integer, Value: 1},
		// 第二行：未知告警 OID，Para 非打印字节
		{Name: alarmEntry + ".2.3.110.109.115.43", Type: gosnmp.ObjectIdentifier, Value: ".1.3.6.1.4.1.99999.9.9.9.9"},
		{Name: alarmEntry + ".3.3.110.109.115.43", Type: gosnmp.OctetString, Value: []byte{0x00, 0x01, 0xff}},
	}

	entries := logs.ParseAlarmActivePDUsForTest(pdus, 6, snmpCollectedAt, 10)
	if len(entries) != 2 {
		t.Fatalf("entries=%d, want 2", len(entries))
	}
	fan, unknown := entries[0], entries[1]
	if !strings.Contains(fan.Message, "1.3.6.1.4.1.2011.5.25.219.2.6.1") || !strings.Contains(fan.Message, "hwFanRemove") {
		t.Fatalf("消息应含告警 OID 与名称: %q", fan.Message)
	}
	if !strings.Contains(fan.Message, "EntityPhysicalName=FAN 1") {
		t.Fatalf("消息应含 hwActiveAlarmPara 原文: %q", fan.Message)
	}
	if fan.Level != "critical" || fan.Source != "snmp" {
		t.Fatalf("level/source=%q/%q, want critical/snmp", fan.Level, fan.Source)
	}
	if !fan.LogTimestamp.Equal(snmpCollectedAt) {
		t.Fatal("活动告警表无时间列，log_timestamp 应等于采集时间以便按内容去重")
	}

	if unknown.Level != "warning" {
		t.Fatalf("未知活动告警默认 warning，得 %q", unknown.Level)
	}
	if !strings.Contains(unknown.Message, "0x0001ff") {
		t.Fatalf("非打印 Para 应以 hex 呈现: %q", unknown.Message)
	}
}

func TestParseAlarmActive_EmptyWalkShouldReturnNoEntries(t *testing.T) {
	if got := logs.ParseAlarmActivePDUsForTest(nil, 6, snmpCollectedAt, 10); len(got) != 0 {
		t.Fatalf("空 walk 应返回空切片，得 %d 条", len(got))
	}
}
