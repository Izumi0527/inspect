package handlers_test

import (
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
	mock.ExpectQuery(`SELECT count\(\*\) FROM "inspections".*created_at >= \$1 AND created_at <= \$2`).
		WithArgs(start, end).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(12))
	mock.ExpectQuery(`SELECT count\(\*\) FROM "inspections".*created_at >= \$1 AND created_at <= \$2 AND status = \$3`).
		WithArgs(start, end, inspection.StatusCompleted).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(10))
	mock.ExpectQuery(`SELECT AVG\(CASE WHEN total_checks > 0 THEN passed_checks::float / total_checks \* 100 ELSE NULL END\) AS avg_score FROM "inspections".*created_at >= \$1 AND created_at <= \$2 AND status = \$3`).
		WithArgs(start, end, inspection.StatusCompleted).
		WillReturnRows(sqlmock.NewRows([]string{"avg_score"}).AddRow(91.2))

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

	mock.ExpectQuery(`SELECT .*device_type.*COUNT\(DISTINCT.*device_id.* AS count.*FROM .*inspections.*JOIN .*devices.*created_at >= \$1 AND .*created_at <= \$2.*GROUP BY .*device_type`).
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
	mock.ExpectQuery(`SELECT .*check_item_type AS category, COUNT\(\*\) AS count.*FROM .*inspection_results.*JOIN .*inspections.*created_at >= \$1 AND .*created_at <= \$2.*status IN.*GROUP BY .*check_item_type`).
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
