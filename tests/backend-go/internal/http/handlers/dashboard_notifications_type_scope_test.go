package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"
	"go.uber.org/zap/zaptest/observer"
)

// 通知中心按标签页（告警 / 消息）拉取与批量操作的作用域契约。
// 这些用例都用 observer 日志断言"未授权/不在作用域的源根本没被查询"：
// 若源查询被多余地发出，sqlmock 会拒绝，服务层记一条 Warn，日志数就不为 0。

func TestDashboardNotificationsHandler_TypeSystem_ShouldSkipAlertSource(t *testing.T) {
	core, observedLogs := observer.New(zap.WarnLevel)
	h, mock, cleanup := newDashboardNotificationsHandlerWithLogger(
		t,
		[]string{"alerts:read", "reports:read"},
		zap.New(core),
	)
	defer cleanup()

	expectDashboardReportNotificationQueries(mock, 2)
	expectEmptyDashboardNotificationStates(mock)

	ctx, rec := newEchoContextWithBody(http.MethodGet, "/api/v1/dashboard/notifications?type=system", "test-token", nil)
	ctx.QueryParams().Set("type", "system")

	if err := h.GetNotifications(ctx); err != nil {
		t.Fatalf("GetNotifications returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if observedLogs.Len() != 0 {
		t.Fatalf("unexpected warning logs = %d, want 0 (告警源不应被查询)", observedLogs.Len())
	}

	var resp dashboardNotificationsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("json.Unmarshal response: %v", err)
	}
	if len(resp.Notifications) != 2 {
		t.Fatalf("notification count = %d, want 2", len(resp.Notifications))
	}
	for _, item := range resp.Notifications {
		if item.Type != "system" {
			t.Fatalf("notification %q type = %q, want system", item.ID, item.Type)
		}
	}
	if resp.UnreadCount != 2 {
		t.Fatalf("unread_count = %d, want 2", resp.UnreadCount)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestDashboardNotificationsHandler_TypeAlert_ShouldOnlyQueryAlertSource(t *testing.T) {
	core, observedLogs := observer.New(zap.WarnLevel)
	h, mock, cleanup := newDashboardNotificationsHandlerWithLogger(
		t,
		[]string{"alerts:read", "reports:read", "inspections:read", "devices:read"},
		zap.New(core),
	)
	defer cleanup()

	expectDashboardAlertNotificationQueries(mock, 3)
	expectEmptyDashboardNotificationStates(mock)

	ctx, rec := newEchoContextWithBody(http.MethodGet, "/api/v1/dashboard/notifications?type=alert", "test-token", nil)
	ctx.QueryParams().Set("type", "alert")

	if err := h.GetNotifications(ctx); err != nil {
		t.Fatalf("GetNotifications returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if observedLogs.Len() != 0 {
		t.Fatalf("unexpected warning logs = %d, want 0 (系统消息源不应被查询)", observedLogs.Len())
	}

	var resp dashboardNotificationsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("json.Unmarshal response: %v", err)
	}
	if len(resp.Notifications) != 3 {
		t.Fatalf("notification count = %d, want 3", len(resp.Notifications))
	}
	for _, item := range resp.Notifications {
		if item.Type != "alert" {
			t.Fatalf("notification %q type = %q, want alert", item.ID, item.Type)
		}
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestDashboardNotificationsHandler_TypeAlertWithoutAlertPermission_ShouldQueryNothing(t *testing.T) {
	core, observedLogs := observer.New(zap.WarnLevel)
	h, mock, cleanup := newDashboardNotificationsHandlerWithLogger(
		t,
		[]string{"reports:read"},
		zap.New(core),
	)
	defer cleanup()

	ctx, rec := newEchoContextWithBody(http.MethodGet, "/api/v1/dashboard/notifications?type=alert", "test-token", nil)
	ctx.QueryParams().Set("type", "alert")

	if err := h.GetNotifications(ctx); err != nil {
		t.Fatalf("GetNotifications returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if observedLogs.Len() != 0 {
		t.Fatalf("unexpected warning logs = %d, want 0 (作用域外的报表源不应被查询)", observedLogs.Len())
	}

	var resp dashboardNotificationsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("json.Unmarshal response: %v", err)
	}
	if len(resp.Notifications) != 0 {
		t.Fatalf("notification count = %d, want 0", len(resp.Notifications))
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestDashboardNotificationsHandler_InvalidType_ShouldReturnBadRequest(t *testing.T) {
	h, mock, cleanup := newDashboardNotificationsHandler(t, []string{"alerts:read"})
	defer cleanup()

	ctx, _ := newEchoContextWithBody(http.MethodGet, "/api/v1/dashboard/notifications?type=bogus", "test-token", nil)
	ctx.QueryParams().Set("type", "bogus")

	err := h.GetNotifications(ctx)
	httpErr, ok := err.(*echo.HTTPError)
	if !ok {
		t.Fatalf("error type = %T, want *echo.HTTPError", err)
	}
	if httpErr.Code != http.StatusBadRequest {
		t.Fatalf("http code = %d, want %d", httpErr.Code, http.StatusBadRequest)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestDashboardNotificationsReadHandler_AllWithTypeSystem_ShouldOnlyMarkSystemSources(t *testing.T) {
	core, observedLogs := observer.New(zap.WarnLevel)
	h, mock, cleanup := newDashboardNotificationsHandlerWithLogger(
		t,
		[]string{"alerts:read", "reports:read"},
		zap.New(core),
	)
	defer cleanup()

	expectDashboardReportNotificationQueries(mock, 2)
	mock.ExpectQuery(`INSERT INTO .*user_notification_states.*`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(1))

	ctx, rec := newEchoContextWithBody(
		http.MethodPost,
		"/api/v1/dashboard/notifications/read",
		"test-token",
		[]byte(`{"all":true,"type":"system"}`),
	)

	if err := h.MarkNotificationsRead(ctx); err != nil {
		t.Fatalf("MarkNotificationsRead returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if observedLogs.Len() != 0 {
		t.Fatalf("unexpected warning logs = %d, want 0 (告警源不应被查询)", observedLogs.Len())
	}

	var resp dashboardNotificationActionResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("json.Unmarshal response: %v", err)
	}
	if resp.Updated != 2 {
		t.Fatalf("updated = %d, want 2", resp.Updated)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestDashboardNotificationsDismissHandler_AllWithTypeAlert_ShouldOnlyDismissAlertSource(t *testing.T) {
	core, observedLogs := observer.New(zap.WarnLevel)
	h, mock, cleanup := newDashboardNotificationsHandlerWithLogger(
		t,
		[]string{"alerts:read", "reports:read"},
		zap.New(core),
	)
	defer cleanup()

	expectDashboardAlertNotificationQueries(mock, 3)
	mock.ExpectQuery(`INSERT INTO .*user_notification_states.*`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(1))

	ctx, rec := newEchoContextWithBody(
		http.MethodPost,
		"/api/v1/dashboard/notifications/dismiss",
		"test-token",
		[]byte(`{"all":true,"type":"alert"}`),
	)

	if err := h.DismissNotifications(ctx); err != nil {
		t.Fatalf("DismissNotifications returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if observedLogs.Len() != 0 {
		t.Fatalf("unexpected warning logs = %d, want 0 (系统消息源不应被查询)", observedLogs.Len())
	}

	var resp dashboardNotificationActionResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("json.Unmarshal response: %v", err)
	}
	if resp.Updated != 3 {
		t.Fatalf("updated = %d, want 3", resp.Updated)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestDashboardNotificationsDismissHandler_InvalidType_ShouldReturnBadRequest(t *testing.T) {
	h, mock, cleanup := newDashboardNotificationsHandler(t, []string{"alerts:read"})
	defer cleanup()

	ctx, _ := newEchoContextWithBody(
		http.MethodPost,
		"/api/v1/dashboard/notifications/dismiss",
		"test-token",
		[]byte(`{"all":true,"type":"bogus"}`),
	)

	err := h.DismissNotifications(ctx)
	httpErr, ok := err.(*echo.HTTPError)
	if !ok {
		t.Fatalf("error type = %T, want *echo.HTTPError", err)
	}
	if httpErr.Code != http.StatusBadRequest {
		t.Fatalf("http code = %d, want %d", httpErr.Code, http.StatusBadRequest)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
