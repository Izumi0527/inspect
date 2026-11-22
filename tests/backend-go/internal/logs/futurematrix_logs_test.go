package logs_test

import (
	"strings"
	"testing"
	"time"

	"github.com/gosnmp/gosnmp"

	"github.com/your-org/inspect-system/backend-go/internal/logs"
)

func TestResolveHuaweiAlarmActiveEntryOID(t *testing.T) {
	if got := logs.ResolveHuaweiAlarmActiveEntryOID(".1.3.6.1.4.1.56813.2.23.811"); got != "1.3.6.1.4.1.56813.5.25.180.1.8.1" {
		t.Fatalf("got %q for 56813", got)
	}
	if got := logs.ResolveHuaweiAlarmActiveEntryOID("1.3.6.1.4.1.2011.2.23.982"); got != "1.3.6.1.4.1.2011.5.25.180.1.8.1" {
		t.Fatalf("got %q for 2011", got)
	}
	if got := logs.ResolveHuaweiAlarmActiveEntryOID(""); got != "1.3.6.1.4.1.2011.5.25.180.1.8.1" {
		t.Fatalf("got %q for empty", got)
	}
}

func TestParseAlarmActive_FutureMatrix56813AndUint64AlarmID(t *testing.T) {
	const fmAlarmEntry = ".1.3.6.1.4.1.56813.5.25.180.1.8.1"
	pdus := []gosnmp.SnmpPDU{
		{Name: fmAlarmEntry + ".2.0.1", Type: gosnmp.ObjectIdentifier, Value: ".1.3.6.1.4.1.56813.5.25.219.2.6.1"},
		{Name: fmAlarmEntry + ".3.0.1", Type: gosnmp.OctetString, Value: []byte("Slot=1, FAN 1 failed")},
		{Name: fmAlarmEntry + ".2.0.2", Type: gosnmp.Counter64, Value: uint64(18446744073709551615)},
		{Name: fmAlarmEntry + ".3.0.2", Type: gosnmp.OctetString, Value: []byte("Max uint64 alarm")},
	}

	entries := logs.ParseAlarmActivePDUsForTest(pdus, 12, snmpCollectedAt, 10)
	if len(entries) != 2 {
		t.Fatalf("entries = %d, want 2", len(entries))
	}
	if !strings.Contains(entries[0].Message, "1.3.6.1.4.1.56813.5.25.219.2.6.1") || entries[0].Level != "critical" {
		t.Fatalf("entry[0] = %+v", entries[0])
	}
	if !strings.Contains(entries[1].Message, "18446744073709551615") {
		t.Fatalf("entry[1] missing max uint64 alarm id: %q", entries[1].Message)
	}
}

func TestFutureMatrix_SpacedPercentAndNewModuleFacilities(t *testing.T) {
	receivedAt := time.Date(2026, 11, 22, 12, 0, 0, 0, time.UTC)

	t.Run("logbuffer 带空格 %% 01 与新增模块映射", func(t *testing.T) {
		cases := []struct {
			line         string
			wantLevel    string
			wantFacility string
		}{
			{"2026-11-22 10:00:00+08:00 FutureMatrix %% 01 HWCM/5/EXIT(l)[1]:User admin logged out.", "info", "system"},
			{"2026-11-22 10:00:00+08:00 FutureMatrix %% 01 CLOUDMNG/4/OFFLINE(l):Disconnected.", "warning", "system"},
			{"2026-11-22 10:00:00+08:00 FutureMatrix %% 01 IFMCOMM/4/LINK_DOWN(l):Port down.", "warning", "interface"},
			{"2026-11-22 10:00:00+08:00 FutureMatrix %% 01 SECURITY/3/AUTH_FAIL(l):Auth failed.", "error", "security"},
			{"2026-11-22 10:00:00+08:00 FutureMatrix %% 01 SYSMNG/5/REBOOT(l):Reboot scheduled.", "info", "system"},
			{"2026-11-22 10:00:00+08:00 FutureMatrix %% 01 WEBM/5/LOGIN(l):Web login.", "info", "ssh"},
		}
		for _, tc := range cases {
			entry := logs.ParseLogLineForTest(tc.line, 1, "huawei", receivedAt)
			if entry == nil {
				t.Fatalf("ParseLogLineForTest(%q) = nil", tc.line)
			}
			if entry.Level != tc.wantLevel || entry.Facility != tc.wantFacility {
				t.Fatalf("line=%q got level=%q facility=%q, want %q/%q", tc.line, entry.Level, entry.Facility, tc.wantLevel, tc.wantFacility)
			}
		}
	})

	t.Run("syslog 带空格 %% 01 头解析", func(t *testing.T) {
		raw := "<189>Nov 22 2026 10:05:00 FutureMatrix %% 01 IFMCOMM/4/LINK_DOWN(l)[1]:CID=0x10;Port GE0/0/1 down."
		parsed := logs.ParseSyslogMessage(raw, receivedAt)
		if parsed.Level != "warning" || parsed.Facility != "interface" || parsed.Process != "IFMCOMM" {
			t.Fatalf("parsed = %+v", parsed)
		}
		if parsed.Message != "Port GE0/0/1 down." {
			t.Fatalf("Message = %q", parsed.Message)
		}
	})
}
