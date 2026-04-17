package handlers_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"
	"go.uber.org/zap/zaptest/observer"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/dashboard"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

type dashboardNotificationsResponse struct {
	Notifications []struct {
		ID      string  `json:"id"`
		Type    string  `json:"type"`
		Title   string  `json:"title"`
		Content string  `json:"content"`
		Read    bool    `json:"read"`
		Link    *string `json:"link"`
	} `json:"notifications"`
	UnreadCount int    `json:"unread_count"`
	LastUpdated string `json:"last_updated"`
}

type dashboardNotificationActionResponse struct {
	Updated int `json:"updated"`
}

type notificationContractAuthService struct {
	userID      string
	permissions []string
}

func (s notificationContractAuthService) GetActiveUserFromToken(_ context.Context, _ string) (*auth.UserRecord, error) {
	return &auth.UserRecord{
		ID:       s.userID,
		Username: "tester",
		Role:     "viewer",
	}, nil
}

func (s notificationContractAuthService) GetPermissionsByRole(_ context.Context, _ string) ([]string, error) {
	return append([]string{}, s.permissions...), nil
}

func newDashboardNotificationsHandler(t *testing.T, permissions []string) (handlers.DashboardHandler, sqlmock.Sqlmock, func()) {
	t.Helper()

	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	service := dashboard.NewService(gormDB, nil, nil, nil, nil, zap.NewNop())
	return handlers.DashboardHandler{
		Service: service,
		Auth: notificationContractAuthService{
			userID:      "user-1",
			permissions: permissions,
		},
	}, mock, cleanup
}

func newDashboardNotificationsHandlerWithLogger(
	t *testing.T,
	permissions []string,
	logger *zap.Logger,
) (handlers.DashboardHandler, sqlmock.Sqlmock, func()) {
	t.Helper()

	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	service := dashboard.NewService(gormDB, nil, nil, nil, nil, logger)
	return handlers.DashboardHandler{
		Service: service,
		Auth: notificationContractAuthService{
			userID:      "user-1",
			permissions: permissions,
		},
	}, mock, cleanup
}

func expectDashboardNotificationSourceQueries(mock sqlmock.Sqlmock, limit int) {
	expectDashboardNotificationSourceQueriesWithCounts(mock, dashboardNotificationFixtureCounts{
		Alerts:  1,
		Reports: 1,
	})
	_ = limit
}

func expectDashboardReportNotificationQueries(mock sqlmock.Sqlmock, count int) {
	expectDashboardNotificationSourceQueriesWithCounts(mock, dashboardNotificationFixtureCounts{
		Reports: count,
	})
}

func expectDashboardAlertNotificationQueries(mock sqlmock.Sqlmock, count int) {
	expectDashboardNotificationSourceQueriesWithCounts(mock, dashboardNotificationFixtureCounts{
		Alerts: count,
	})
}

type dashboardNotificationFixtureCounts struct {
	Alerts      int
	Inspections int
	Reports     int
	Scans       int
}

func expectDashboardNotificationSourceQueriesWithCounts(mock sqlmock.Sqlmock, counts dashboardNotificationFixtureCounts) {
	alertTime := time.Date(2026, 4, 2, 10, 0, 0, 0, time.UTC)
	reportTime := time.Date(2026, 4, 2, 9, 0, 0, 0, time.UTC)

	alertRows := sqlmock.NewRows([]string{
		"id",
		"message",
		"severity",
		"created_at",
		"category",
		"device_name",
	})
	for i := 0; i < counts.Alerts; i++ {
		alertRows.AddRow(
			101+i,
			fmt.Sprintf("告警消息-%d", i+1),
			"critical",
			alertTime.Add(-time.Duration(i)*time.Minute),
			"temperature",
			fmt.Sprintf("core-sw-%02d", i+1),
		)
	}
	if counts.Alerts > 0 {
		mock.ExpectQuery(`(?is)SELECT .*FROM alerts AS a JOIN devices d ON d\.id = a\.device_id.*`).
			WillReturnRows(alertRows)
	}

	inspectionRows := sqlmock.NewRows([]string{
		"id",
		"name",
		"status",
		"completed_at",
		"updated_at",
		"error_message",
	})
	for i := 0; i < counts.Inspections; i++ {
		ts := alertTime.Add(-time.Duration(i)*time.Hour - 30*time.Minute)
		inspectionRows.AddRow(
			301+i,
			fmt.Sprintf("巡检任务-%d", i+1),
			"completed",
			ts,
			ts,
			nil,
		)
	}

	if counts.Inspections > 0 {
		mock.ExpectQuery(`SELECT .*FROM .*inspections.*`).
			WillReturnRows(inspectionRows)
	}

	reportRows := sqlmock.NewRows([]string{
		"id",
		"title",
		"status",
		"generated_at",
		"updated_at",
		"error_message",
	})
	for i := 0; i < counts.Reports; i++ {
		ts := reportTime.Add(-time.Duration(i) * time.Hour)
		reportRows.AddRow(
			9+i,
			fmt.Sprintf("巡检周报-%d", i+1),
			"completed",
			ts,
			ts,
			nil,
		)
	}

	if counts.Reports > 0 {
		mock.ExpectQuery(`SELECT .*FROM .*reports.*`).
			WillReturnRows(reportRows)
	}

	scanRows := sqlmock.NewRows([]string{
		"id",
		"target_network",
		"status",
		"devices_found",
		"completed_at",
		"updated_at",
		"error_message",
	})
	for i := 0; i < counts.Scans; i++ {
		ts := reportTime.Add(-time.Duration(i)*time.Hour - 15*time.Minute)
		scanRows.AddRow(
			fmt.Sprintf("scan-%d", i+1),
			fmt.Sprintf("10.0.%d.0/24", i+1),
			"completed",
			5+i,
			ts,
			ts,
			nil,
		)
	}

	if counts.Scans > 0 {
		mock.ExpectQuery(`SELECT .*FROM .*network_scans.*`).
			WillReturnRows(scanRows)
	}
}

func expectEmptyDashboardNotificationStates(mock sqlmock.Sqlmock) {
	mock.ExpectQuery(`SELECT .*FROM .*user_notification_states.*`).
		WillReturnRows(sqlmock.NewRows([]string{
			"id",
			"user_id",
			"notification_id",
			"read_at",
			"dismissed_at",
			"created_at",
			"updated_at",
		}))
}

func assertRFC3339Timestamp(t *testing.T, value string) {
	t.Helper()

	if value == "" {
		t.Fatalf("时间字段不能为空")
	}
	if _, err := time.Parse(time.RFC3339Nano, value); err != nil {
		t.Fatalf("时间字段 %q 不是 RFC3339 时间: %v", value, err)
	}
}

func TestDashboardNotificationsHandler_ShouldReturnFilteredEnvelope(t *testing.T) {
	h, mock, cleanup := newDashboardNotificationsHandler(t, []string{"reports:read"})
	defer cleanup()

	expectDashboardReportNotificationQueries(mock, 1)
	mock.ExpectQuery(`SELECT .*FROM .*user_notification_states.*`).
		WillReturnRows(sqlmock.NewRows([]string{
			"id",
			"user_id",
			"notification_id",
			"read_at",
			"dismissed_at",
			"created_at",
			"updated_at",
		}).AddRow(
			1,
			"user-1",
			"report-9",
			time.Date(2026, 4, 2, 11, 0, 0, 0, time.UTC),
			nil,
			nil,
			nil,
		))

	ctx, rec := newEchoContextWithBody(http.MethodGet, "/api/v1/dashboard/notifications?limit=1", "test-token", nil)
	ctx.QueryParams().Set("limit", "1")

	if err := h.GetNotifications(ctx); err != nil {
		t.Fatalf("GetNotifications returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var resp dashboardNotificationsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("json.Unmarshal response: %v", err)
	}

	if len(resp.Notifications) != 1 {
		t.Fatalf("notification count = %d, want 1", len(resp.Notifications))
	}
	if resp.Notifications[0].ID != "report-9" {
		t.Fatalf("notification id = %q, want %q", resp.Notifications[0].ID, "report-9")
	}
	if resp.Notifications[0].Type != "system" {
		t.Fatalf("notification type = %q, want %q", resp.Notifications[0].Type, "system")
	}
	if !resp.Notifications[0].Read {
		t.Fatalf("notification read = false, want true")
	}
	if resp.UnreadCount != 0 {
		t.Fatalf("unread_count = %d, want 0", resp.UnreadCount)
	}
	if resp.LastUpdated == "" {
		t.Fatalf("last_updated should not be empty")
	}
	assertRFC3339Timestamp(t, resp.LastUpdated)

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestDashboardNotificationsHandler_ShouldQueryOnlyAuthorizedSources(t *testing.T) {
	core, observedLogs := observer.New(zap.WarnLevel)
	h, mock, cleanup := newDashboardNotificationsHandlerWithLogger(
		t,
		[]string{"reports:read"},
		zap.New(core),
	)
	defer cleanup()

	reportTime := time.Date(2026, 4, 2, 9, 0, 0, 0, time.UTC)
	mock.ExpectQuery(`SELECT .*FROM .*reports.*`).
		WillReturnRows(sqlmock.NewRows([]string{
			"id",
			"title",
			"status",
			"generated_at",
			"updated_at",
			"error_message",
		}).AddRow(
			9,
			"巡检周报",
			"completed",
			reportTime,
			reportTime,
			nil,
		))
	expectEmptyDashboardNotificationStates(mock)

	ctx, rec := newEchoContextWithBody(http.MethodGet, "/api/v1/dashboard/notifications", "test-token", nil)

	if err := h.GetNotifications(ctx); err != nil {
		t.Fatalf("GetNotifications returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	if observedLogs.Len() != 0 {
		t.Fatalf("unexpected warning logs = %d, want 0", observedLogs.Len())
	}

	var resp dashboardNotificationsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("json.Unmarshal response: %v", err)
	}
	if len(resp.Notifications) != 1 || resp.Notifications[0].ID != "report-9" {
		t.Fatalf("notifications = %+v, want only report-9", resp.Notifications)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestDashboardNotificationsHandler_ShouldClampLimitTo50(t *testing.T) {
	h, mock, cleanup := newDashboardNotificationsHandler(t, []string{"alerts:read"})
	defer cleanup()

	expectDashboardAlertNotificationQueries(mock, 60)
	expectEmptyDashboardNotificationStates(mock)

	ctx, rec := newEchoContextWithBody(http.MethodGet, "/api/v1/dashboard/notifications?limit=999", "test-token", nil)
	ctx.QueryParams().Set("limit", "999")

	if err := h.GetNotifications(ctx); err != nil {
		t.Fatalf("GetNotifications returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var resp dashboardNotificationsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("json.Unmarshal response: %v", err)
	}

	if len(resp.Notifications) != 50 {
		t.Fatalf("notification count = %d, want 50", len(resp.Notifications))
	}
	if resp.UnreadCount != 50 {
		t.Fatalf("unread_count = %d, want 50", resp.UnreadCount)
	}
	assertRFC3339Timestamp(t, resp.LastUpdated)

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestDashboardNotificationsHandler_ShouldDefaultLimitTo20WhenMissingOrInvalid(t *testing.T) {
	testCases := []struct {
		name      string
		rawQuery  string
		queryName string
		queryVal  string
	}{
		{
			name:     "missing",
			rawQuery: "/api/v1/dashboard/notifications",
		},
		{
			name:      "invalid",
			rawQuery:  "/api/v1/dashboard/notifications?limit=abc",
			queryName: "limit",
			queryVal:  "abc",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			h, mock, cleanup := newDashboardNotificationsHandler(t, []string{"alerts:read"})
			defer cleanup()

			expectDashboardAlertNotificationQueries(mock, 25)
			expectEmptyDashboardNotificationStates(mock)

			ctx, rec := newEchoContextWithBody(http.MethodGet, tc.rawQuery, "test-token", nil)
			if tc.queryName != "" {
				ctx.QueryParams().Set(tc.queryName, tc.queryVal)
			}

			if err := h.GetNotifications(ctx); err != nil {
				t.Fatalf("GetNotifications returned error: %v", err)
			}
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
			}

			var resp dashboardNotificationsResponse
			if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
				t.Fatalf("json.Unmarshal response: %v", err)
			}

			if len(resp.Notifications) != 20 {
				t.Fatalf("notification count = %d, want 20", len(resp.Notifications))
			}
			if resp.UnreadCount != 20 {
				t.Fatalf("unread_count = %d, want 20", resp.UnreadCount)
			}
			assertRFC3339Timestamp(t, resp.LastUpdated)

			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("sqlmock expectations not met: %v", err)
			}
		})
	}
}

func TestDashboardNotificationsHandler_ShouldReturnEmptyEnvelopeWhenNoVisibleNotifications(t *testing.T) {
	h, mock, cleanup := newDashboardNotificationsHandler(t, nil)
	defer cleanup()

	ctx, rec := newEchoContextWithBody(http.MethodGet, "/api/v1/dashboard/notifications", "test-token", nil)

	if err := h.GetNotifications(ctx); err != nil {
		t.Fatalf("GetNotifications returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var resp dashboardNotificationsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("json.Unmarshal response: %v", err)
	}

	if len(resp.Notifications) != 0 {
		t.Fatalf("notification count = %d, want 0", len(resp.Notifications))
	}
	if resp.UnreadCount != 0 {
		t.Fatalf("unread_count = %d, want 0", resp.UnreadCount)
	}
	assertRFC3339Timestamp(t, resp.LastUpdated)

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestDashboardNotificationsReadHandler_ShouldOnlyUpdateVisibleIDs(t *testing.T) {
	h, mock, cleanup := newDashboardNotificationsHandler(t, []string{"reports:read"})
	defer cleanup()

	expectDashboardReportNotificationQueries(mock, 1)
	mock.ExpectQuery(`INSERT INTO .*user_notification_states.*`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(1))

	ctx, rec := newEchoContextWithBody(
		http.MethodPost,
		"/api/v1/dashboard/notifications/read",
		"test-token",
		[]byte(`{"ids":["alert-101","report-9"]}`),
	)

	if err := h.MarkNotificationsRead(ctx); err != nil {
		t.Fatalf("MarkNotificationsRead returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var resp dashboardNotificationActionResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("json.Unmarshal response: %v", err)
	}
	if resp.Updated != 1 {
		t.Fatalf("updated = %d, want 1", resp.Updated)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestDashboardNotificationsDismissHandler_ShouldOnlyDismissVisibleIDs(t *testing.T) {
	h, mock, cleanup := newDashboardNotificationsHandler(t, []string{"reports:read"})
	defer cleanup()

	expectDashboardReportNotificationQueries(mock, 1)
	mock.ExpectQuery(`INSERT INTO .*user_notification_states.*`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(1))

	ctx, rec := newEchoContextWithBody(
		http.MethodPost,
		"/api/v1/dashboard/notifications/dismiss",
		"test-token",
		[]byte(`{"ids":["alert-101","report-9"]}`),
	)

	if err := h.DismissNotifications(ctx); err != nil {
		t.Fatalf("DismissNotifications returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var resp dashboardNotificationActionResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("json.Unmarshal response: %v", err)
	}
	if resp.Updated != 1 {
		t.Fatalf("updated = %d, want 1", resp.Updated)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestDashboardNotificationsReadHandler_ShouldMarkAllVisibleNotificationsWhenAllTrue(t *testing.T) {
	h, mock, cleanup := newDashboardNotificationsHandler(t, []string{"reports:read"})
	defer cleanup()

	expectDashboardReportNotificationQueries(mock, 2)
	mock.ExpectQuery(`INSERT INTO .*user_notification_states.*`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(1))

	ctx, rec := newEchoContextWithBody(
		http.MethodPost,
		"/api/v1/dashboard/notifications/read",
		"test-token",
		[]byte(`{"all":true}`),
	)

	if err := h.MarkNotificationsRead(ctx); err != nil {
		t.Fatalf("MarkNotificationsRead returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
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

func TestDashboardNotificationsDismissHandler_ShouldDismissAllVisibleNotificationsWhenAllTrue(t *testing.T) {
	h, mock, cleanup := newDashboardNotificationsHandler(t, []string{"reports:read"})
	defer cleanup()

	expectDashboardReportNotificationQueries(mock, 2)
	mock.ExpectQuery(`INSERT INTO .*user_notification_states.*`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(1))

	ctx, rec := newEchoContextWithBody(
		http.MethodPost,
		"/api/v1/dashboard/notifications/dismiss",
		"test-token",
		[]byte(`{"all":true}`),
	)

	if err := h.DismissNotifications(ctx); err != nil {
		t.Fatalf("DismissNotifications returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
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
