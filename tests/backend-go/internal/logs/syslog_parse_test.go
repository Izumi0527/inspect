package logs_test

import (
	"strings"
	"testing"
	"time"

	"github.com/your-org/inspect-system/backend-go/internal/logs"
)

func TestParseSyslogMessage_RFC5424_ShouldMapPriorityAndFields(t *testing.T) {
	receivedAt := time.Date(2026, 2, 25, 12, 0, 1, 0, time.UTC)
	raw := "<34>1 2026-02-25T12:00:00Z router1 app 123 - - hello world"

	parsed := logs.ParseSyslogMessage(raw, receivedAt)

	if parsed.Level != "critical" {
		t.Fatalf("Level=%q, want %q", parsed.Level, "critical")
	}
	if parsed.Facility != "security" {
		t.Fatalf("Facility=%q, want %q", parsed.Facility, "security")
	}
	if parsed.Process != "app" {
		t.Fatalf("Process=%q, want %q", parsed.Process, "app")
	}
	if parsed.Message != "hello world" {
		t.Fatalf("Message=%q, want %q", parsed.Message, "hello world")
	}
	if parsed.Timestamp.IsZero() {
		t.Fatalf("Timestamp is zero, want parsed timestamp")
	}
}

func TestParseSyslogMessage_RFC3164_ShouldExtractProcessAndMessage(t *testing.T) {
	receivedAt := time.Date(2026, 2, 25, 12, 34, 57, 0, time.UTC)
	raw := "<13>Feb 25 12:34:56 router1 sshd[123]: Failed password for root"

	parsed := logs.ParseSyslogMessage(raw, receivedAt)

	if parsed.Level != "info" {
		t.Fatalf("Level=%q, want %q", parsed.Level, "info")
	}
	if parsed.Process != "sshd" {
		t.Fatalf("Process=%q, want %q", parsed.Process, "sshd")
	}
	if parsed.Message != "Failed password for root" {
		t.Fatalf("Message=%q, want %q", parsed.Message, "Failed password for root")
	}
	if parsed.Timestamp.IsZero() {
		t.Fatalf("Timestamp is zero, want parsed timestamp")
	}
}

func TestParseSyslogMessage_HuaweiVRPAndV600Headers(t *testing.T) {
	receivedAt := time.Date(2026, 11, 20, 12, 0, 0, 0, time.UTC)

	t.Run("RFC3164携带V600_MLAG错误头与CID", func(t *testing.T) {
		// <187> = local7(23)*8 + 3(err); 也测试当 PRI 设为 <134> (local0 info) 时 VRP /3/ 仍精准提取
		raw := "<134>Nov 20 10:15:20 S5755 %%01MLAG/3/PEER_LINK_DOWN(l):CID=0x807a040b;M-LAG peer-link Eth-Trunk10 is down."
		parsed := logs.ParseSyslogMessage(raw, receivedAt)

		if parsed.Level != "error" {
			t.Fatalf("Level=%q, want error", parsed.Level)
		}
		if parsed.Facility != "switching" {
			t.Fatalf("Facility=%q, want switching", parsed.Facility)
		}
		if parsed.Process != "MLAG" {
			t.Fatalf("Process=%q, want MLAG", parsed.Process)
		}
		if parsed.Message != "M-LAG peer-link Eth-Trunk10 is down." {
			t.Fatalf("Message=%q", parsed.Message)
		}
	})

	t.Run("RFC5424携带V600_DEVM严重告警头", func(t *testing.T) {
		raw := "<186>1 2026-11-20T10:15:20+08:00 S5736-S DEVM - - - %%01DEVM/2/POWER_FAIL(l):CID=0x801;Power supply 1 failed."
		parsed := logs.ParseSyslogMessage(raw, receivedAt)

		if parsed.Level != "critical" {
			t.Fatalf("Level=%q, want critical", parsed.Level)
		}
		if parsed.Facility != "system" {
			t.Fatalf("Facility=%q, want system", parsed.Facility)
		}
		if parsed.Process != "DEVM" {
			t.Fatalf("Process=%q, want DEVM", parsed.Process)
		}
	})

	t.Run("携带大写类型S与连字符模块ETH-TRUNK", func(t *testing.T) {
		raw := "<189>Nov 20 10:20:00 S8700 %%01ETH-TRUNK/4/MEMBER_DOWN(S):CID=0x802;Member interface 100GE1/0/1 is down."
		parsed := logs.ParseSyslogMessage(raw, receivedAt)

		if parsed.Level != "warning" {
			t.Fatalf("Level=%q, want warning", parsed.Level)
		}
		if parsed.Facility != "interface" {
			t.Fatalf("Facility=%q, want interface", parsed.Facility)
		}
		if parsed.Process != "ETH-TRUNK" {
			t.Fatalf("Process=%q, want ETH-TRUNK", parsed.Process)
		}
	})

	t.Run("华为带4位年份的Syslog时间格式", func(t *testing.T) {
		raw := "<190>Nov 20 2026 10:25:00 S5755 %%01SECL/5/LOGIN(S):CID=0x803;User admin logged in."
		parsed := logs.ParseSyslogMessage(raw, receivedAt)

		if parsed.Level != "info" {
			t.Fatalf("Level=%q, want info", parsed.Level)
		}
		if parsed.Facility != "security" {
			t.Fatalf("Facility=%q, want security", parsed.Facility)
		}
		wantTS := time.Date(2026, 11, 20, 10, 25, 0, 0, time.UTC)
		if !parsed.Timestamp.Equal(wantTS) {
			t.Fatalf("Timestamp=%v, want %v", parsed.Timestamp, wantTS)
		}
	})

	t.Run("单数日双空格时间戳不应残留前缀", func(t *testing.T) {
		raw := "<134>Nov  2 2026 10:15:20 Switch-S5736 %%01IFM/4/IF_STATE(l):CID=0x1;Interface 25GE1/0/1 is down."
		parsed := logs.ParseSyslogMessage(raw, receivedAt)

		if parsed.Level != "warning" {
			t.Fatalf("Level=%q, want warning", parsed.Level)
		}
		if parsed.Facility != "interface" {
			t.Fatalf("Facility=%q, want interface", parsed.Facility)
		}
		if parsed.Process != "IFM" {
			t.Fatalf("Process=%q, want IFM", parsed.Process)
		}
		if parsed.Message != "Interface 25GE1/0/1 is down." {
			t.Fatalf("Message=%q, want %q", parsed.Message, "Interface 25GE1/0/1 is down.")
		}
		if strings.Contains(parsed.Message, "Nov") || strings.Contains(parsed.Message, "10:15:20") || strings.Contains(parsed.Message, "Switch-S5736") {
			t.Fatalf("Message=%q still contains timestamp or host prefix", parsed.Message)
		}
		wantTS := time.Date(2026, 11, 2, 10, 15, 20, 0, time.UTC)
		if !parsed.Timestamp.Equal(wantTS) {
			t.Fatalf("Timestamp=%v, want %v", parsed.Timestamp, wantTS)
		}
	})
}
