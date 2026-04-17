package handlers_test

import (
	"net/http"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/reports"
	"go.uber.org/zap"
)

func TestReportsHandler_GetTrendAnalysis_ShouldIgnoreDeletedDeviceAlertsInErrorSeries(t *testing.T) {
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	authService, token := newAuthServiceWithPermissions(t, []string{"reports:read"})
	service := reports.NewService(gormDB, zap.NewNop())
	h := handlers.ReportsHandler{
		Service: service,
		Auth:    authService,
	}

	mock.ExpectQuery(`(?is)SELECT .*COUNT\(\*\) AS value.*FROM alerts AS a JOIN devices d ON d\.id = a\.device_id.*GROUP BY .*bucket.*`).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "value"}))

	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/reports/trends/analysis", token, []byte(`{
		"metrics":["errors"],
		"startDate":"2026-04-01T00:00:00Z",
		"endDate":"2026-04-02T00:00:00Z",
		"granularity":"day"
	}`))

	if err := h.GetTrendAnalysis(ctx); err != nil {
		t.Fatalf("GetTrendAnalysis() error = %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestReportsHandler_GetStatisticsKPI_ShouldIgnoreDeletedDeviceAlerts(t *testing.T) {
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	authService, token := newAuthServiceWithPermissions(t, []string{"reports:read"})
	service := reports.NewService(gormDB, zap.NewNop())
	h := handlers.ReportsHandler{
		Service: service,
		Auth:    authService,
	}

	mock.ExpectQuery(`(?is)SELECT .* FROM .*devices.*`).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "name", "device_type", "status", "uptime", "response_time", "cpu_usage", "memory_usage", "location", "group_id",
		}).AddRow(1, "core-sw-01", "switch", "online", 7200, 12.5, 35.0, 48.0, "A1", 1))
	mock.ExpectQuery(`(?is)SELECT COUNT\(\*\) AS total_executions,.*FROM .*inspections.*`).
		WillReturnRows(sqlmock.NewRows([]string{
			"total_executions", "completed_executions", "failed_executions", "total_checks", "passed_checks", "failed_checks", "warning_checks",
		}).AddRow(0, 0, 0, 0, 0, 0, 0))
	mock.ExpectQuery(`(?is)SELECT AVG\(r\.score\) AS avg_score FROM inspection_results AS r JOIN inspections i ON i\.id = r\.inspection_id.*`).
		WillReturnRows(sqlmock.NewRows([]string{"avg_score"}).AddRow(nil))
	mock.ExpectQuery(`(?is)SELECT COUNT\(\*\) AS total,.*FROM alerts AS a JOIN devices d ON d\.id = a\.device_id WHERE .*a\.created_at >= .*`).
		WillReturnRows(sqlmock.NewRows([]string{"total", "resolved", "severe"}).AddRow(0, 0, 0))

	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/reports/statistics/kpi", token, []byte(`{
		"startDate":"2026-04-01T00:00:00Z",
		"endDate":"2026-04-02T00:00:00Z"
	}`))

	if err := h.GetStatisticsKPI(ctx); err != nil {
		t.Fatalf("GetStatisticsKPI() error = %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestReportsHandler_GetStatisticsRankings_ShouldIgnoreDeletedDeviceAlerts(t *testing.T) {
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	authService, token := newAuthServiceWithPermissions(t, []string{"reports:read"})
	service := reports.NewService(gormDB, zap.NewNop())
	h := handlers.ReportsHandler{
		Service: service,
		Auth:    authService,
	}

	mock.ExpectQuery(`(?is)SELECT .* FROM .*devices.*`).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "name", "device_type", "status", "uptime", "response_time", "cpu_usage", "memory_usage", "location", "group_id",
		}).AddRow(1, "core-sw-01", "switch", "online", 7200, 12.5, 35.0, 48.0, "A1", 1))
	mock.ExpectQuery(`(?is)SELECT device_id,.*FROM .*device_metrics.*`).
		WillReturnRows(sqlmock.NewRows([]string{
			"device_id", "response_time", "cpu_usage", "memory_usage", "disk_usage", "bandwidth_utilization",
		}))
	mock.ExpectQuery(`(?is)SELECT EXISTS \(SELECT 1 FROM information_schema\.tables.*table_name = .*`).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	mock.ExpectQuery(`(?is)SELECT .*COUNT\(\*\) AS total,.*FROM alerts AS a JOIN devices d ON d\.id = a\.device_id WHERE .*a\.created_at >= .*`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "total", "severe", "resolved"}))

	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/reports/statistics/rankings", token, []byte(`{
		"startDate":"2026-04-01T00:00:00Z",
		"endDate":"2026-04-02T00:00:00Z",
		"topN":1
	}`))

	if err := h.GetStatisticsRankings(ctx); err != nil {
		t.Fatalf("GetStatisticsRankings() error = %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
