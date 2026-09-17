package ws_test

import (
	"net/http"
	"testing"

	"github.com/gorilla/websocket"

	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

// notifications 房间只承载“哪个源的哪条记录变成了什么状态”，不含敏感数据，
// 任何已登录用户都可订阅；真正的数据仍要经 /dashboard/notifications 按权限拉取。
func TestServeWS_NotificationsRoom_OnlyRequiresAuthentication(t *testing.T) {
	manager := ws.NewManager()
	h := ws.NewHandler(manager, staticAuthorizer{userID: "u1", permissions: []string{}}, nil)
	server, baseURL := startWSServer(t, h)
	defer server.Close()

	dialer := websocket.Dialer{Subprotocols: []string{"inspect-token", "test-token"}}
	conn, _, err := dialer.Dial(baseURL+"?rooms="+ws.RoomNotifications, http.Header{})
	if err != nil {
		t.Fatalf("Dial err=%v", err)
	}
	defer func() { _ = conn.Close() }()

	waitForConnections(t, manager, 1)

	if sent := manager.SendToRoom(ws.RoomNotifications, ws.Message{Type: ws.MessageNotification}); sent != 1 {
		t.Fatalf("无任何权限的已登录用户应能订阅 notifications 房间，recipients=%d want 1", sent)
	}
}

type recordingPublisher struct {
	rooms    []string
	messages []ws.Message
}

func (p *recordingPublisher) SendToRoom(room string, message ws.Message) int {
	p.rooms = append(p.rooms, room)
	p.messages = append(p.messages, message)
	return 1
}

func TestPublishNotificationChange_ShouldSendTypedMessageToNotificationsRoom(t *testing.T) {
	publisher := &recordingPublisher{}

	ws.PublishNotificationChange(publisher, ws.NotificationChange{
		Source: ws.NotificationSourceReport,
		ID:     "88",
		Status: "completed",
	})

	if len(publisher.rooms) != 1 || publisher.rooms[0] != ws.RoomNotifications {
		t.Fatalf("rooms = %v, want [%s]", publisher.rooms, ws.RoomNotifications)
	}
	msg := publisher.messages[0]
	if msg.Type != ws.MessageNotification {
		t.Fatalf("message type = %q, want %q", msg.Type, ws.MessageNotification)
	}
	change, ok := msg.Data.(ws.NotificationChange)
	if !ok {
		t.Fatalf("message data type = %T, want ws.NotificationChange", msg.Data)
	}
	if change.Source != ws.NotificationSourceReport || change.ID != "88" || change.Status != "completed" {
		t.Fatalf("change = %+v", change)
	}
}

func TestPublishNotificationChange_NilPublisher_ShouldBeNoop(t *testing.T) {
	ws.PublishNotificationChange(nil, ws.NotificationChange{Source: ws.NotificationSourceScan, ID: "x", Status: "failed"})
}
