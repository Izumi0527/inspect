package ws_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

func TestServeWS_SubprotocolMissingInspectToken(t *testing.T) {
	e := echo.New()
	h := ws.NewHandler(ws.NewManager(), nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ws/u1", nil)
	req.Header.Set("Sec-WebSocket-Protocol", "chat")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	gotErr := h.ServeWS(c)
	if gotErr == nil {
		t.Fatalf("期望缺少 inspect-token 时返回错误")
	}
	httpErr, ok := gotErr.(*echo.HTTPError)
	if !ok {
		t.Fatalf("期望返回 *echo.HTTPError，got=%T", gotErr)
	}
	if httpErr.Code != http.StatusUnauthorized {
		t.Fatalf("期望 401，got=%d", httpErr.Code)
	}
	if msg, _ := httpErr.Message.(string); !strings.Contains(msg, "inspect-token") {
		t.Fatalf("期望错误信息包含 inspect-token，got=%v", httpErr.Message)
	}
}

func TestServeWS_SubprotocolMissingTokenValue(t *testing.T) {
	e := echo.New()
	h := ws.NewHandler(ws.NewManager(), nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ws/u1", nil)
	req.Header.Set("Sec-WebSocket-Protocol", "inspect-token")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	gotErr := h.ServeWS(c)
	if gotErr == nil {
		t.Fatalf("期望缺少 token 时返回错误")
	}
	httpErr, ok := gotErr.(*echo.HTTPError)
	if !ok {
		t.Fatalf("期望返回 *echo.HTTPError，got=%T", gotErr)
	}
	if httpErr.Code != http.StatusUnauthorized {
		t.Fatalf("期望 401，got=%d", httpErr.Code)
	}
	if msg, _ := httpErr.Message.(string); !strings.Contains(strings.ToLower(msg), "token") {
		t.Fatalf("期望错误信息包含 token，got=%v", httpErr.Message)
	}
}

func TestServeWS_SubprotocolTokenTooLarge(t *testing.T) {
	e := echo.New()
	h := ws.NewHandler(ws.NewManager(), nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ws/u1", nil)
	req.Header.Set("Sec-WebSocket-Protocol", "inspect-token, "+strings.Repeat("a", 5000))
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	gotErr := h.ServeWS(c)
	if gotErr == nil {
		t.Fatalf("期望 token 超长时返回错误")
	}
	httpErr, ok := gotErr.(*echo.HTTPError)
	if !ok {
		t.Fatalf("期望返回 *echo.HTTPError，got=%T", gotErr)
	}
	if httpErr.Code != http.StatusUnauthorized {
		t.Fatalf("期望 401，got=%d", httpErr.Code)
	}
	if msg, _ := httpErr.Message.(string); !strings.Contains(strings.ToLower(msg), "token") {
		t.Fatalf("期望错误信息包含 token，got=%v", httpErr.Message)
	}
}

