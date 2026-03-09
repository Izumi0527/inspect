package settings_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/mail"
	"strings"
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

//go:linkname buildEmailMessage github.com/your-org/inspect-system/backend-go/internal/settings.buildEmailMessage
func buildEmailMessage(from mail.Address, to mail.Address, subject string, content string) []byte

//go:linkname doWebhookOnce github.com/your-org/inspect-system/backend-go/internal/settings.doWebhookOnce
func doWebhookOnce(
	ctx context.Context,
	client *http.Client,
	method string,
	url string,
	headers map[string]string,
	payload map[string]interface{},
) (settings.WebhookSendResult, error)

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

func TestDoWebhookOnce_SendsJSONAndHeaders(t *testing.T) {
	var gotMethod string
	var gotContentType string
	var gotHeader string
	var gotPayload map[string]interface{}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotContentType = r.Header.Get("Content-Type")
		gotHeader = r.Header.Get("X-Test")

		defer r.Body.Close()
		decoder := json.NewDecoder(r.Body)
		if err := decoder.Decode(&gotPayload); err != nil {
			t.Fatalf("decode payload: %v", err)
		}

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer srv.Close()

	result, err := doWebhookOnce(
		context.Background(),
		srv.Client(),
		"POST",
		srv.URL,
		map[string]string{"X-Test": "1"},
		map[string]interface{}{"hello": "world"},
	)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if result.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got: %d", result.StatusCode)
	}
	if strings.TrimSpace(result.ResponseBody) != "ok" {
		t.Fatalf("expected response body ok, got: %q", result.ResponseBody)
	}
	if gotMethod != "POST" {
		t.Fatalf("expected method POST, got: %s", gotMethod)
	}
	if !strings.HasPrefix(gotContentType, "application/json") {
		t.Fatalf("expected Content-Type application/json, got: %q", gotContentType)
	}
	if gotHeader != "1" {
		t.Fatalf("expected X-Test=1, got: %q", gotHeader)
	}
	if gotPayload["hello"] != "world" {
		t.Fatalf("expected payload hello=world, got: %#v", gotPayload)
	}
}
