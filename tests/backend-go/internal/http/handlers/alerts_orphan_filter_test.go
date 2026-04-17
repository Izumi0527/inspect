package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"go.uber.org/zap"
)

func TestGetAlertStatistics_ShouldIgnoreAlertsOfDeletedDevices(t *testing.T) {
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	authService, token := newAuthServiceWithPermissions(t, []string{"alerts:read"})
	service := alerts.NewService(gormDB, zap.NewNop())
	handler := handlers.AlertsHandler{
		Service: service,
		Auth:    authService,
	}

	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM alerts AS a JOIN devices d ON d\.id = a\.device_id`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM alerts AS a JOIN devices d ON d\.id = a\.device_id WHERE a\.status IN \(\$1,\$2\)`).
		WithArgs("open", "acknowledged").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM alerts AS a JOIN devices d ON d\.id = a\.device_id WHERE a\.status = \$1`).
		WithArgs("acknowledged").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM alerts AS a JOIN devices d ON d\.id = a\.device_id WHERE a\.status IN \(\$1,\$2\)`).
		WithArgs("resolved", "closed").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`(?is)SELECT severity, COUNT\(\*\) as count FROM alerts AS a JOIN devices d ON d\.id = a\.device_id WHERE a\.status IN \(\$1,\$2\) GROUP BY "severity"`).
		WithArgs("open", "acknowledged").
		WillReturnRows(sqlmock.NewRows([]string{"severity", "count"}))
	mock.ExpectQuery(`(?is)SELECT category, COUNT\(\*\) as count FROM alerts AS a JOIN devices d ON d\.id = a\.device_id WHERE a\.status IN \(\$1,\$2\) GROUP BY "category"`).
		WithArgs("open", "acknowledged").
		WillReturnRows(sqlmock.NewRows([]string{"category", "count"}))
	mock.ExpectQuery(`(?is)SELECT a\.device_id, d\.name AS device_name, COUNT\(\*\) as count FROM alerts AS a JOIN devices d ON d\.id = a\.device_id WHERE a\.status IN \(\$1,\$2\) GROUP BY a\.device_id, d\.name ORDER BY count desc LIMIT \$3`).
		WithArgs("open", "acknowledged", 10).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "device_name", "count"}))
	mock.ExpectQuery(`(?is)SELECT a\.\*, d\.name AS device_name, d\.ip_address AS device_ip, r\.name AS rule_name FROM alerts AS a JOIN devices d ON d\.id = a\.device_id LEFT JOIN alert_rules r ON r\.id = a\.rule_id ORDER BY a\.last_occurred desc, a\.created_at desc LIMIT \$1`).
		WithArgs(5).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "title", "message", "category", "severity", "status", "device_name", "device_ip", "rule_name",
		}))
	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM "alerts" JOIN devices ON devices\.id = alerts\.device_id WHERE COALESCE\(alerts\.first_occurred, alerts\.created_at\) >= \$1`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM "alerts" JOIN devices ON devices\.id = alerts\.device_id WHERE COALESCE\(alerts\.first_occurred, alerts\.created_at\) >= \$1 AND COALESCE\(alerts\.first_occurred, alerts\.created_at\) < \$2`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM "alerts" JOIN devices ON devices\.id = alerts\.device_id WHERE COALESCE\(alerts\.first_occurred, alerts\.created_at\) >= \$1 AND COALESCE\(alerts\.first_occurred, alerts\.created_at\) < \$2`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	ctx, rec := newEchoContextWithBody(http.MethodGet, "/api/v1/alerts/statistics", token, nil)
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

	if got := int(payload["total_alerts"].(float64)); got != 0 {
		t.Fatalf("total_alerts = %d, want 0", got)
	}
	if got := int(payload["active_alerts"].(float64)); got != 0 {
		t.Fatalf("active_alerts = %d, want 0", got)
	}
	if got := int(payload["recent_24h"].(float64)); got != 0 {
		t.Fatalf("recent_24h = %d, want 0", got)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
