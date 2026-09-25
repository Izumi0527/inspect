package devices_test

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"go.uber.org/zap"
)

// 巡检报告的设备身份原先每次渲染都 LEFT JOIN 当前 devices 表：设备一删，
// 历史报告里的设备名/IP/类型/厂商/型号/版本/运行时长全部变空。快照把这些字段
// 在巡检执行时、删设备前复制到 inspections.device_snapshot，三处共用同一条 SQL。

const snapshotUpdatePattern = `UPDATE inspections AS i SET device_snapshot = jsonb_build_object\(` +
	`'name', d\.name, 'ip_address', d\.ip_address, 'device_type', d\.device_type, 'vendor', d\.vendor, ` +
	`'model', d\.model, 'firmware_version', d\.firmware_version, 'uptime', d\.uptime\) ` +
	`FROM devices AS d WHERE d\.id = i\.device_id AND `

// 执行时按巡检行覆盖写入：记录的是本次巡检那一刻的设备身份。
func TestSnapshotDeviceForInspection_OverwritesThatInspection(t *testing.T) {
	db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
	defer cleanup()
	service := devices.NewService(db, zap.NewNop())

	mock.ExpectExec(snapshotUpdatePattern + `i\.id = \$1$`).
		WithArgs(40).
		WillReturnResult(sqlmock.NewResult(0, 1))

	if err := service.SnapshotDeviceForInspection(context.Background(), 40); err != nil {
		t.Fatalf("SnapshotDeviceForInspection: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

// 启动回填只补缺失快照的行，不覆盖执行时写下的快照（幂等）。
func TestBackfillInspectionDeviceSnapshots_OnlyFillsMissing(t *testing.T) {
	db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
	defer cleanup()
	service := devices.NewService(db, zap.NewNop())

	mock.ExpectExec(snapshotUpdatePattern + `i\.device_snapshot IS NULL$`).
		WillReturnResult(sqlmock.NewResult(0, 4))

	rows, err := service.BackfillInspectionDeviceSnapshots(context.Background())
	if err != nil {
		t.Fatalf("BackfillInspectionDeviceSnapshots: %v", err)
	}
	if rows != 4 {
		t.Fatalf("rows = %d, want 4", rows)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

// 删除设备必须先把它的历史巡检补上快照、再删设备，且二者同一事务：
// 快照失败就不删，避免再出现「设备没了、报告也空了」。
func TestDeleteDevice_SnapshotsHistoryBeforeDeleteInOneTransaction(t *testing.T) {
	db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
	defer cleanup()
	service := devices.NewService(db, zap.NewNop())

	mock.ExpectBegin()
	mock.ExpectExec(snapshotUpdatePattern + `i\.device_id = \$1 AND i\.device_snapshot IS NULL$`).
		WithArgs(7).
		WillReturnResult(sqlmock.NewResult(0, 3))
	mock.ExpectExec(`DELETE FROM "devices" WHERE id = \$1`).
		WithArgs(7).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	if err := service.DeleteDevice(context.Background(), 7); err != nil {
		t.Fatalf("DeleteDevice: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestDeleteDevice_SnapshotFailureAbortsDelete(t *testing.T) {
	db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
	defer cleanup()
	service := devices.NewService(db, zap.NewNop())

	mock.ExpectBegin()
	mock.ExpectExec(snapshotUpdatePattern).WillReturnError(context.DeadlineExceeded)
	mock.ExpectRollback()

	if err := service.DeleteDevice(context.Background(), 7); err == nil {
		t.Fatal("快照失败时 DeleteDevice 应返回错误且不执行 DELETE")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

// 删除确认框据此提示「所选设备共有 N 条巡检记录」。
func TestCountInspections_CountsAcrossSelectedDevices(t *testing.T) {
	db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
	defer cleanup()
	service := devices.NewService(db, zap.NewNop())

	mock.ExpectQuery(`SELECT count\(\*\) FROM "inspections" WHERE device_id IN \(\$1,\$2\)`).
		WithArgs(6, 17).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(29))

	count, err := service.CountInspections(context.Background(), []int{6, 17})
	if err != nil {
		t.Fatalf("CountInspections: %v", err)
	}
	if count != 29 {
		t.Fatalf("count = %d, want 29", count)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

// 未选设备时不查库，直接返回 0。
func TestCountInspections_EmptySelectionNoQuery(t *testing.T) {
	db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
	defer cleanup()
	service := devices.NewService(db, zap.NewNop())

	count, err := service.CountInspections(context.Background(), nil)
	if err != nil || count != 0 {
		t.Fatalf("count = %d, err = %v, want 0, nil", count, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
