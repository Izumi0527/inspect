package monitoring_test

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestGetMonitoringStats_ShouldExcludeDeletedDeviceAlerts(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	mock.ExpectQuery(`SELECT count\(\*\) FROM "devices" WHERE is_active = \$1`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`SELECT count\(\*\) FROM "devices" WHERE is_active = \$1 AND status = \$2`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM alerts AS a JOIN devices d ON d\.id = a\.device_id WHERE .*status IN .*`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	// CPU：最新采集样本查询（窗口内无样本）→ 回退 devices 快照平均
	mock.ExpectQuery(`(?is)SELECT AVG\(metric_value\) AS avg_value, COUNT\(\*\) AS sample_count FROM \(SELECT DISTINCT ON \(device_id\).*metric_name = \$1.*\) AS latest_samples`).
		WillReturnRows(sqlmock.NewRows([]string{"avg_value", "sample_count"}).AddRow(nil, 0))
	mock.ExpectQuery(`SELECT AVG\(cpu_usage\) AS avg_value FROM "devices" WHERE is_active = \$1`).
		WillReturnRows(sqlmock.NewRows([]string{"avg_value"}).AddRow(nil))
	// 内存：同上
	mock.ExpectQuery(`(?is)SELECT AVG\(metric_value\) AS avg_value, COUNT\(\*\) AS sample_count FROM \(SELECT DISTINCT ON \(device_id\).*metric_name = \$1.*\) AS latest_samples`).
		WillReturnRows(sqlmock.NewRows([]string{"avg_value", "sample_count"}).AddRow(nil, 0))
	mock.ExpectQuery(`SELECT AVG\(memory_usage\) AS avg_value FROM "devices" WHERE is_active = \$1`).
		WillReturnRows(sqlmock.NewRows([]string{"avg_value"}).AddRow(nil))
	mock.ExpectQuery(`(?is)WITH time_buckets AS .*FROM device_metrics.*`).
		WillReturnRows(sqlmock.NewRows([]string{"peak_value", "sample_count"}).AddRow(0.0, 1))

	stats, err := writer.GetMonitoringStats(context.Background(), nil)
	if err != nil {
		t.Fatalf("GetMonitoringStats() error = %v", err)
	}
	if stats.ActiveAlerts != 0 {
		t.Fatalf("GetMonitoringStats() active_alerts = %d, want 0", stats.ActiveAlerts)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestExportMonitoringReport_ShouldExcludeDeletedDeviceAlerts(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	mock.ExpectQuery(`(?is)SELECT a\.id,.*FROM alerts a JOIN devices d ON d\.id = a\.device_id WHERE a\.created_at >= .*`).
		WillReturnRows(sqlmock.NewRows([]string{
			"id",
			"device_id",
			"device_name",
			"title",
			"severity",
			"status",
			"message",
			"created_at",
			"last_occurred",
		}))

	result, err := writer.ExportMonitoringReport(context.Background(), monitoring.MonitoringReportExportRequest{
		Format:    "csv",
		TimeRange: "24h",
		Sections:  []string{"alerts"},
	}, t.TempDir())
	if err != nil {
		t.Fatalf("ExportMonitoringReport() error = %v", err)
	}
	if result.FileName == "" {
		t.Fatalf("ExportMonitoringReport() file_name is empty")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestGetMonitoringOverview_ShouldExcludeDeletedDeviceAlerts(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	mock.ExpectQuery(`SELECT count\(\*\) FROM "devices" WHERE is_active = \$1`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`SELECT count\(\*\) FROM "devices" WHERE is_active = \$1 AND status = \$2`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`SELECT count\(\*\) FROM alerts AS a JOIN devices d ON d\.id = a\.device_id`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`SELECT AVG\(response_time\) AS avg_value FROM "devices" WHERE is_active = \$1`).
		WillReturnRows(sqlmock.NewRows([]string{"avg_value"}).AddRow(nil))

	overview, err := writer.GetMonitoringOverview(context.Background())
	if err != nil {
		t.Fatalf("GetMonitoringOverview() error = %v", err)
	}
	if overview.TotalAlerts != 0 {
		t.Fatalf("GetMonitoringOverview() total_alerts = %d, want 0", overview.TotalAlerts)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func newMonitoringGormDBWithSQLMock(t *testing.T) (*gorm.DB, sqlmock.Sqlmock, func()) {
	t.Helper()

	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}

	gormDB, err := gorm.Open(postgres.New(postgres.Config{
		Conn:                 sqlDB,
		PreferSimpleProtocol: true,
	}), &gorm.Config{
		SkipDefaultTransaction: true,
		DisableAutomaticPing:   true,
	})
	if err != nil {
		_ = sqlDB.Close()
		t.Fatalf("gorm.Open: %v", err)
	}

	cleanup := func() {
		_ = sqlDB.Close()
	}
	return gormDB, mock, cleanup
}
