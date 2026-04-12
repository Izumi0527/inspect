package settings_test

import (
	"net/mail"
	"strings"
	"testing"
	_ "unsafe"
)

//go:linkname buildEmailMessage github.com/your-org/inspect-system/backend-go/internal/settings.buildEmailMessage
func buildEmailMessage(from mail.Address, to mail.Address, subject string, content string) []byte

func TestBuildEmailMessage_BasicHeaders(t *testing.T) {
	from := mail.Address{Name: "网络设备巡检系统", Address: "noreply@example.com"}
	to := mail.Address{Address: "test@example.com"}
	msg := buildEmailMessage(from, to, "测试主题", "测试内容")

	text := string(msg)
	if !strings.Contains(text, "From:") {
		t.Fatalf("expected From header, got: %s", text)
	}
	if !strings.Contains(text, "To:") {
		t.Fatalf("expected To header, got: %s", text)
	}
	if !strings.Contains(text, "Subject:") {
		t.Fatalf("expected Subject header, got: %s", text)
	}
	if !strings.Contains(text, "Content-Type: text/plain; charset=\"UTF-8\"") {
		t.Fatalf("expected utf-8 content-type, got: %s", text)
	}
	if !strings.Contains(text, "测试内容") {
		t.Fatalf("expected body content, got: %s", text)
	}
}
