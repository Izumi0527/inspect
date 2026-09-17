package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

// 告警通知须携带告警状态：通知中心是历史信息流，已解决/已确认的告警仍会出现在最近 20 条里，
// 前端需要据 status 标注并降低视觉权重，而不是把已恢复的告警继续按活跃告警展示。
func TestDashboardNotificationsHandler_AlertStatus_ShouldBeCarriedPerNotification(t *testing.T) {
	h, mock, cleanup := newDashboardNotificationsHandler(t, []string{"alerts:read"})
	defer cleanup()

	alertTime := time.Date(2026, 9, 18, 8, 0, 0, 0, time.UTC)
	rows := sqlmock.NewRows([]string{"id", "message", "severity", "status", "created_at", "category", "device_name"}).
		AddRow(201, "设备离线", "critical", "resolved", alertTime, "connectivity", "core-sw-01").
		AddRow(202, "CPU 过高", "warning", "acknowledged", alertTime.Add(-time.Minute), "performance", "core-sw-02").
		AddRow(203, "风扇异常", "critical", "active", alertTime.Add(-2*time.Minute), "hardware", "core-sw-03")
	mock.ExpectQuery(`(?is)SELECT .*a\.status.*FROM alerts AS a JOIN devices d ON d\.id = a\.device_id.*`).
		WillReturnRows(rows)
	expectEmptyDashboardNotificationStates(mock)

	ctx, rec := newEchoContextWithBody(http.MethodGet, "/api/v1/dashboard/notifications", "test-token", nil)
	if err := h.GetNotifications(ctx); err != nil {
		t.Fatalf("GetNotifications returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var resp struct {
		Notifications []struct {
			ID       string  `json:"id"`
			Status   *string `json:"status"`
			Severity string  `json:"severity"`
		} `json:"notifications"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("json.Unmarshal response: %v", err)
	}
	if len(resp.Notifications) != 3 {
		t.Fatalf("notification count = %d, want 3", len(resp.Notifications))
	}

	want := map[string]string{"alert-201": "resolved", "alert-202": "acknowledged", "alert-203": "active"}
	for _, item := range resp.Notifications {
		if item.Status == nil {
			t.Fatalf("notification %q status missing", item.ID)
		}
		if *item.Status != want[item.ID] {
			t.Fatalf("notification %q status = %q, want %q", item.ID, *item.Status, want[item.ID])
		}
	}
	// 严重级别保持原值：状态是独立维度，不能把 resolved 折叠进 severity 丢掉原始等级
	if resp.Notifications[0].Severity != "critical" {
		t.Fatalf("resolved alert severity = %q, want critical", resp.Notifications[0].Severity)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
