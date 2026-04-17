package alerts_test

import (
	"context"
	"reflect"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestNormalizeCategoryFilters(t *testing.T) {
	input := []string{
		" Security ",
		"performance",
		"hardware",
		"security",
		"OTHER",
		"",
	}

	got := alerts.NormalizeCategoryFilters(input)
	want := []string{"security", "performance", "hardware", "other"}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("NormalizeCategoryFilters() = %v, want %v", got, want)
	}
}

func TestNormalizeCategoryFilters_Empty(t *testing.T) {
	got := alerts.NormalizeCategoryFilters([]string{"", "   "})
	if len(got) != 0 {
		t.Fatalf("NormalizeCategoryFilters() expected empty result, got %v", got)
	}
}

func TestListAlerts_ShouldExcludeDeletedDeviceAlerts(t *testing.T) {
	db, mock, cleanup := newAlertsGormDBWithSQLMock(t)
	defer cleanup()

	service := alerts.NewService(db, zap.NewNop())

	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM alerts AS a JOIN devices d ON d\.id = a\.device_id LEFT JOIN alert_rules r ON r\.id = a\.rule_id`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	mock.ExpectQuery(`(?is)SELECT a\.\*, d\.name AS device_name, d\.ip_address AS device_ip, r\.name AS rule_name FROM alerts AS a JOIN devices d ON d\.id = a\.device_id LEFT JOIN alert_rules r ON r\.id = a\.rule_id`).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "title", "message", "category", "severity", "status", "device_name", "device_ip", "rule_name",
		}))

	rows, total, err := service.ListAlerts(context.Background(), alerts.ListAlertsFilter{
		Page:     1,
		PageSize: 10,
	})
	if err != nil {
		t.Fatalf("ListAlerts() error = %v", err)
	}

	if total != 0 {
		t.Fatalf("ListAlerts() total = %d, want 0", total)
	}
	if len(rows) != 0 {
		t.Fatalf("ListAlerts() rows = %d, want 0", len(rows))
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func newAlertsGormDBWithSQLMock(t *testing.T) (*gorm.DB, sqlmock.Sqlmock, func()) {
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
