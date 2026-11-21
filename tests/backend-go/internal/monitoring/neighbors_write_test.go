package monitoring_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

func strPtr(v string) *string { return &v }

// TestBuildSNMPDeviceMetricsRequest_NeighborsAndDetectedType 邻居与识别类型进入写入请求：
// LLDPAvailable 决定 Neighbors 指针是否存在（nil=未采集，保留旧行；非 nil 空=清空旧行）。
func TestBuildSNMPDeviceMetricsRequest_NeighborsAndDetectedType(t *testing.T) {
	t.Run("识别类型进入 Identity，即便型号/版本为空", func(t *testing.T) {
		req := monitoring.BuildSNMPDeviceMetricsRequest(3, &devices.SNMPMetrics{
			DetectedType: strPtr("firewall"),
			CollectedAt:  time.Now(),
		})
		if req.Identity == nil || req.Identity.DetectedDeviceType != "firewall" {
			t.Fatalf("Identity = %+v, want DetectedDeviceType=firewall", req.Identity)
		}
	})

	t.Run("LLDP 不可用时 Neighbors 为 nil", func(t *testing.T) {
		req := monitoring.BuildSNMPDeviceMetricsRequest(3, &devices.SNMPMetrics{CollectedAt: time.Now()})
		if req.Neighbors != nil {
			t.Fatalf("Neighbors = %+v, want nil", req.Neighbors)
		}
	})

	t.Run("LLDP 可用但无邻居时 Neighbors 非 nil 且为空", func(t *testing.T) {
		req := monitoring.BuildSNMPDeviceMetricsRequest(3, &devices.SNMPMetrics{
			LLDPAvailable: true,
			Neighbors:     []devices.NeighborMetrics{},
			CollectedAt:   time.Now(),
		})
		if req.Neighbors == nil || len(req.Neighbors.Items) != 0 {
			t.Fatalf("Neighbors = %+v, want 非 nil 空列表", req.Neighbors)
		}
	})

	t.Run("邻居字段逐一映射", func(t *testing.T) {
		req := monitoring.BuildSNMPDeviceMetricsRequest(3, &devices.SNMPMetrics{
			LLDPAvailable: true,
			Neighbors: []devices.NeighborMetrics{{
				LocalPortNum: 5, LocalPortID: "GE0/0/24", LocalPortDesc: "uplink",
				RemoteChassisID: "00:11:22:33:44:55", RemotePortID: "GE0/0/1", RemotePortDesc: "to-acc",
				RemoteSysName: "core", RemoteSysDesc: "VRP", RemoteMgmtIP: "10.0.0.1", RemoteCapEnabled: "bridge",
			}},
			CollectedAt: time.Now(),
		})
		if req.Neighbors == nil || len(req.Neighbors.Items) != 1 {
			t.Fatalf("Neighbors = %+v", req.Neighbors)
		}
		got := req.Neighbors.Items[0]
		want := monitoring.NeighborPayload{
			LocalPortNum: 5, LocalPortID: "GE0/0/24", LocalPortDesc: "uplink",
			RemoteChassisID: "00:11:22:33:44:55", RemotePortID: "GE0/0/1", RemotePortDesc: "to-acc",
			RemoteSysName: "core", RemoteSysDesc: "VRP", RemoteMgmtIP: "10.0.0.1", RemoteCapEnabled: "bridge",
		}
		if got != want {
			t.Fatalf("payload = %+v\nwant %+v", got, want)
		}
	})

	t.Run("LLDP 状态与设备自身身份进入 Identity，视图未放行时 Neighbors 仍为 nil", func(t *testing.T) {
		req := monitoring.BuildSNMPDeviceMetricsRequest(3, &devices.SNMPMetrics{
			LLDPStatus:  devices.LLDPStatusMIBUnreachable,
			SysName:     strPtr("16F-HJ-SW"),
			ChassisID:   strPtr("4c:1f:cc:1a:07:48"),
			CollectedAt: time.Now(),
		})
		if req.Neighbors != nil {
			t.Fatalf("Neighbors = %+v, want nil", req.Neighbors)
		}
		if req.Identity == nil {
			t.Fatalf("Identity 应携带 LLDP 状态与身份")
		}
		if req.Identity.LLDPStatus != "mib_unreachable" || req.Identity.SysName != "16F-HJ-SW" || req.Identity.ChassisID != "4c:1f:cc:1a:07:48" {
			t.Fatalf("Identity = %+v", req.Identity)
		}
	})

	t.Run("SerialNumber 透传至 Identity.SerialNumber", func(t *testing.T) {
		req := monitoring.BuildSNMPDeviceMetricsRequest(3, &devices.SNMPMetrics{
			SerialNumber: strPtr("210235A1B2C3"),
			CollectedAt:  time.Now(),
		})
		if req.Identity == nil || req.Identity.SerialNumber != "210235A1B2C3" {
			t.Fatalf("Identity = %+v, want SerialNumber=210235A1B2C3", req.Identity)
		}
	})
}

// TestWriteDeviceMetrics_WritesLLDPIdentityColumnsOnlyWhenChanged LLDP 状态与识别身份沿用
// 「只写差异」的回填路径，落到 lldp_status / detected_sys_name / detected_chassis_id 三列。
func TestWriteDeviceMetrics_WritesLLDPIdentityColumnsOnlyWhenChanged(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	cpu := 1.0

	mock.ExpectQuery(`SELECT id FROM "devices" WHERE id = \$1 LIMIT \$2`).WithArgs(9, 1).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(9))
	mock.ExpectBegin()
	mock.ExpectExec(`CREATE SEQUENCE IF NOT EXISTS device_metrics_id_seq`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`INSERT INTO device_metrics`).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`INSERT INTO device_latest_metrics`).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`UPDATE "devices" SET "cpu_usage"`).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`SAVEPOINT`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`UPDATE "devices" SET "detected_sys_name"=\$1 WHERE id = \$2 AND \(detected_sys_name IS NULL OR detected_sys_name <> \$3\)`).
		WithArgs("16F-HJ-SW", 9, "16F-HJ-SW").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`SAVEPOINT`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`UPDATE "devices" SET "detected_chassis_id"=\$1 WHERE id = \$2 AND \(detected_chassis_id IS NULL OR detected_chassis_id <> \$3\)`).
		WithArgs("4c:1f:cc:1a:07:48", 9, "4c:1f:cc:1a:07:48").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`SAVEPOINT`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`UPDATE "devices" SET "lldp_status"=\$1 WHERE id = \$2 AND \(lldp_status IS NULL OR lldp_status <> \$3\)`).
		WithArgs("mib_unreachable", 9, "mib_unreachable").WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectCommit()

	if _, err := writer.WriteDeviceMetrics(context.Background(), monitoring.DeviceMetricsRequest{
		DeviceID: 9,
		Metrics:  map[string]monitoring.MetricValue{"cpu_usage": {Value: &cpu}},
		Identity: &monitoring.DeviceIdentity{SysName: "16F-HJ-SW", ChassisID: "4c:1f:cc:1a:07:48", LLDPStatus: "mib_unreachable"},
	}); err != nil {
		t.Fatalf("WriteDeviceMetrics() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// TestWriteDeviceMetrics_ReplacesNeighborsInSavepoint 邻居写入是「先删后插」的全量替换，
// 且包在 SAVEPOINT 里，失败不连累核心快照。
func TestWriteDeviceMetrics_ReplacesNeighborsInSavepoint(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	cpu := 12.5
	collectedAt := monitoring.FlexibleTime{Time: time.Date(2026, 9, 14, 8, 0, 0, 0, time.UTC)}

	mock.ExpectQuery(`SELECT id FROM "devices" WHERE id = \$1 LIMIT \$2`).WithArgs(9, 1).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(9))
	mock.ExpectBegin()
	mock.ExpectExec(`CREATE SEQUENCE IF NOT EXISTS device_metrics_id_seq`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`INSERT INTO device_metrics`).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`INSERT INTO device_latest_metrics`).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`UPDATE "devices" SET "cpu_usage"=\$1 WHERE id = \$2`).WithArgs(cpu, 9).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`SAVEPOINT`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`UPDATE "devices" SET "detected_device_type"=\$1 WHERE id = \$2 AND \(detected_device_type IS NULL OR detected_device_type <> \$3\)`).
		WithArgs("router", 9, "router").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`SAVEPOINT`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`DELETE FROM device_neighbors WHERE device_id = \$1`).WithArgs(9).WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectExec(`INSERT INTO device_neighbors \(device_id, local_port_num, local_port_id, local_port_desc, remote_chassis_id, remote_port_id, remote_port_desc, remote_sys_name, remote_sys_desc, remote_mgmt_ip, remote_cap_enabled, collected_at, created_at\)`).
		WithArgs(9, 5, "GE0/0/24", nil, "00:11:22:33:44:55", "GE0/0/1", nil, "core", nil, "10.0.0.1", nil, collectedAt.Time, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	_, err := writer.WriteDeviceMetrics(context.Background(), monitoring.DeviceMetricsRequest{
		DeviceID:    9,
		CollectedAt: &collectedAt,
		Metrics:     map[string]monitoring.MetricValue{"cpu_usage": {Value: &cpu}},
		Identity:    &monitoring.DeviceIdentity{DetectedDeviceType: "router"},
		Neighbors: &monitoring.NeighborsPayload{Items: []monitoring.NeighborPayload{{
			LocalPortNum: 5, LocalPortID: "GE0/0/24",
			RemoteChassisID: "00:11:22:33:44:55", RemotePortID: "GE0/0/1",
			RemoteSysName: "core", RemoteMgmtIP: "10.0.0.1",
		}}},
	})
	if err != nil {
		t.Fatalf("WriteDeviceMetrics() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// TestWriteDeviceMetrics_EmptyNeighborsClearsOldRows 采集到空表时只删不插；未采集（nil）时完全不碰邻居表。
func TestWriteDeviceMetrics_EmptyNeighborsClearsOldRows(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	cpu := 1.0

	mock.ExpectQuery(`SELECT id FROM "devices" WHERE id = \$1 LIMIT \$2`).WithArgs(9, 1).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(9))
	mock.ExpectBegin()
	mock.ExpectExec(`CREATE SEQUENCE IF NOT EXISTS device_metrics_id_seq`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`INSERT INTO device_metrics`).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`INSERT INTO device_latest_metrics`).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`UPDATE "devices" SET "cpu_usage"`).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`SAVEPOINT`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`DELETE FROM device_neighbors WHERE device_id = \$1`).WithArgs(9).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectCommit()

	if _, err := writer.WriteDeviceMetrics(context.Background(), monitoring.DeviceMetricsRequest{
		DeviceID:  9,
		Metrics:   map[string]monitoring.MetricValue{"cpu_usage": {Value: &cpu}},
		Neighbors: &monitoring.NeighborsPayload{Items: []monitoring.NeighborPayload{}},
	}); err != nil {
		t.Fatalf("WriteDeviceMetrics() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}

	mock.ExpectQuery(`SELECT id FROM "devices" WHERE id = \$1 LIMIT \$2`).WithArgs(9, 1).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(9))
	mock.ExpectBegin()
	mock.ExpectExec(`CREATE SEQUENCE IF NOT EXISTS device_metrics_id_seq`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`INSERT INTO device_metrics`).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`INSERT INTO device_latest_metrics`).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`UPDATE "devices" SET "cpu_usage"`).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	if _, err := writer.WriteDeviceMetrics(context.Background(), monitoring.DeviceMetricsRequest{
		DeviceID: 9,
		Metrics:  map[string]monitoring.MetricValue{"cpu_usage": {Value: &cpu}},
	}); err != nil {
		t.Fatalf("WriteDeviceMetrics() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// TestWriteDeviceMetrics_WritesSerialNumberOnlyWhenChanged 验证序列号通过差量条件回填至 devices.serial_number。
func TestWriteDeviceMetrics_WritesSerialNumberOnlyWhenChanged(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	cpu := 5.0

	mock.ExpectQuery(`SELECT id FROM "devices" WHERE id = \$1 LIMIT \$2`).WithArgs(9, 1).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(9))
	mock.ExpectBegin()
	mock.ExpectExec(`CREATE SEQUENCE IF NOT EXISTS device_metrics_id_seq`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`INSERT INTO device_metrics`).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`INSERT INTO device_latest_metrics`).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`UPDATE "devices" SET "cpu_usage"`).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`SAVEPOINT`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`UPDATE "devices" SET "serial_number"=\$1 WHERE id = \$2 AND \(serial_number IS NULL OR serial_number <> \$3\)`).
		WithArgs("210235A1B2C3", 9, "210235A1B2C3").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	if _, err := writer.WriteDeviceMetrics(context.Background(), monitoring.DeviceMetricsRequest{
		DeviceID: 9,
		Metrics:  map[string]monitoring.MetricValue{"cpu_usage": {Value: &cpu}},
		Identity: &monitoring.DeviceIdentity{SerialNumber: " 210235A1B2C3 "},
	}); err != nil {
		t.Fatalf("WriteDeviceMetrics() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// TestWriteDeviceMetrics_RejectsDirtyIdentityFieldsWithoutUpdates 外部推送脏 Identity 字段会被清洗拦截，
// 不触发任何身份 SAVEPOINT 或 UPDATE。
func TestWriteDeviceMetrics_RejectsDirtyIdentityFieldsWithoutUpdates(t *testing.T) {
	dirtySerials := []string{
		"N/A",
		"SN\x00123",
		"SN\x1b[31m123",
		strings.Repeat("A", 129),
	}
	for _, dirtySerial := range dirtySerials {
		db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
		writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
		cpu := 10.0

		mock.ExpectQuery(`SELECT id FROM "devices" WHERE id = \$1 LIMIT \$2`).WithArgs(9, 1).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(9))
		mock.ExpectBegin()
		mock.ExpectExec(`CREATE SEQUENCE IF NOT EXISTS device_metrics_id_seq`).WillReturnResult(sqlmock.NewResult(0, 0))
		mock.ExpectExec(`INSERT INTO device_metrics`).WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectExec(`INSERT INTO device_latest_metrics`).WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectExec(`UPDATE "devices" SET "cpu_usage"`).WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectCommit()

		if _, err := writer.WriteDeviceMetrics(context.Background(), monitoring.DeviceMetricsRequest{
			DeviceID: 9,
			Metrics:  map[string]monitoring.MetricValue{"cpu_usage": {Value: &cpu}},
			Identity: &monitoring.DeviceIdentity{
				Model:           "S5700\nBAD",
				FirmwareVersion: strings.Repeat("V", 256),
				SerialNumber:    dirtySerial,
				SysName:         "SW\x07CORE",
				ChassisID:       strings.Repeat("C", 256),
			},
		}); err != nil {
			cleanup()
			t.Fatalf("WriteDeviceMetrics(%q) error = %v", dirtySerial, err)
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			cleanup()
			t.Fatalf("sqlmock expectations not met for %q: %v", dirtySerial, err)
		}
		cleanup()
	}
}

// TestWriteDeviceMetrics_IdentityColumnFailureRollsBackSavepointOnly 单列身份 UPDATE 失败只回滚自身 SAVEPOINT，
// 后续身份列与核心指标事务仍正常 COMMIT。
func TestWriteDeviceMetrics_IdentityColumnFailureRollsBackSavepointOnly(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	cpu := 15.0

	mock.ExpectQuery(`SELECT id FROM "devices" WHERE id = \$1 LIMIT \$2`).WithArgs(9, 1).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(9))
	mock.ExpectBegin()
	mock.ExpectExec(`CREATE SEQUENCE IF NOT EXISTS device_metrics_id_seq`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`INSERT INTO device_metrics`).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`INSERT INTO device_latest_metrics`).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`UPDATE "devices" SET "cpu_usage"`).WillReturnResult(sqlmock.NewResult(0, 1))

	mock.ExpectExec(`SAVEPOINT`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`UPDATE "devices" SET "model"=\$1 WHERE id = \$2 AND \(model IS NULL OR model <> \$3\)`).
		WithArgs("S5700", 9, "S5700").WillReturnError(errors.New("simulated column error"))
	mock.ExpectExec(`ROLLBACK TO SAVEPOINT`).WillReturnResult(sqlmock.NewResult(0, 0))

	mock.ExpectExec(`SAVEPOINT`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`UPDATE "devices" SET "serial_number"=\$1 WHERE id = \$2 AND \(serial_number IS NULL OR serial_number <> \$3\)`).
		WithArgs("210235A1B2C3", 9, "210235A1B2C3").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	if _, err := writer.WriteDeviceMetrics(context.Background(), monitoring.DeviceMetricsRequest{
		DeviceID: 9,
		Metrics:  map[string]monitoring.MetricValue{"cpu_usage": {Value: &cpu}},
		Identity: &monitoring.DeviceIdentity{Model: "S5700", SerialNumber: "210235A1B2C3"},
	}); err != nil {
		t.Fatalf("WriteDeviceMetrics() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
