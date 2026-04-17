package devices_test

import (
	"context"
	"testing"
	_ "unsafe"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

//go:linkname buildDeviceStatistics github.com/your-org/inspect-system/backend-go/internal/devices.buildDeviceStatistics
func buildDeviceStatistics(
	total int64,
	online int64,
	offline int64,
	warning int64,
	totalAlerts int64,
	alertingDevices int64,
	typeDistribution map[string]int,
) devices.DeviceStatistics

func TestGetDeviceStatistics_ShouldUseActiveAlertsInsteadOfDeviceAlertCache(t *testing.T) {
	stats := buildDeviceStatistics(
		3,
		1,
		1,
		1,
		3,
		2,
		map[string]int{
			"router":   1,
			"switch":   1,
			"firewall": 1,
		},
	)

	if stats.TotalDevices != 3 {
		t.Fatalf("TotalDevices = %d, want 3", stats.TotalDevices)
	}
	if stats.WarningDevices != 1 {
		t.Fatalf("WarningDevices = %d, want 1", stats.WarningDevices)
	}
	if stats.TotalAlerts != 3 {
		t.Fatalf("TotalAlerts = %d, want 3 active alerts", stats.TotalAlerts)
	}
	if stats.AlertingDevices != 2 {
		t.Fatalf("AlertingDevices = %d, want 2", stats.AlertingDevices)
	}
	if stats.TypeDistribution["router"] != 1 {
		t.Fatalf("router distribution = %d, want 1", stats.TypeDistribution["router"])
	}
}

func TestBuildDeviceStatistics_ShouldNotGenerateNegativeUnknownDevices(t *testing.T) {
	stats := buildDeviceStatistics(1, 1, 1, 1, 0, 0, nil)

	if stats.UnknownDevices != 0 {
		t.Fatalf("UnknownDevices = %d, want 0", stats.UnknownDevices)
	}
	if len(stats.TypeDistribution) != 0 {
		t.Fatalf("TypeDistribution length = %d, want 0", len(stats.TypeDistribution))
	}
}

func TestGetDeviceStatistics_ShouldIgnoreAlertsOfDeletedDevices(t *testing.T) {
	db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
	defer cleanup()

	service := devices.NewService(db, zap.NewNop())

	mock.ExpectExec(`DELETE FROM "devices" WHERE id = \$1`).
		WithArgs(7).
		WillReturnResult(sqlmock.NewResult(0, 1))

	mock.ExpectQuery(`(?i)SELECT COUNT\(\*\) as total,\s*SUM\(CASE WHEN status = 'online' THEN 1 ELSE 0 END\) as online,\s*SUM\(CASE WHEN status = 'offline' THEN 1 ELSE 0 END\) as offline,\s*SUM\(CASE WHEN status = 'warning' THEN 1 ELSE 0 END\) as warning FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"total", "online", "offline", "warning"}).AddRow(0, 0, 0, 0))

	mock.ExpectQuery(`(?i)SELECT count\(\*\) FROM "alerts" JOIN devices ON devices\.id = alerts\.device_id WHERE alerts\.status IN \(\$1,\$2\)`).
		WithArgs("open", "acknowledged").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	mock.ExpectQuery(`(?i)SELECT COUNT\(DISTINCT alerts\.device_id\) FROM "alerts" JOIN devices ON devices\.id = alerts\.device_id WHERE alerts\.status IN \(\$1,\$2\)`).
		WithArgs("open", "acknowledged").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	mock.ExpectQuery(`(?i)SELECT device_type, COUNT\(\*\) as count FROM "devices" GROUP BY "?device_type"?`).
		WillReturnRows(sqlmock.NewRows([]string{"device_type", "count"}))

	if err := service.DeleteDevice(context.Background(), 7); err != nil {
		t.Fatalf("DeleteDevice() error = %v", err)
	}

	stats, err := service.GetDeviceStatistics(context.Background())
	if err != nil {
		t.Fatalf("GetDeviceStatistics() error = %v", err)
	}

	if stats.TotalDevices != 0 {
		t.Fatalf("TotalDevices = %d, want 0", stats.TotalDevices)
	}
	if stats.TotalAlerts != 0 {
		t.Fatalf("TotalAlerts = %d, want 0", stats.TotalAlerts)
	}
	if stats.AlertingDevices != 0 {
		t.Fatalf("AlertingDevices = %d, want 0", stats.AlertingDevices)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func newDevicesGormDBWithSQLMock(t *testing.T) (*gorm.DB, sqlmock.Sqlmock, func()) {
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
