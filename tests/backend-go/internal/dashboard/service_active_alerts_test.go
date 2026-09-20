package dashboard_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/dashboard"
	"go.uber.org/zap"
)

// 总览「实时告警」只取仍活跃的告警：SQL 必须带 status IN (open, acknowledged) 过滤，
// 已解决/关闭的告警（含系统自动恢复）不得再出现在卡片里。
func TestGetActiveAlerts_OnlyQueriesOpenAndAcknowledged(t *testing.T) {
	db, mock, cleanup := newDashboardGormDBWithSQLMock(t)
	defer cleanup()

	service := dashboard.NewService(db, alerts.NewService(db, zap.NewNop()), nil, nil, nil, zap.NewNop())

	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM alerts AS a .*WHERE a\.status IN \(\$1,\$2\)`).
		WithArgs("open", "acknowledged").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(9))
	mock.ExpectQuery(`(?is)SELECT a\.\*, d\.name AS device_name.*WHERE a\.status IN \(\$1,\$2\) ORDER BY a\.last_occurred desc, a\.created_at desc LIMIT \$3`).
		WithArgs("open", "acknowledged", 5).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "title", "message", "category", "severity", "status", "device_name", "device_ip", "rule_name",
		}).AddRow(7, 1, "[CRITICAL] core-sw - CPU", "CPU 过高", "performance", "critical", "open", "core-sw", "10.0.0.1", "cpu-rule"))

	items, total, err := service.GetActiveAlerts(context.Background(), 5)
	if err != nil {
		t.Fatalf("GetActiveAlerts() error = %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("GetActiveAlerts() items = %d, want 1", len(items))
	}
	// 总数来自计数查询而不是截断后的条数
	if total != 9 {
		t.Fatalf("GetActiveAlerts() total = %d, want 9", total)
	}
	if items[0].ID != 7 || items[0].Device != "core-sw" || items[0].Severity != "critical" || items[0].Message != "CPU 过高" {
		t.Fatalf("GetActiveAlerts() item = %+v", items[0])
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// 告警服务未注入时不能静默返回空列表，否则前端会把「查询不可用」显示成「当前无活跃告警」。
func TestGetActiveAlerts_WithoutAlertServiceReturnsError(t *testing.T) {
	db, _, cleanup := newDashboardGormDBWithSQLMock(t)
	defer cleanup()

	service := dashboard.NewService(db, nil, nil, nil, nil, zap.NewNop())
	if _, _, err := service.GetActiveAlerts(context.Background(), 5); err == nil {
		t.Fatalf("GetActiveAlerts() expected error without alert service")
	}
}

// 总览响应 JSON 契约：字段名为 active_alerts，旧字段 recent_alerts 不再输出。
func TestOverviewResponse_ActiveAlertsJSONContract(t *testing.T) {
	raw, err := json.Marshal(dashboard.OverviewResponse{ActiveAlerts: []dashboard.RecentAlert{}})
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	body := string(raw)
	if !strings.Contains(body, `"active_alerts":[]`) {
		t.Fatalf("expected active_alerts in %s", body)
	}
	if strings.Contains(body, "recent_alerts") {
		t.Fatalf("recent_alerts should be gone: %s", body)
	}
}
