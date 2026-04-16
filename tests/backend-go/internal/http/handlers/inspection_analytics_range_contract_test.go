package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"go.uber.org/zap"
)

func TestGetStats_ShouldApplyExplicitAnalyticsRange(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:read"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	start, end := analyticsRangeBounds()

	mock.ExpectQuery(`SELECT count\(\*\) FROM "inspection_strategies"`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(5))
	mock.ExpectQuery(`SELECT count\(\*\) FROM "inspection_strategies".*enabled = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(3))
	mock.ExpectQuery(`SELECT count\(\*\) FROM "inspections".*started_at >= \$1 AND started_at <= \$2`).
		WithArgs(start, end).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(12))
	mock.ExpectQuery(`SELECT count\(\*\) FROM "inspections".*started_at >= \$1 AND started_at <= \$2 AND status = \$3 AND failed_checks = 0 AND warning_checks = 0`).
		WithArgs(start, end, inspection.StatusCompleted).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(8))
	mock.ExpectQuery(`SELECT AVG\(CASE WHEN total_checks > 0 THEN passed_checks::float / total_checks \* 100 ELSE NULL END\) AS avg_score FROM "inspections".*started_at >= \$1 AND started_at <= \$2 AND status = \$3`).
		WithArgs(start, end, inspection.StatusCompleted).
		WillReturnRows(sqlmock.NewRows([]string{"avg_score"}).AddRow(91.2))
	mock.ExpectQuery(`SELECT count\(\*\) FROM "inspections".*started_at >= \$1 AND started_at <= \$2`).
		WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`SELECT count\(\*\) FROM "inspections".*started_at >= \$1 AND started_at <= \$2 AND status = \$3 AND failed_checks = 0 AND warning_checks = 0`).
		WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), inspection.StatusCompleted).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`SELECT AVG\(CASE WHEN total_checks > 0 THEN passed_checks::float / total_checks \* 100 ELSE NULL END\) AS avg_score FROM "inspections".*started_at >= \$1 AND started_at <= \$2 AND status = \$3`).
		WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), inspection.StatusCompleted).
		WillReturnRows(sqlmock.NewRows([]string{"avg_score"}).AddRow(0))
	mock.ExpectQuery(`SELECT \* FROM "inspections".*completed_at IS NOT NULL.*completed_at >= \$1 AND completed_at <= \$2.*ORDER BY completed_at DESC.*LIMIT \$3`).
		WithArgs(start, end, 7).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "template_id", "schedule_id", "name", "trigger", "status",
			"scheduled_at", "started_at", "completed_at", "duration", "total_checks", "passed_checks",
			"failed_checks", "warning_checks", "skipped_checks", "error_message", "error_details",
			"timeout", "retry_count", "max_retries", "created_by", "created_at", "updated_at",
		}))

	ctx, rec := newEchoContextWithBody(
		http.MethodGet,
		"/api/v1/inspection/stats?period=month&start_date=2026-03-01&end_date=2026-03-31",
		token,
		nil,
	)

	if err := h.GetStats(ctx); err != nil {
		t.Fatalf("GetStats: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, want %d", rec.Code, http.StatusOK)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestGetDeviceDistribution_ShouldApplyExplicitAnalyticsRange(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:read"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	mock.ExpectQuery(`SELECT .*device_type.*COUNT\(DISTINCT.*device_id.* AS count.*FROM .*inspections.*JOIN .*devices.*started_at >= \$1 AND .*started_at <= \$2.*GROUP BY .*device_type`).
		WithArgs(analyticsRangeBounds()).
		WillReturnRows(sqlmock.NewRows([]string{"device_type", "count"}).AddRow("switch", 4))

	ctx, rec := newEchoContextWithBody(
		http.MethodGet,
		"/api/v1/inspection/device-distribution?period=month&start_date=2026-03-01&end_date=2026-03-31",
		token,
		nil,
	)

	if err := h.GetDeviceDistribution(ctx); err != nil {
		t.Fatalf("GetDeviceDistribution: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, want %d", rec.Code, http.StatusOK)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestGetProblemDistribution_ShouldApplyExplicitAnalyticsRange(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:read"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	start, end := analyticsRangeBounds()
	mock.ExpectQuery(`SELECT .*check_item_type AS category, COUNT\(\*\) AS count.*FROM .*inspection_results.*JOIN .*inspections.*started_at >= \$1 AND .*started_at <= \$2.*status IN.*GROUP BY .*check_item_type`).
		WithArgs(start, end, sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"category", "count"}).AddRow("cpu_usage", 6))

	ctx, rec := newEchoContextWithBody(
		http.MethodGet,
		"/api/v1/inspection/problem-distribution?period=month&start_date=2026-03-01&end_date=2026-03-31",
		token,
		nil,
	)

	if err := h.GetProblemDistribution(ctx); err != nil {
		t.Fatalf("GetProblemDistribution: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, want %d", rec.Code, http.StatusOK)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func analyticsRangeBounds() (time.Time, time.Time) {
	start := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 3, 31, 23, 59, 59, 999999999, time.UTC)
	return start, end
}

func TestGetTrends_ShouldApplyExplicitAnalyticsRangeUsingStartedAt(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:read"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	start, end := analyticsRangeBounds()
	mock.ExpectQuery(`SELECT .*date_trunc\('month', started_at\).*FROM "inspections".*started_at >= \$1 AND started_at <= \$2.*GROUP BY "date".*ORDER BY date ASC`).
		WithArgs(start, end).
		WillReturnRows(sqlmock.NewRows([]string{"date", "executions", "success", "failed", "avg_score"}).
			AddRow(time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC), 12, 10, 2, 91.2))

	ctx, rec := newEchoContextWithBody(
		http.MethodGet,
		"/api/v1/inspection/trends?period=month&start_date=2026-03-01&end_date=2026-03-31",
		token,
		nil,
	)

	if err := h.GetTrends(ctx); err != nil {
		t.Fatalf("GetTrends: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, want %d", rec.Code, http.StatusOK)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestGetStats_ShouldReturnRecentCompletedExecutionsWithPreciseCompletedTime(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:read"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	start, end := analyticsRangeBounds()
	completedAt := time.Date(2026, 3, 30, 18, 45, 12, 0, time.UTC)
	startedAt := completedAt.Add(-5 * time.Minute)
	scheduleID := 9

	mock.ExpectQuery(`SELECT count\(\*\) FROM "inspection_strategies"`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(5))
	mock.ExpectQuery(`SELECT count\(\*\) FROM "inspection_strategies".*enabled = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(3))
	mock.ExpectQuery(`SELECT count\(\*\) FROM "inspections".*started_at >= \$1 AND started_at <= \$2`).
		WithArgs(start, end).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))
	mock.ExpectQuery(`SELECT count\(\*\) FROM "inspections".*started_at >= \$1 AND started_at <= \$2 AND status = \$3 AND failed_checks = 0 AND warning_checks = 0`).
		WithArgs(start, end, inspection.StatusCompleted).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	mock.ExpectQuery(`SELECT AVG\(CASE WHEN total_checks > 0 THEN passed_checks::float / total_checks \* 100 ELSE NULL END\) AS avg_score FROM "inspections".*started_at >= \$1 AND started_at <= \$2 AND status = \$3`).
		WithArgs(start, end, inspection.StatusCompleted).
		WillReturnRows(sqlmock.NewRows([]string{"avg_score"}).AddRow(91.2))
	mock.ExpectQuery(`SELECT count\(\*\) FROM "inspections".*started_at >= \$1 AND started_at <= \$2`).
		WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`SELECT count\(\*\) FROM "inspections".*started_at >= \$1 AND started_at <= \$2 AND status = \$3 AND failed_checks = 0 AND warning_checks = 0`).
		WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), inspection.StatusCompleted).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`SELECT AVG\(CASE WHEN total_checks > 0 THEN passed_checks::float / total_checks \* 100 ELSE NULL END\) AS avg_score FROM "inspections".*started_at >= \$1 AND started_at <= \$2 AND status = \$3`).
		WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), inspection.StatusCompleted).
		WillReturnRows(sqlmock.NewRows([]string{"avg_score"}).AddRow(0))
	mock.ExpectQuery(`SELECT \* FROM "inspections".*completed_at IS NOT NULL.*completed_at >= \$1 AND completed_at <= \$2.*ORDER BY completed_at DESC.*LIMIT \$3`).
		WithArgs(start, end, 7).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "template_id", "schedule_id", "name", "trigger", "status",
			"scheduled_at", "started_at", "completed_at", "duration", "total_checks", "passed_checks",
			"failed_checks", "warning_checks", "skipped_checks", "error_message", "error_details",
			"timeout", "retry_count", "max_retries", "created_by", "created_at", "updated_at",
		}).AddRow(
			101, 1, nil, scheduleID, nil, inspection.TriggerManual, inspection.StatusCompleted,
			nil, startedAt, completedAt, 300, 10, 9, 1, 0, 0, nil, []byte(`{}`),
			nil, nil, nil, nil, startedAt, completedAt,
		))
	mock.ExpectQuery(`SELECT id, name FROM "inspection_strategies" WHERE id IN \(\$1\)`).
		WithArgs(scheduleID).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name"}).AddRow(scheduleID, "核心巡检策略"))

	ctx, rec := newEchoContextWithBody(
		http.MethodGet,
		"/api/v1/inspection/stats?period=month&start_date=2026-03-01&end_date=2026-03-31",
		token,
		nil,
	)

	if err := h.GetStats(ctx); err != nil {
		t.Fatalf("GetStats: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var payload struct {
		Data struct {
			RecentExecutions []struct {
				ID           string `json:"id"`
				StrategyName string `json:"strategyName"`
				Status       string `json:"status"`
				EndTime      string `json:"endTime"`
			} `json:"recentExecutions"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("json.Unmarshal response: %v, body=%s", err, rec.Body.String())
	}
	if len(payload.Data.RecentExecutions) != 1 {
		t.Fatalf("recentExecutions length = %d, want 1, body=%s", len(payload.Data.RecentExecutions), rec.Body.String())
	}
	execution := payload.Data.RecentExecutions[0]
	if execution.ID != "101" {
		t.Fatalf("recentExecutions[0].id = %q, want 101", execution.ID)
	}
	if execution.StrategyName != "核心巡检策略" {
		t.Fatalf("recentExecutions[0].strategyName = %q, want 核心巡检策略", execution.StrategyName)
	}
	if execution.Status != inspection.StatusCompleted {
		t.Fatalf("recentExecutions[0].status = %q, want %q", execution.Status, inspection.StatusCompleted)
	}
	if execution.EndTime != completedAt.Format(time.RFC3339) {
		t.Fatalf("recentExecutions[0].endTime = %q, want %q", execution.EndTime, completedAt.Format(time.RFC3339))
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
