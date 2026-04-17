package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/reports"
	"go.uber.org/zap"
)

func TestReportsHandler_GetAlertStatistics_ShouldIgnoreAlertsOfDeletedDevices(t *testing.T) {
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	authService, token := newAuthServiceWithPermissions(t, []string{"reports:read"})
	service := reports.NewService(gormDB, zap.NewNop())
	handler := handlers.ReportsHandler{
		Service: service,
		Auth:    authService,
	}

	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM alerts AS a JOIN devices d ON d\.id = a\.device_id`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`(?is)SELECT severity, COUNT\(\*\) AS count FROM alerts AS a JOIN devices d ON d\.id = a\.device_id GROUP BY "severity"`).
		WillReturnRows(sqlmock.NewRows([]string{"severity", "count"}))
	mock.ExpectQuery(`(?is)SELECT a\.device_id, COUNT\(\*\) AS count FROM alerts AS a JOIN devices d ON d\.id = a\.device_id GROUP BY "a"\."device_id"`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "count"}))
	mock.ExpectQuery(`(?is)SELECT COALESCE\(AVG\(EXTRACT\(EPOCH FROM \(COALESCE\(a\.resolved_at, a\.closed_at\) - a\.created_at\)\) / 3600\.0\), 0\) AS avg_resolution_time FROM alerts AS a JOIN devices d ON d\.id = a\.device_id WHERE a\.created_at IS NOT NULL AND COALESCE\(a\.resolved_at, a\.closed_at\) IS NOT NULL AND a\.status IN \(\$1,\$2\)`).
		WithArgs("resolved", "closed").
		WillReturnRows(sqlmock.NewRows([]string{"avg_resolution_time"}).AddRow(0))
	mock.ExpectQuery(`(?is)SELECT date_trunc\('day', a\.created_at\) AS bucket,\s*COUNT\(\*\) AS total,\s*SUM\(CASE WHEN a\.status IN \('resolved', 'closed'\) THEN 1 ELSE 0 END\) AS resolved,\s*SUM\(CASE WHEN a\.severity IN \('critical', 'error', 'fatal'\) THEN 1 ELSE 0 END\) AS severe FROM alerts AS a JOIN devices d ON d\.id = a\.device_id WHERE a\.created_at >= \$1 AND a\.created_at <= \$2 GROUP BY "bucket" ORDER BY bucket`).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "total", "resolved", "severe"}))

	ctx, rec := newEchoContextWithBody(http.MethodGet, "/api/v1/reports/statistics/alerts", token, nil)
	if err := handler.GetAlertStatistics(ctx); err != nil {
		t.Fatalf("GetAlertStatistics() error = %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", rec.Code, rec.Body.String())
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("invalid json: %v, body=%s", err, rec.Body.String())
	}

	data, ok := payload["data"].(map[string]interface{})
	if !ok {
		t.Fatalf("data should be object, got %T", payload["data"])
	}
	if got := int(data["total_alerts"].(float64)); got != 0 {
		t.Fatalf("data.total_alerts = %d, want 0", got)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
