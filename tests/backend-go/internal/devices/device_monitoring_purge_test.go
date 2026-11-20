package devices_test

import (
	"context"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	_ "unsafe"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"go.uber.org/zap"
)

//go:linkname monitoringTablesByDevice github.com/your-org/inspect-system/backend-go/internal/devices.monitoringTablesByDevice
var monitoringTablesByDevice []string

// device_metrics / interface_metrics / device_interfaces 都按 device_id 挂到设备上，
// 三张表没有外键（前两张是 TimescaleDB hypertable，外键级联挂不上）；
// device_ssh_host_keys（SSH 主机密钥指纹）同样按 device_id 挂设备且无外键，
// 设备删除后残留会变成孤儿指纹记录。四张表都要在删设备时显式清理。
// 此前删设备只删 devices 行，指标与接口清单原地留存：监控中心按 device_id 聚合时
// 把已删设备捞回来，"全部设备"视图出现幽灵曲线、统计卡被已删设备的样本污染。

const (
	purgeDeviceMetricsPattern    = `DELETE FROM device_metrics WHERE device_id = \$1`
	purgeInterfaceMetricsPattern = `DELETE FROM interface_metrics WHERE device_id = \$1`
	purgeDeviceInterfacesPattern = `DELETE FROM device_interfaces WHERE device_id = \$1`
	purgeSSHHostKeyPattern       = `DELETE FROM device_ssh_host_keys WHERE device_id = \$1`
)

var optionalTableProbePattern = regexp.QuoteMeta(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name IN`)

// 启动清理先找出四张表里引用、却已不在 devices 表中的 device_id。
const orphanMonitoringDeviceIDsPattern = `(?is)SELECT referenced\.device_id FROM \(SELECT device_id FROM device_metrics UNION SELECT device_id FROM interface_metrics UNION SELECT device_id FROM device_interfaces UNION SELECT device_id FROM device_ssh_host_keys\) AS referenced WHERE referenced\.device_id IS NOT NULL AND NOT EXISTS \(SELECT 1 FROM devices AS d WHERE d\.id = referenced\.device_id\) ORDER BY referenced\.device_id`

func expectPurgeDeviceMonitoringData(mock sqlmock.Sqlmock, deviceID int, rows int64) {
	mock.ExpectExec(purgeDeviceMetricsPattern).WithArgs(deviceID).WillReturnResult(sqlmock.NewResult(0, rows))
	mock.ExpectExec(purgeInterfaceMetricsPattern).WithArgs(deviceID).WillReturnResult(sqlmock.NewResult(0, rows))
	mock.ExpectExec(purgeDeviceInterfacesPattern).WithArgs(deviceID).WillReturnResult(sqlmock.NewResult(0, rows))
	mock.ExpectExec(purgeSSHHostKeyPattern).WithArgs(deviceID).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(optionalTableProbePattern).
		WillReturnRows(sqlmock.NewRows([]string{"table_name"}))
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

// 当 Phase 1~3 扩展表（如 device_latest_metrics / monitor_maintenance_targets）存在时，
// 删设备必须同时清理 device_id 扩展表，并对多态表按 target_type='device' AND target_id=? 清理。
func TestDeleteDevice_PurgesOptionalAndPolymorphicTargetsWhenTablesExist(t *testing.T) {
	db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
	defer cleanup()
	service := devices.NewService(db, zap.NewNop())

	mock.ExpectBegin()
	mock.ExpectExec(snapshotUpdatePattern).WithArgs(9).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`DELETE FROM "devices" WHERE id = \$1`).WithArgs(9).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(purgeDeviceMetricsPattern).WithArgs(9).WillReturnResult(sqlmock.NewResult(0, 10))
	mock.ExpectExec(purgeInterfaceMetricsPattern).WithArgs(9).WillReturnResult(sqlmock.NewResult(0, 10))
	mock.ExpectExec(purgeDeviceInterfacesPattern).WithArgs(9).WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectExec(purgeSSHHostKeyPattern).WithArgs(9).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(optionalTableProbePattern).
		WillReturnRows(sqlmock.NewRows([]string{"table_name"}).
			AddRow("device_latest_metrics").
			AddRow("device_collection_states").
			AddRow("user_pinned_devices").
			AddRow("monitor_maintenance_targets"))
	mock.ExpectExec(`DELETE FROM device_latest_metrics WHERE device_id = \$1`).
		WithArgs(9).
		WillReturnResult(sqlmock.NewResult(0, 5))
	mock.ExpectExec(`DELETE FROM device_collection_states WHERE device_id = \$1`).
		WithArgs(9).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`DELETE FROM user_pinned_devices WHERE device_id = \$1`).
		WithArgs(9).
		WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectExec(`DELETE FROM monitor_maintenance_targets WHERE target_type = \$1 AND target_id = \$2`).
		WithArgs("device", 9).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(strategyRefPrunePattern).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectCommit()

	if err := service.DeleteDevice(context.Background(), 9); err != nil {
		t.Fatalf("DeleteDevice: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

// 启动清理修复本机制上线前删设备留下的监控数据（幂等）：先找孤儿 ID，再逐台各自事务清表，
// 返回清理的设备数。逐台独立事务：单台失败不回滚已清理的其它设备。
func TestPurgeOrphanMonitoringData_RemovesRowsOfDeletedDevices(t *testing.T) {
	db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
	defer cleanup()
	service := devices.NewService(db, zap.NewNop())

	mock.ExpectQuery(optionalTableProbePattern).
		WillReturnRows(sqlmock.NewRows([]string{"table_name"}))
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

// 当多态表 monitor_maintenance_targets 存在时，孤儿检测也应扫描 target_type='device' 的残留引用并清理。
func TestPurgeOrphanMonitoringData_IncludesPolymorphicTableWhenPresent(t *testing.T) {
	db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
	defer cleanup()
	service := devices.NewService(db, zap.NewNop())

	mock.ExpectQuery(optionalTableProbePattern).
		WillReturnRows(sqlmock.NewRows([]string{"table_name"}).AddRow("monitor_maintenance_targets"))
	mock.ExpectQuery(`(?is)UNION SELECT target_id AS device_id FROM monitor_maintenance_targets WHERE target_type = 'device'`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id"}).AddRow(88))

	mock.ExpectBegin()
	mock.ExpectExec(purgeDeviceMetricsPattern).WithArgs(88).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(purgeInterfaceMetricsPattern).WithArgs(88).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(purgeDeviceInterfacesPattern).WithArgs(88).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(purgeSSHHostKeyPattern).WithArgs(88).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery(optionalTableProbePattern).
		WillReturnRows(sqlmock.NewRows([]string{"table_name"}).AddRow("monitor_maintenance_targets"))
	mock.ExpectExec(`DELETE FROM monitor_maintenance_targets WHERE target_type = \$1 AND target_id = \$2`).
		WithArgs("device", 88).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	purged, err := service.PurgeOrphanMonitoringData(context.Background())
	if err != nil {
		t.Fatalf("PurgeOrphanMonitoringData: %v", err)
	}
	if purged != 1 {
		t.Fatalf("purged = %d, want 1", purged)
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

	mock.ExpectQuery(optionalTableProbePattern).
		WillReturnRows(sqlmock.NewRows([]string{"table_name"}))
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

// 架构守卫：monitor_maintenance_targets 绝不能放入 monitoringTablesByDevice，
// 且 devices 包严禁 import monitoring 或 scheduler。
func TestDevicesPackage_GuardsAndPolymorphicSafety(t *testing.T) {
	for _, table := range monitoringTablesByDevice {
		if table == "monitor_maintenance_targets" {
			t.Fatal("monitor_maintenance_targets must NOT be placed in monitoringTablesByDevice")
		}
	}

	root, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "backend-go", "internal", "devices"))
	if err != nil {
		t.Fatalf("abs path: %v", err)
	}
	fset := token.NewFileSet()
	err = filepath.WalkDir(root, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil || d.IsDir() || !strings.HasSuffix(path, ".go") {
			return walkErr
		}
		file, parseErr := parser.ParseFile(fset, path, nil, parser.ImportsOnly)
		if parseErr != nil {
			return parseErr
		}
		for _, imp := range file.Imports {
			importPath := strings.Trim(imp.Path.Value, `"`)
			if strings.Contains(importPath, "/internal/monitoring") || strings.Contains(importPath, "/internal/scheduler") {
				t.Fatalf("devices package (%s) must not import %s", path, importPath)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walk devices: %v", err)
	}
}
