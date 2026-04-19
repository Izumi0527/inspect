package http_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/config"
	apphttp "github.com/your-org/inspect-system/backend-go/internal/http"
)

func TestNewServer_CORSPreflightShouldExplicitlyAllowAuthorizationHeader(t *testing.T) {
	server := apphttp.NewServer(
		config.Config{
			AppVersion:  "test",
			CorsOrigins: []string{"http://127.0.0.1:3000"},
		},
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
	)

	request := httptest.NewRequest(http.MethodOptions, "/api/v1/reports/trends/analysis", nil)
	request.Header.Set("Origin", "http://127.0.0.1:3000")
	request.Header.Set("Access-Control-Request-Method", http.MethodPost)
	request.Header.Set("Access-Control-Request-Headers", "authorization,content-type,x-request-id")

	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("预检请求状态码 = %d，期望 %d", recorder.Code, http.StatusNoContent)
	}

	allowHeaders := strings.ToLower(recorder.Header().Get("Access-Control-Allow-Headers"))
	if allowHeaders == "" {
		t.Fatalf("预检响应缺少 Access-Control-Allow-Headers")
	}

	for _, expected := range []string{"authorization", "content-type", "x-request-id"} {
		if !strings.Contains(allowHeaders, expected) {
			t.Fatalf("Access-Control-Allow-Headers = %q，缺少 %s", allowHeaders, expected)
		}
	}

	if strings.Contains(allowHeaders, "*") {
		t.Fatalf("Access-Control-Allow-Headers = %q，不应继续使用通配符以覆盖 Authorization", allowHeaders)
	}
}
