package dashboard_test

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/dashboard"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestGetTopDevicesByAlerts_ShouldExcludeDeletedDeviceAlerts(t *testing.T) {
	db, mock, cleanup := newDashboardGormDBWithSQLMock(t)
	defer cleanup()

	service := dashboard.NewService(db, nil, nil, nil, nil, zap.NewNop())

	mock.ExpectQuery(`(?is)SELECT .*COUNT\(\*\) AS alert_count.*FROM alerts AS a JOIN devices d ON d\.id = a\.device_id.*GROUP BY .*a\.device_id.*d\.name.*d\.ip_address.*`).
		WillReturnRows(sqlmock.NewRows([]string{
			"device_id",
			"device_name",
			"ip_address",
			"alert_count",
			"critical_count",
		}))

	items, err := service.GetTopDevicesByAlerts(context.Background(), 5)
	if err != nil {
		t.Fatalf("GetTopDevicesByAlerts() error = %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("GetTopDevicesByAlerts() items = %d, want 0", len(items))
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func newDashboardGormDBWithSQLMock(t *testing.T) (*gorm.DB, sqlmock.Sqlmock, func()) {
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
