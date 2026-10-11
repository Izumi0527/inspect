package devices_test

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"go.uber.org/zap"
)

// device_metrics / interface_metrics / device_interfaces 都按 device_id 挂到设备上，
// 三张表没有外键（前两张是 TimescaleDB hypertable，外键级联挂不上）。
// 此前删设备只删 devices 行，指标与接口清单原地留存：监控中心按 device_id 聚合时
// 把已删设备捞回来，"全部设备"视图出现幽灵曲线、统计卡被已删设备的样本污染。

const (
	purgeDeviceMetricsPattern    = `DELETE FROM device_metrics WHERE device_id = \$1`
	purgeInterfaceMetricsPattern = `DELETE FROM interface_metrics WHERE device_id = \$1`
	purgeDeviceInterfacesPattern = `DELETE FROM device_interfaces WHERE device_id = \$1`
)

// 启动清理先找出三张表里引用、却已不在 devices 表中的 device_id。
const orphanMonitoringDeviceIDsPattern = `(?is)SELECT referenced\.device_id FROM \(SELECT device_id FROM device_metrics UNION SELECT device_id FROM interface_metrics UNION SELECT device_id FROM device_interfaces\) AS referenced WHERE referenced\.device_id IS NOT NULL AND NOT EXISTS \(SELECT 1 FROM devices AS d WHERE d\.id = referenced\.device_id\) ORDER BY referenced\.device_id`

func expectPurgeDeviceMonitoringData(mock sqlmock.Sqlmock, deviceID int, rows int64) {
	mock.ExpectExec(purgeDeviceMetricsPattern).WithArgs(deviceID).WillReturnResult(sqlmock.NewResult(0, rows))
	mock.ExpectExec(purgeInterfaceMetricsPattern).WithArgs(deviceID).WillReturnResult(sqlmock.NewResult(0, rows))
	mock.ExpectExec(purgeDeviceInterfacesPattern).WithArgs(deviceID).WillReturnResult(sqlmock.NewResult(0, rows))
}

// 删设备必须在同一事务内清掉它的监控数据：DELETE devices 之后、摘策略引用之前。
func TestDeleteDevice_PurgesMonitoringDataInSameTransaction(t *testing.T) {
	db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
	defer cleanup()
	service := devices.NewService(db, zap.NewNop())

	mock.ExpectBegin()
	mock.ExpectExec(snapshotUpdatePattern).WithArgs(7).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`DELETE FROM "devices" WHERE id = \$1`).WithArgs(7).WillReturnResult(sqlmock.NewResult(0, 1))
	expectPurgeDeviceMonitoringData(mock, 7, 120)
	mock.ExpectExec(strategyRefPrunePattern).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectCommit()

	if err := service.DeleteDevice(context.Background(), 7); err != nil {
		t.Fatalf("DeleteDevice: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

// 清理监控数据失败时整体回滚：设备不删，避免再留下半套残骸。
func TestDeleteDevice_MonitoringPurgeFailureRollsBackDelete(t *testing.T) {
	db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
	defer cleanup()
	service := devices.NewService(db, zap.NewNop())

	mock.ExpectBegin()
	mock.ExpectExec(snapshotUpdatePattern).WithArgs(7).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`DELETE FROM "devices" WHERE id = \$1`).WithArgs(7).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(purgeDeviceMetricsPattern).WithArgs(7).WillReturnError(context.DeadlineExceeded)
	mock.ExpectRollback()

	if err := service.DeleteDevice(context.Background(), 7); err == nil {
		t.Fatal("清理监控数据失败时 DeleteDevice 应返回错误并回滚删除")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

// 启动清理修复本机制上线前删设备留下的监控数据（幂等）：先找孤儿 ID，再逐台各自事务清三表，
// 返回清理的设备数。逐台独立事务：单台失败不回滚已清理的其它设备。
func TestPurgeOrphanMonitoringData_RemovesRowsOfDeletedDevices(t *testing.T) {
	db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
	defer cleanup()
	service := devices.NewService(db, zap.NewNop())

	mock.ExpectQuery(orphanMonitoringDeviceIDsPattern).
		WillReturnRows(sqlmock.NewRows([]string{"device_id"}).AddRow(6).AddRow(17))
	mock.ExpectBegin()
	expectPurgeDeviceMonitoringData(mock, 6, 13020)
	mock.ExpectCommit()
	mock.ExpectBegin()
	expectPurgeDeviceMonitoringData(mock, 17, 4133)
	mock.ExpectCommit()

	purged, err := service.PurgeOrphanMonitoringData(context.Background())
	if err != nil {
		t.Fatalf("PurgeOrphanMonitoringData: %v", err)
	}
	if purged != 2 {
		t.Fatalf("purged = %d, want 2", purged)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

// 没有孤儿时只做一次查询，不开事务。
func TestPurgeOrphanMonitoringData_NoOrphansNoDelete(t *testing.T) {
	db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
	defer cleanup()
	service := devices.NewService(db, zap.NewNop())

	mock.ExpectQuery(orphanMonitoringDeviceIDsPattern).
		WillReturnRows(sqlmock.NewRows([]string{"device_id"}))

	purged, err := service.PurgeOrphanMonitoringData(context.Background())
	if err != nil {
		t.Fatalf("PurgeOrphanMonitoringData: %v", err)
	}
	if purged != 0 {
		t.Fatalf("purged = %d, want 0", purged)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
