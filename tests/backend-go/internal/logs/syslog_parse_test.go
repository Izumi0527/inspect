package logs_test

import (
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

