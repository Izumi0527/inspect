package logs_test

import (
	"strings"
	"testing"
	"time"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/logs"
)

//go:linkname resolveVendorCommandForTest github.com/your-org/inspect-system/backend-go/internal/logs.resolveVendorCommand
func resolveVendorCommandForTest(vendor string, logType string) string

//go:linkname parseTrapBufferLineForTest github.com/your-org/inspect-system/backend-go/internal/logs.parseTrapBufferLine
func parseTrapBufferLineForTest(line string, deviceID int, collectedAt time.Time) *logEntryLink

//go:linkname parseAlarmActiveLineForTest github.com/your-org/inspect-system/backend-go/internal/logs.parseAlarmActiveLine
func parseAlarmActiveLineForTest(line string, deviceID int, collectedAt time.Time) *logEntryLink

//go:linkname parseLogOutputForVRPTest github.com/your-org/inspect-system/backend-go/internal/logs.parseLogOutput
func parseLogOutputForVRPTest(output string, deviceID int, vendor string, collectedAt time.Time, maxEntries int) []logEntryLink

type logEntryLink struct {
	DeviceID      int
	Level         string
	Facility      string
	Source        string
	Message       string
	RawMessage    string
	SourceIP      *string
	SourceProcess *string
	LogTimestamp  time.Time
	CollectedAt   time.Time
}

// 华为 VRP display logbuffer 行的结构化解析测试。
//
// 此前 parseLogLine 只支持 H3C 风格的 `[模块/级别/助记符]:` 头，VRP 行的
// `%%01模块/级别/助记符(l)[序号]:` 头匹配不上，整行原文（含时间戳、主机名、
// %% 头）全部落入 message，级别与设施退化为关键词猜测 —— 前端人话解读
// 因此大量退化为兜底文案。本文件锁定结构化解析行为。

const (
	testDeviceID = 1
	testVendor   = "huawei"
)

var collectedAt = time.Date(2026, 9, 3, 12, 0, 0, 0, time.UTC)

func parseLine(t *testing.T, line string) *logs.DeviceLog {
	t.Helper()
	entry := logs.ParseLogLineForTest(line, testDeviceID, testVendor, collectedAt)
	if entry == nil {
		t.Fatalf("日志行解析结果为空: %s", line)
	}
	return entry
}

func TestParseLogLine_VRPLogbufferHeader(t *testing.T) {
	t.Run("标准VRP头_日期时间带时区", func(t *testing.T) {
		line := "2025-03-10 08:12:33+08:00 HUAWEI-S5720 %%01IFNET/4/IF_STATE(l)[231]:Interface 6 turned into DOWN state.(InterfaceIndex=6, InterfaceName=GigabitEthernet0/0/22)"
		entry := parseLine(t, line)

		if entry.Level != "warning" {
			t.Fatalf("级别 = %q, want warning（VRP 4 = Warning）", entry.Level)
		}
		if entry.Facility != "interface" {
			t.Fatalf("设施 = %q, want interface（IFNET 模块）", entry.Facility)
		}
		want := "Interface 6 turned into DOWN state.(InterfaceIndex=6, InterfaceName=GigabitEthernet0/0/22)"
		if entry.Message != want {
			t.Fatalf("消息体 = %q, want %q", entry.Message, want)
		}
		if entry.RawMessage == nil || *entry.RawMessage != line {
			t.Fatalf("原文应完整保留整行")
		}
	})

	t.Run("英文月名时间格式", func(t *testing.T) {
		line := "Mar 10 2025 08:12:33 HUAWEI %%01SSH/5/SSH_FAIL(l):Failed to login. (UserName=admin, IpAddress=10.1.1.1)"
		entry := parseLine(t, line)

		if entry.Level != "info" {
			t.Fatalf("级别 = %q, want info（VRP 5 = Notification）", entry.Level)
		}
		if entry.Facility != "ssh" {
			t.Fatalf("设施 = %q, want ssh（SSH 模块）", entry.Facility)
		}
		if entry.Message != "Failed to login. (UserName=admin, IpAddress=10.1.1.1)" {
			t.Fatalf("消息体 = %q", entry.Message)
		}
	})

	t.Run("SRM模块归入系统设施", func(t *testing.T) {
		line := "2025-03-10 08:12:33 HUAWEI %%01SRM/3/ENTITYINVALID(l):Fan loss.(EntityPhysicalIndex=1)"
		entry := parseLine(t, line)

		if entry.Level != "error" {
			t.Fatalf("级别 = %q, want error（VRP 3 = Error）", entry.Level)
		}
		if entry.Facility != "system" {
			t.Fatalf("设施 = %q, want system（SRM 模块）", entry.Facility)
		}
	})

	t.Run("LINE模块归入安全设施", func(t *testing.T) {
		line := "2025-03-10 08:12:33 HUAWEI %%01LINE/6/VTYUSERLOGIN(l):A user login. (UserName=admin)"
		entry := parseLine(t, line)

		if entry.Facility != "security" {
			t.Fatalf("设施 = %q, want security（LINE 模块）", entry.Facility)
		}
	})

	t.Run("官方V200R024C00全量日志模块映射到合法设施", func(t *testing.T) {
		cases := []struct {
			line         string
			wantFacility string
		}{
			{"2026-11-22 10:00:00 HUAWEI %%01VOSCPU/4/CPU_USAGE_HIGH(l):CPU high.", "system"},
			{"2026-11-22 10:00:00 HUAWEI %%01VOSMEM/4/MEM_USAGE_HIGH(l):Memory high.", "system"},
			{"2026-11-22 10:00:00 HUAWEI %%01ENTITYTRAP/3/FANFAIL(l):Fan fail.", "system"},
			{"2026-11-22 10:00:00 HUAWEI %%01BASETRAP/4/TEMP(l):Temperature high.", "system"},
			{"2026-11-22 10:00:00 HUAWEI %%01ERRDOWN/4/ERRORDOWN_OCCUR(l):Link fault.", "interface"},
			{"2026-11-22 10:00:00 HUAWEI %%01CFGMGR/5/CFG_CHANGE(l):Config changed.", "system"},
			{"2026-11-22 10:00:00 HUAWEI %%01RUMNG/4/RU_INTF_ERR(l):RU intf error.", "interface"},
			{"2026-11-22 10:00:00 HUAWEI %%01RUUP/5/RU_UPGRADE(l):RU upgrade.", "interface"},
		}
		for _, tc := range cases {
			entry := parseLine(t, tc.line)
			if entry.Facility != tc.wantFacility {
				t.Fatalf("line=%q facility=%q, want %q", tc.line, entry.Facility, tc.wantFacility)
			}
		}
	})

	t.Run("无日志类型标记与序号时仍可解析", func(t *testing.T) {
		line := "2025-03-10 08:12:33 HUAWEI %%01CONFIGURATION/4/CONFIGURATION_CHANGE:Configuration changed."
		entry := parseLine(t, line)

		if entry.Facility != "system" {
			t.Fatalf("设施 = %q, want system", entry.Facility)
		}
		if entry.Message != "Configuration changed." {
			t.Fatalf("消息体 = %q", entry.Message)
		}
	})

	t.Run("未知模块回退正文启发式判断", func(t *testing.T) {
		line := "2025-03-10 08:12:33 HUAWEI %%01NOTAMODULE/6/NOTEVENT:something happened over SSH session"
		entry := parseLine(t, line)

		// NOTAMODULE 未收录，detectLogFacility 命中 SSH 关键词
		if entry.Facility != "ssh" {
			t.Fatalf("设施 = %q, want ssh（正文启发式）", entry.Facility)
		}
	})
}

func TestParseLogLine_H3CFormatStillWorks(t *testing.T) {
	// H3C/Comware 风格 `[模块/级别/助记符]:` 头不能被 VRP 解析破坏
	line := "2025-03-10 08:12:33 [IFNET/4/LINK_STATUS]:Interface GigabitEthernet0/0/1 link status is down"
	entry := parseLine(t, line)

	if entry.Level != "warning" {
		t.Fatalf("级别 = %q, want warning", entry.Level)
	}
	if entry.Facility != "interface" {
		t.Fatalf("设施 = %q, want interface", entry.Facility)
	}
	if entry.Message != "Interface GigabitEthernet0/0/1 link status is down" {
		t.Fatalf("消息体 = %q", entry.Message)
	}
}

func TestParseLogLine_UnstructuredFallbackKeepsWholeLine(t *testing.T) {
	// 完全无结构化头的行保持旧行为：整行入库，级别走关键词启发式
	line := "some plain device output without structured header"
	entry := parseLine(t, line)

	if entry.Message != line {
		t.Fatalf("无头行应整行保留, got %q", entry.Message)
	}
}

func TestParseLogLine_VRPLogbufferWithoutVersionHeader(t *testing.T) {
	// 设备执行 undo info-center logbuf version 后，logbuffer 行不再带 %%01 版本前缀，
	// 其余结构与标准行一致，须能按同样语义解析出级别、设施与正文。
	t.Run("无版本头_日期时间带时区与序号", func(t *testing.T) {
		line := "2025-03-10 08:12:33+08:00 HUAWEI-S5720 SSH/5/SSH_FAIL(l)[7]:Failed to login. (UserName=admin, IpAddress=10.1.1.1)"
		entry := parseLine(t, line)

		if entry.Level != "info" {
			t.Fatalf("级别 = %q, want info（VRP 5 = Notification）", entry.Level)
		}
		if entry.Facility != "ssh" {
			t.Fatalf("设施 = %q, want ssh（SSH 模块）", entry.Facility)
		}
		want := "Failed to login. (UserName=admin, IpAddress=10.1.1.1)"
		if entry.Message != want {
			t.Fatalf("消息体 = %q, want %q", entry.Message, want)
		}
	})

	t.Run("无版本头_英文月名时间格式", func(t *testing.T) {
		line := "Mar 10 2025 08:12:33 HUAWEI IFNET/4/IF_STATE(l):Interface 6 turned into DOWN state.(InterfaceName=GigabitEthernet0/0/22)"
		entry := parseLine(t, line)

		if entry.Level != "warning" {
			t.Fatalf("级别 = %q, want warning（VRP 4 = Warning）", entry.Level)
		}
		if entry.Facility != "interface" {
			t.Fatalf("设施 = %q, want interface（IFNET 模块）", entry.Facility)
		}
		if entry.Message != "Interface 6 turned into DOWN state.(InterfaceName=GigabitEthernet0/0/22)" {
			t.Fatalf("消息体 = %q", entry.Message)
		}
	})

	t.Run("版本头行仍优先按标准模式解析", func(t *testing.T) {
		// %%01 头是权威信息（含版本号），不能被无版本头模式截断主机名误解析
		line := "2025-03-10 08:12:33+08:00 HUAWEI-S5720 %%01IFNET/4/IF_STATE(l)[231]:Interface 6 turned into DOWN state.(InterfaceName=GigabitEthernet0/0/22)"
		entry := parseLine(t, line)

		if entry.Facility != "interface" {
			t.Fatalf("设施 = %q, want interface", entry.Facility)
		}
		if entry.Message != "Interface 6 turned into DOWN state.(InterfaceName=GigabitEthernet0/0/22)" {
			t.Fatalf("消息体 = %q", entry.Message)
		}
	})

	t.Run("无版本头_未知模块回退正文启发式", func(t *testing.T) {
		line := "2025-03-10 08:12:33 HUAWEI NOTAMODULE/6/NOTEVENT:something happened over SSH session"
		entry := parseLine(t, line)

		if entry.Facility != "ssh" {
			t.Fatalf("设施 = %q, want ssh（正文启发式）", entry.Facility)
		}
	})
}

func TestParseLogLine_VRPModuleFacilityExpansion(t *testing.T) {
	// 按 docs/vendor 华为 S 系列产品文档 MIB 清单补充的模块 → 设施映射抽查。
	// 消息正文刻意写成与目标设施无关的内容，确保命中靠模块名而非启发式。
	cases := []struct {
		line         string
		wantFacility string
	}{
		{"2025-03-10 08:12:33 HUAWEI %%01NTP/6/NTP_STATE_CHANGE(l):NTP state changed.", "system"},
		{"2025-03-10 08:12:33 HUAWEI %%01CPU/4/CPU_UTILIZATION_RISING(l):CPU usage is high.", "system"},
		{"2025-03-10 08:12:33 HUAWEI %%01MEMORY/4/MEMORY_ALERT(l):Memory usage is high.", "system"},
		{"2025-03-10 08:12:33 HUAWEI %%01FIB/4/FIB_OVERLOAD(l):FIB forwarding entries overload.", "system"},
		{"2025-03-10 08:12:33 HUAWEI %%01GTL/4/GTL_NEAR_EXPIRATION(l):License will expire.", "system"},
		{"2025-03-10 08:12:33 HUAWEI %%01INFOCENTER/4/LOGHOST_FAILUP(l):Cannot reach log host.", "system"},
		{"2025-03-10 08:12:33 HUAWEI %%01SYSLOG/4/LOGFILE_FAIL(l):Cannot write logfile.", "system"},
		{"2025-03-10 08:12:33 HUAWEI %%01FLASH/4/FLASH_ERASE(l):Flash erase done.", "system"},
		{"2025-03-10 08:12:33 HUAWEI %%01BFD/4/BFD_SESSION_DOWN(l):BFD session went down.", "routing"},
		{"2025-03-10 08:12:33 HUAWEI %%01DLDP/4/DLDP_UNIDIRECTIONAL(l):Unidirectional link detected.", "interface"},
		{"2025-03-10 08:12:33 HUAWEI %%01ETHOAM/4/ETHOAM_LINK(l):Ethernet OAM event.", "interface"},
		{"2025-03-10 08:12:33 HUAWEI %%01ERPS/4/RING_FAIL(l):Ring protection switching.", "switching"},
		{"2025-03-10 08:12:33 HUAWEI %%01RRPP/4/RRPP_RING_FAIL(l):Ring protocol event.", "switching"},
		{"2025-03-10 08:12:33 HUAWEI %%01MFLP/4/MAC_MOVE(l):MAC address moved.", "switching"},
		{"2025-03-10 08:12:33 HUAWEI %%01NAC/4/NAC_USER_AUTHEN_FAIL(l):User authentication failed.", "security"},
		{"2025-03-10 08:12:33 HUAWEI %%01RADIUS/4/RADIUS_SERVER_DOWN(l):Radius server unreachable.", "security"},
		{"2025-03-10 08:12:33 HUAWEI %%01PORTAL/4/PORTAL_SERVER_DOWN(l):Portal server is down.", "security"},
		{"2025-03-10 08:12:33 HUAWEI %%01HTTP/5/HTTP_USER_LOGIN(l):A user logs in through web.", "ssh"},
	}

	for _, tc := range cases {
		entry := parseLine(t, tc.line)
		if entry.Facility != tc.wantFacility {
			t.Errorf("%s\n设施 = %q, want %q", tc.line, entry.Facility, tc.wantFacility)
		}
	}
}

func TestParseLogLine_V600Formats(t *testing.T) {
	t.Run("V600带空格时区与毫秒_CID与IFM", func(t *testing.T) {
		line := "2026-11-20 10:15:20.123 +08:00 Switch-S5755 %%01IFM/4/IF_STATE(l):CID=0x807a040b;Interface 25GE1/0/1 has turned into DOWN state."
		entry := parseLine(t, line)

		if entry.Level != "warning" {
			t.Fatalf("级别 = %q, want warning", entry.Level)
		}
		if entry.Facility != "interface" {
			t.Fatalf("设施 = %q, want interface", entry.Facility)
		}
		wantMsg := "Interface 25GE1/0/1 has turned into DOWN state."
		if entry.Message != wantMsg {
			t.Fatalf("消息体 = %q, want %q", entry.Message, wantMsg)
		}
		wantTS := time.Date(2026, 11, 20, 2, 15, 20, 123000000, time.UTC)
		if !entry.LogTimestamp.Equal(wantTS) {
			t.Fatalf("时间戳 = %v, want %v", entry.LogTimestamp, wantTS)
		}
	})

	t.Run("V600微秒与大写类型标识S_SECL", func(t *testing.T) {
		line := "2026-11-20 10:20:00.123456 +08:00 S5736-S %%01SECL/5/LOGIN(S):CID=0x801;User admin logged in."
		entry := parseLine(t, line)

		if entry.Level != "info" {
			t.Fatalf("级别 = %q, want info", entry.Level)
		}
		if entry.Facility != "security" {
			t.Fatalf("设施 = %q, want security", entry.Facility)
		}
		if entry.Message != "User admin logged in." {
			t.Fatalf("消息体 = %q", entry.Message)
		}
	})

	t.Run("V600含连字符模块_ETH-TRUNK", func(t *testing.T) {
		line := "2026-11-20 10:21:00 +08:00 S8700 %%01ETH-TRUNK/4/MEMBER_DOWN(l):CID=0x802;Member interface 100GE1/0/1 is down."
		entry := parseLine(t, line)

		if entry.Level != "warning" {
			t.Fatalf("级别 = %q, want warning", entry.Level)
		}
		if entry.Facility != "interface" {
			t.Fatalf("设施 = %q, want interface", entry.Facility)
		}
		if entry.Message != "Member interface 100GE1/0/1 is down." {
			t.Fatalf("消息体 = %q", entry.Message)
		}
	})

	t.Run("V600表格化display_logbuffer行", func(t *testing.T) {
		line := "2026-06-06 11:20:10  842   Informational  %%01IFM/4/LINK_STATE(l):The physical status of interface GigabitEthernet1/0/1 changed to DOWN."
		entry := parseLine(t, line)

		if entry.Level != "warning" {
			t.Fatalf("级别 = %q, want warning", entry.Level)
		}
		if entry.Facility != "interface" {
			t.Fatalf("设施 = %q, want interface", entry.Facility)
		}
		wantMsg := "The physical status of interface GigabitEthernet1/0/1 changed to DOWN."
		if entry.Message != wantMsg {
			t.Fatalf("消息体 = %q, want %q", entry.Message, wantMsg)
		}
	})

	t.Run("V600无版本头带连字符模块与CID", func(t *testing.T) {
		line := "2026-11-20 10:21:00.500 +08:00 S8700 M-LAG/3/PEER_LINK_DOWN(L)[12]:CID=0x803;M-LAG peer-link Eth-Trunk10 is down."
		entry := parseLine(t, line)

		if entry.Level != "error" {
			t.Fatalf("级别 = %q, want error", entry.Level)
		}
		if entry.Facility != "switching" {
			t.Fatalf("设施 = %q, want switching", entry.Facility)
		}
		if entry.Message != "M-LAG peer-link Eth-Trunk10 is down." {
			t.Fatalf("消息体 = %q", entry.Message)
		}
	})

	t.Run("V600扩展模块_130plus抽查", func(t *testing.T) {
		cases := []struct {
			line         string
			wantFacility string
		}{
			{"2026-11-20 10:00:00 +08:00 S5755 %%01DEVM/2/POWER_FAIL(l):CID=0x1;Power supply 1 failed.", "system"},
			{"2026-11-20 10:00:00 +08:00 S5755 %%01OPTICAL/4/RX_POWER_LOW(l):CID=0x2;Optical Rx power low.", "interface"},
			{"2026-11-20 10:00:00 +08:00 S6750 %%01VXLAN/4/TUNNEL_DOWN(l):CID=0x3;VXLAN tunnel down.", "switching"},
			{"2026-11-20 10:00:00 +08:00 S6750 %%01EVPN/3/PEER_DOWN(l):CID=0x4;EVPN peer down.", "switching"},
			{"2026-11-20 10:00:00 +08:00 S5755 %%01MACSEC/4/MKA_FAIL(l):CID=0x5;MACsec MKA negotiation failed.", "security"},
			{"2026-11-20 10:00:00 +08:00 S5755 %%01TELEMETRY/4/CONN_FAIL(l):CID=0x6;Telemetry gRPC disconnected.", "snmp"},
			{"2026-11-20 10:00:00 +08:00 S16700 %%01BGP4PLUS/4/PEER_DOWN(l):CID=0x7;BGP4+ peer down.", "routing"},
			{"2026-11-20 10:00:00 +08:00 S5736-S %%01ISTACK/4/LINK_DOWN(l):CID=0x8;iStack link down.", "switching"},
			{"2026-11-20 10:00:00 +08:00 S5736-S %%01L3IF/4/IF_DOWN(l):CID=0x9;L3 interface down.", "interface"},
			{"2026-11-20 10:00:00 +08:00 S8700 %%01DEV-MGR/4/BOARD_RESET(l):CID=0xa;Board reset.", "system"},
		}
		for _, tc := range cases {
			entry := parseLine(t, tc.line)
			if entry.Facility != tc.wantFacility {
				t.Errorf("%s\n设施 = %q, want %q", tc.line, entry.Facility, tc.wantFacility)
			}
		}
	})
}

func TestParseAlarmActiveAndTrapBuffer_V600Formats(t *testing.T) {
	t.Run("V600_display_alarm_active_表格行", func(t *testing.T) {
		output := strings.Join([]string{
			"Index   Severity     Id           Source          Time                   Name",
			"-------------------------------------------------------------------------------",
			"1       Major        0x85020001   Slot:1          2026-06-06 10:14:22    Power supply failed",
			"2       Critical     0x85020002   GE1/0/1         2026-06-06 10:15:00    Interface link down",
		}, "\n")

		entries := parseLogOutputForVRPTest(output, 1, "huawei_v600", collectedAt, 100)
		if len(entries) != 2 {
			t.Fatalf("len(entries) = %d, want 2", len(entries))
		}
		if entries[0].Level != "error" || entries[0].Facility != "system" {
			t.Fatalf("entry[0] = level=%q facility=%q, want error/system", entries[0].Level, entries[0].Facility)
		}
		if !strings.Contains(entries[0].Message, "Power supply failed") {
			t.Fatalf("entry[0].Message = %q", entries[0].Message)
		}
		if entries[1].Level != "critical" || entries[1].Facility != "interface" {
			t.Fatalf("entry[1] = level=%q facility=%q, want critical/interface", entries[1].Level, entries[1].Facility)
		}
	})

	t.Run("V600_display_trapbuffer_多行键值块", func(t *testing.T) {
		output := strings.Join([]string{
			"Trapping buffer configuration and contents : enabled",
			"Allowed max buffer size : 1024",
			"Current messages : 2",
			"",
			"Timestamp   : 2026-11-20 10:15:20.123 +08:00",
			"Sequence    : 1024",
			"TrapName    : %%01MLAG/3/PEER_LINK_DOWN(t)",
			"Description : M-LAG peer-link Eth-Trunk10 is down.",
			"",
			"Timestamp   : 2026-11-20 10:16:00 +08:00",
			"Sequence    : 1025",
			"TrapName    : %%01DEVM/2/POWER_FAIL(t)",
			"Description : Power supply 1 failed.",
		}, "\n")

		entries := parseLogOutputForVRPTest(output, 1, "cloudengine", collectedAt, 100)
		if len(entries) != 2 {
			t.Fatalf("len(entries) = %d, want 2", len(entries))
		}
		if entries[0].Level != "error" || entries[0].Facility != "switching" {
			t.Fatalf("entry[0] = level=%q facility=%q, want error/switching", entries[0].Level, entries[0].Facility)
		}
		if !strings.Contains(entries[0].Message, "M-LAG peer-link Eth-Trunk10 is down.") {
			t.Fatalf("entry[0].Message = %q", entries[0].Message)
		}
		wantTS := time.Date(2026, 11, 20, 2, 15, 20, 123000000, time.UTC)
		if !entries[0].LogTimestamp.Equal(wantTS) {
			t.Fatalf("entry[0].LogTimestamp = %v, want %v", entries[0].LogTimestamp, wantTS)
		}
		if entries[1].Level != "critical" || entries[1].Facility != "system" {
			t.Fatalf("entry[1] = level=%q facility=%q, want critical/system", entries[1].Level, entries[1].Facility)
		}
	})

	t.Run("V200单行alarm与trap保持兼容", func(t *testing.T) {
		trapLine := "#Sep 17 2012 17:09:47+00:00 HUAWEI LLDP/4/NBRCHGTRAP:OID: 1.0.8802.1.1.2.0.0.1 Neighbor info changed."
		trap := parseTrapBufferLineForTest(trapLine, 1, collectedAt)
		if trap == nil || trap.Level != "warning" {
			t.Fatalf("V200 trap 解析失败: %+v", trap)
		}

		alarmLine := "1  0x08d40001  hwBoardFail  Critical  Start  Board failed."
		alarm := parseAlarmActiveLineForTest(alarmLine, 1, collectedAt)
		if alarm == nil || alarm.Level != "critical" {
			t.Fatalf("V200 alarm 解析失败: %+v", alarm)
		}
	})
}

func TestResolveVendorCommand_HuaweiAliases(t *testing.T) {
	aliases := []string{"huawei", "huawei_vrp", "huawei_v600", "huawei_vrp8", "cloudengine", "quidway", "华为"}
	for _, vendor := range aliases {
		if got := resolveVendorCommandForTest(vendor, "interface"); got != "display logbuffer | include IF" {
			t.Errorf("resolveVendorCommand(%q, interface) = %q, want huawei command", vendor, got)
		}
		if got := resolveVendorCommandForTest(vendor, "alarm"); got != "display alarm active" {
			t.Errorf("resolveVendorCommand(%q, alarm) = %q", vendor, got)
		}
	}
	if got := resolveVendorCommandForTest("huawei_v600", "system"); got != "display logbuffer" {
		t.Fatalf("got %q", got)
	}
	// Ensure h3c_comware still maps to h3c
	if got := resolveVendorCommandForTest("h3c_comware", "interface"); got != "display logbuffer | include Link" {
		t.Fatalf("resolveVendorCommand(h3c_comware, interface) = %q, want h3c command", got)
	}
}
