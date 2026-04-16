package ws_test

import (
	"context"
	"encoding/json"
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

func TestHeartbeatAck_ReturnsOk(t *testing.T) {
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
	defer conn.Close()

	// 连接建立后服务端会发送一条 system_status，先读掉避免干扰。
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, _, err = conn.ReadMessage()
	if err != nil {
		t.Fatalf("Read initial message err=%v", err)
	}

	if err := conn.WriteJSON(map[string]interface{}{"type": "heartbeat"}); err != nil {
		t.Fatalf("WriteJSON heartbeat err=%v", err)
	}

	deadline := time.Now().Add(2 * time.Second)
	for {
		_ = conn.SetReadDeadline(deadline)
		_, payload, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("ReadMessage err=%v", err)
		}

		var msg struct {
			Type string                 `json:"type"`
			Data map[string]interface{} `json:"data"`
		}
		if err := json.Unmarshal(payload, &msg); err != nil {
			t.Fatalf("Unmarshal err=%v payload=%s", err, string(payload))
		}
		if msg.Type != "heartbeat" {
			// 允许未来扩展的其它 system_status 消息，继续读直到拿到 heartbeat。
			continue
		}

		status, _ := msg.Data["status"].(string)
		if status != "ok" {
			t.Fatalf("期望 heartbeat status=ok，实际=%v", msg.Data["status"])
		}
		return
	}
}
