package alerts_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

type evaluatorTestAuthorizer struct {
	userID      string
	permissions []string
}

func (a evaluatorTestAuthorizer) AuthorizeAccessToken(_ context.Context, _ string) (string, []string, error) {
	return a.userID, append([]string{}, a.permissions...), nil
}

// dialAlertsRoom 以 alerts:read 权限建立一条订阅了 alerts 房间的真实 WebSocket 连接。
func dialAlertsRoom(t *testing.T, manager *ws.Manager) (*websocket.Conn, func()) {
	t.Helper()

	handler := ws.NewHandler(manager, evaluatorTestAuthorizer{userID: "u1", permissions: []string{"alerts:read"}}, nil)
	e := echo.New()
	handler.Register(e.Group("/api/v1"))
	server := httptest.NewServer(e)

	url := "ws" + server.URL[len("http"):] + "/api/v1/ws/u1?rooms=alerts"
	dialer := websocket.Dialer{Subprotocols: []string{"inspect-token", "test-token"}}
	conn, _, err := dialer.Dial(url, http.Header{})
	if err != nil {
		server.Close()
		t.Fatalf("Dial err=%v", err)
	}

	deadline := time.Now().Add(1 * time.Second)
	for time.Now().Before(deadline) {
		if total, _ := manager.Stats()["total_connections"].(int); total == 1 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if total, _ := manager.Stats()["total_connections"].(int); total != 1 {
		_ = conn.Close()
		server.Close()
		t.Fatalf("等待 WebSocket 连接建立超时")
	}

	return conn, func() {
		_ = conn.Close()
		server.Close()
	}
}

// waitForResolvedBroadcast 在 2s 内读取 alerts 房间消息，直到收到 status=resolved 的 alert 消息；
// 超时直接失败而不是挂起整个包。
func waitForResolvedBroadcast(t *testing.T, conn *websocket.Conn) map[string]interface{} {
	t.Helper()

	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	for {
		var envelope struct {
			Type string                 `json:"type"`
			Data map[string]interface{} `json:"data"`
		}
		if err := conn.ReadJSON(&envelope); err != nil {
			t.Fatalf("等待自动恢复广播超时或读取失败: %v", err)
		}
		if envelope.Type == "alert" && envelope.Data["status"] == "resolved" {
			return envelope.Data
		}
	}
}

// 设备恢复在线后，评估器自动解决离线告警；此时必须向 alerts 房间推送 status=resolved，
// 前端总览「实时告警」才能不等轮询就把已恢复的告警移除。
func TestEvaluateAll_ConnectivityAutoResolveBroadcastsResolved(t *testing.T) {
	db, mock, cleanup := newAlertsGormDBWithSQLMock(t)
	defer cleanup()

	manager := ws.NewManager()
	conn, closeConn := dialAlertsRoom(t, manager)
	defer closeConn()

	evaluator := alerts.NewEvaluator(db, manager, nil, zap.NewNop())

	// 1. 无活跃规则
	mock.ExpectQuery(`(?is)SELECT \* FROM "alert_rules" WHERE is_active = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	// 2. 无被监控设备的指标快照（设备列表为空时不再查 device_metrics）
	mock.ExpectQuery(`(?is)SELECT id, name, device_type, ip_address FROM "devices" WHERE is_active = \$1 AND is_monitored = \$2`).
		WithArgs(true, true).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "device_type", "ip_address"}))
	// 3. 连通性评估：一台在线设备
	mock.ExpectQuery(`(?is)SELECT id, name, ip_address, status FROM "devices" WHERE is_active = \$1 AND is_monitored = \$2`).
		WithArgs(true, true).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address", "status"}).
			AddRow(1, "core-sw", "10.0.0.1", "online"))
	// 4. 该设备存在一条 open 的离线告警
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE device_id = \$1 AND category = \$2 AND status = \$3 .*LIMIT \$4`).
		WithArgs(1, "connectivity", "open", 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_id", "title", "message", "category", "severity", "status"}).
			AddRow(42, 1, "[CRITICAL] core-sw - 设备离线", "设备 core-sw (10.0.0.1) 无法连通", "connectivity", "critical", "open"))
	// 5. 自动解决：写 resolved
	mock.ExpectExec(`(?is)UPDATE "alerts" SET .*WHERE id = \$\d+`).
		WillReturnResult(sqlmock.NewResult(0, 1))

	created, resolved, err := evaluator.EvaluateAll(context.Background())
	if err != nil {
		t.Fatalf("EvaluateAll() error = %v", err)
	}
	if created != 0 || resolved != 1 {
		t.Fatalf("EvaluateAll() created=%d resolved=%d, want 0/1", created, resolved)
	}

	data := waitForResolvedBroadcast(t, conn)
	if id, _ := data["id"].(float64); int(id) != 42 {
		t.Fatalf("resolved 广播的 id = %v, want 42", data["id"])
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
