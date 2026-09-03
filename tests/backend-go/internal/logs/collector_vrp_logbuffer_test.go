package logs_test

import (
	"testing"
	"time"

	"github.com/your-org/inspect-system/backend-go/internal/logs"
)

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
