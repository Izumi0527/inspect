package ws_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

type staticAuthorizer struct {
	userID      string
	permissions []string
	err         error
}

func (s staticAuthorizer) AuthorizeAccessToken(_ context.Context, _ string) (string, []string, error) {
	if s.err != nil {
		return "", nil, s.err
	}
	return s.userID, append([]string{}, s.permissions...), nil
}

func startWSServer(t *testing.T, handler *ws.Handler) (*httptest.Server, string) {
	t.Helper()

	e := echo.New()
	api := e.Group("/api/v1")
	handler.Register(api)

	server := httptest.NewServer(e)
	wsURL := "ws" + server.URL[len("http"):] + "/api/v1/ws/u1"
	return server, wsURL
}

func waitForConnections(t *testing.T, manager *ws.Manager, want int) {
	t.Helper()
	deadline := time.Now().Add(1 * time.Second)
	for time.Now().Before(deadline) {
		stats := manager.Stats()
		total, _ := stats["total_connections"].(int)
		if total == want {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("等待连接数=%d 超时", want)
}

func TestOriginCheck_AllowsMissingOrigin(t *testing.T) {
	manager := ws.NewManager()
	h := ws.NewHandlerWithOrigins(manager, staticAuthorizer{userID: "u1"}, nil, []string{"http://localhost:3000"})
	server, url := startWSServer(t, h)
	defer server.Close()

	dialer := websocket.Dialer{Subprotocols: []string{"inspect-token", "test-token"}}
	conn, _, err := dialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("Dial err=%v", err)
	}
	_ = conn.Close()
}

func TestOriginCheck_AllowsConfiguredOrigin(t *testing.T) {
	manager := ws.NewManager()
	h := ws.NewHandlerWithOrigins(manager, staticAuthorizer{userID: "u1"}, nil, []string{"http://localhost:3000"})
	server, url := startWSServer(t, h)
	defer server.Close()

	dialer := websocket.Dialer{Subprotocols: []string{"inspect-token", "test-token"}}
	header := http.Header{}
	header.Set("Origin", "http://localhost:3000")
	conn, _, err := dialer.Dial(url, header)
	if err != nil {
		t.Fatalf("Dial err=%v", err)
	}
	_ = conn.Close()
}

func TestOriginCheck_DeniesUnknownOrigin(t *testing.T) {
	manager := ws.NewManager()
	h := ws.NewHandlerWithOrigins(manager, staticAuthorizer{userID: "u1"}, nil, []string{"http://localhost:3000"})
	server, url := startWSServer(t, h)
	defer server.Close()

	dialer := websocket.Dialer{Subprotocols: []string{"inspect-token", "test-token"}}
	header := http.Header{}
	header.Set("Origin", "http://evil.example")
	_, _, err := dialer.Dial(url, header)
	if err == nil {
		t.Fatalf("期望未知 Origin 被拒绝")
	}
}

func TestOriginCheck_AllowsAnyWhenWildcardConfigured(t *testing.T) {
	manager := ws.NewManager()
	h := ws.NewHandlerWithOrigins(manager, staticAuthorizer{userID: "u1"}, nil, []string{"*"})
	server, url := startWSServer(t, h)
	defer server.Close()

	dialer := websocket.Dialer{Subprotocols: []string{"inspect-token", "test-token"}}
	header := http.Header{}
	header.Set("Origin", "http://evil.example")
	conn, _, err := dialer.Dial(url, header)
	if err != nil {
		t.Fatalf("Dial err=%v", err)
	}
	_ = conn.Close()
}

func TestOriginCheck_AllowsAnyWhenNoOriginsProvided(t *testing.T) {
	manager := ws.NewManager()
	h := ws.NewHandlerWithOrigins(manager, staticAuthorizer{userID: "u1"}, nil, nil)
	server, url := startWSServer(t, h)
	defer server.Close()

	dialer := websocket.Dialer{Subprotocols: []string{"inspect-token", "test-token"}}
	header := http.Header{}
	header.Set("Origin", "http://evil.example")
	conn, _, err := dialer.Dial(url, header)
	if err != nil {
		t.Fatalf("Dial err=%v", err)
	}
	_ = conn.Close()
}

