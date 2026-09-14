package monitoring_test

import (
	"context"
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
}

// TestWriteDeviceMetrics_ReplacesNeighborsInSavepoint 邻居写入是「先删后插」的全量替换，
// 且包在 SAVEPOINT 里，失败不连累核心快照。
func TestWriteDeviceMetrics_ReplacesNeighborsInSavepoint(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	cpu := 12.5
	collectedAt := monitoring.FlexibleTime{Time: time.Date(2026, 9, 14, 8, 0, 0, 0, time.UTC)}

	mock.ExpectBegin()
	mock.ExpectExec(`CREATE SEQUENCE IF NOT EXISTS device_metrics_id_seq`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`INSERT INTO device_metrics`).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`UPDATE "devices" SET "cpu_usage"=\$1 WHERE id = \$2`).WithArgs(cpu, 9).WillReturnResult(sqlmock.NewResult(0, 1))
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

	mock.ExpectBegin()
	mock.ExpectExec(`CREATE SEQUENCE IF NOT EXISTS device_metrics_id_seq`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`INSERT INTO device_metrics`).WillReturnResult(sqlmock.NewResult(0, 1))
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

	mock.ExpectBegin()
	mock.ExpectExec(`CREATE SEQUENCE IF NOT EXISTS device_metrics_id_seq`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`INSERT INTO device_metrics`).WillReturnResult(sqlmock.NewResult(0, 1))
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
