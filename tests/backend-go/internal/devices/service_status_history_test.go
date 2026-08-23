package devices_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// device_status_history 曾长期只有读取方而无写入方：表结构、清理任务、
// 三处趋势/统计查询都已就绪，却从未有代码写入，导致可用性趋势只能退化成单点快照。
// 以下用例锁定「探测状态落库时同步追加一条历史快照」这一行为。

func TestUpdateDeviceProbeStatus_ShouldAppendStatusHistory(t *testing.T) {
	db, mock, cleanup := newDeviceGormDBWithSQLMock(t)
	defer cleanup()

	service := devices.NewService(db, zap.NewNop())

	probedAt := time.Date(2026, 8, 23, 10, 30, 0, 0, time.UTC)
	responseTime := 12.5

	mock.ExpectExec(`UPDATE "devices" SET`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	// device_ip 由子查询从 devices 取，调用方无需传参
	mock.ExpectExec(`INSERT INTO device_status_history`).
		WithArgs("online", responseTime, probedAt, 7).
		WillReturnResult(sqlmock.NewResult(1, 1))

	err := service.UpdateDeviceProbeStatus(
		context.Background(),
		7,
		"online",
		"online",
		"success",
		&responseTime,
		&probedAt,
		&probedAt,
	)
	if err != nil {
		t.Fatalf("UpdateDeviceProbeStatus() error = %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestUpdateDeviceProbeStatus_ShouldRecordOfflineStatusWithoutResponseTime(t *testing.T) {
	db, mock, cleanup := newDeviceGormDBWithSQLMock(t)
	defer cleanup()

	service := devices.NewService(db, zap.NewNop())

	probedAt := time.Date(2026, 8, 23, 11, 0, 0, 0, time.UTC)

	mock.ExpectExec(`UPDATE "devices" SET`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	// 设备不可达时没有响应时间，该列必须以 NULL 落库而不是 0，
	// 否则会把「探测失败」误记成「响应耗时 0ms」。
	mock.ExpectExec(`INSERT INTO device_status_history`).
		WithArgs("offline", nil, probedAt, 9).
		WillReturnResult(sqlmock.NewResult(1, 1))

	err := service.UpdateDeviceProbeStatus(
		context.Background(),
		9,
		"offline",
		"offline",
		"failed",
		nil,
		nil,
		&probedAt,
	)
	if err != nil {
		t.Fatalf("UpdateDeviceProbeStatus() error = %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestUpdateDeviceProbeStatus_ShouldSucceedWhenHistoryInsertFails(t *testing.T) {
	db, mock, cleanup := newDeviceGormDBWithSQLMock(t)
	defer cleanup()

	service := devices.NewService(db, zap.NewNop())

	probedAt := time.Date(2026, 8, 23, 12, 0, 0, 0, time.UTC)

	mock.ExpectExec(`UPDATE "devices" SET`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	// 历史是派生数据：写入失败只应记日志，绝不能让设备状态更新本身失败
	mock.ExpectExec(`INSERT INTO device_status_history`).
		WillReturnError(errors.New("history table unavailable"))

	err := service.UpdateDeviceProbeStatus(
		context.Background(),
		11,
		"online",
		"online",
		"success",
		nil,
		nil,
		&probedAt,
	)
	if err != nil {
		t.Fatalf("UpdateDeviceProbeStatus() should tolerate history failure, got error = %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestUpdateDeviceProbeStatus_ShouldNotAppendHistoryWhenDeviceMissing(t *testing.T) {
	db, mock, cleanup := newDeviceGormDBWithSQLMock(t)
	defer cleanup()

	service := devices.NewService(db, zap.NewNop())

	probedAt := time.Date(2026, 8, 23, 13, 0, 0, 0, time.UTC)

	// 设备不存在时状态更新影响 0 行并返回错误，此时不应再写历史
	mock.ExpectExec(`UPDATE "devices" SET`).
		WillReturnResult(sqlmock.NewResult(0, 0))

	err := service.UpdateDeviceProbeStatus(
		context.Background(),
		404,
		"online",
		"online",
		"success",
		nil,
		nil,
		&probedAt,
	)
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("UpdateDeviceProbeStatus() error = %v, want ErrRecordNotFound", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func newDeviceGormDBWithSQLMock(t *testing.T) (*gorm.DB, sqlmock.Sqlmock, func()) {
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
