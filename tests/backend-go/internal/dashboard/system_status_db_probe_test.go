package dashboard_test

import (
	"context"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/dashboard"
)

// database_connected 必须来自真正发出的 SELECT 1：GORM 的 Raw 只拼语句，
// 修复前写成 Raw("SELECT 1").Error 时查询从未发出，数据库挂了也报已连接。
func TestGetSystemStatus_DatabaseProbeFailureReportsDisconnected(t *testing.T) {
	db, mock, cleanup := newDashboardGormDBWithSQLMock(t)
	defer cleanup()
	service := dashboard.NewService(db, nil, nil, nil, nil, zap.NewNop())

	mock.ExpectQuery(`(?is)^SELECT 1$`).
		WillReturnError(errors.New("connection refused"))

	status, err := service.GetSystemStatus(context.Background())
	if err != nil {
		t.Fatalf("GetSystemStatus() error = %v", err)
	}
	if status.DatabaseConnected {
		t.Fatalf("DatabaseConnected = true，探活失败时应为 false")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestGetSystemStatus_DatabaseProbeSuccessReportsConnected(t *testing.T) {
	db, mock, cleanup := newDashboardGormDBWithSQLMock(t)
	defer cleanup()
	service := dashboard.NewService(db, nil, nil, nil, nil, zap.NewNop())

	mock.ExpectQuery(`(?is)^SELECT 1$`).
		WillReturnRows(sqlmock.NewRows([]string{"?column?"}).AddRow(1))

	status, err := service.GetSystemStatus(context.Background())
	if err != nil {
		t.Fatalf("GetSystemStatus() error = %v", err)
	}
	if !status.DatabaseConnected {
		t.Fatalf("DatabaseConnected = false，探活成功时应为 true")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
