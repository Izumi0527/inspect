package ws_test

import (
	"net/http"
	"testing"

	"github.com/gorilla/websocket"

	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

func TestServeWS_FiltersRoomsByPermissionsAndNormalizesLegacyKeys(t *testing.T) {
	manager := ws.NewManager()
	h := ws.NewHandler(manager, staticAuthorizer{
		userID: "u1",
		permissions: []string{
			"alert:read",
			"inspection:read",
		},
	}, nil)
	server, baseURL := startWSServer(t, h)
	defer server.Close()

	url := baseURL + "?rooms=alerts,scan_progress,device_metrics,unknown_room"
	dialer := websocket.Dialer{Subprotocols: []string{"inspect-token", "test-token"}}
	conn, _, err := dialer.Dial(url, http.Header{})
	if err != nil {
		t.Fatalf("Dial err=%v", err)
	}
	defer func() { _ = conn.Close() }()

	waitForConnections(t, manager, 1)

	stats := manager.Stats()
	details, ok := stats["connection_details"].(map[string]interface{})
	if !ok || len(details) != 1 {
		t.Fatalf("期望 connection_details=1，got=%v", stats["connection_details"])
	}

	var subscriptions []interface{}
	for _, raw := range details {
		row, _ := raw.(map[string]interface{})
		subscriptions, _ = row["subscriptions"].([]interface{})
	}

	seen := make(map[string]struct{}, len(subscriptions))
	for _, item := range subscriptions {
		if s, ok := item.(string); ok {
			seen[s] = struct{}{}
		}
	}

	if _, ok := seen["alerts"]; !ok {
		t.Fatalf("期望订阅包含 alerts，subs=%v", subscriptions)
	}
	if _, ok := seen["scan_progress"]; !ok {
		t.Fatalf("期望订阅包含 scan_progress，subs=%v", subscriptions)
	}
	if _, ok := seen["device_metrics"]; ok {
		t.Fatalf("不授予 monitoring:read 时不应订阅 device_metrics，subs=%v", subscriptions)
	}
	if _, ok := seen["unknown_room"]; ok {
		t.Fatalf("未知房间不应被订阅，subs=%v", subscriptions)
	}
}

