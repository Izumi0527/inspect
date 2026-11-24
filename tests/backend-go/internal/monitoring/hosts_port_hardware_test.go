package monitoring_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

func TestQueryHostsMatrix_S5720SPhysicalPortFilteringAndHardwareStatus(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	mock.ExpectQuery(`SELECT count\(\*\) FROM devices AS d`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(3))

	rowCols := []string{
		"id", "name", "ip_address", "hostname", "detected_sys_name",
		"device_type", "vendor", "model", "group_id", "group_name",
		"status", "is_monitored", "cpu_usage", "memory_usage", "temperature",
		"uptime", "response_time", "last_seen", "icmp_status", "snmp_status",
		"cli_protocol", "last_error_code", "consecutive_failures", "backoff_until", "last_success_at",
		"last_duration_ms",
	}
	mock.ExpectQuery(`SELECT\s+d\.id, d\.name, d\.ip_address, d\.hostname, d\.detected_sys_name`).
		WithArgs(true, 20).
		WillReturnRows(sqlmock.NewRows(rowCols).
			AddRow(
				101, "SW-S5720S", "10.0.1.1", "SW-S5720S", nil,
				"switch", "huawei", "S5720S-52P-LI-AC", nil, "",
				"online", true, nil, nil, nil,
				nil, nil, nil, "online", "success",
				"", "", 0, nil, nil,
				0,
			).
			AddRow(
				102, "SW-FAULT", "10.0.1.2", "SW-FAULT", nil,
				"switch", "huawei", "CE6857", nil, "",
				"warning", true, nil, nil, nil,
				nil, nil, nil, "online", "success",
				"", "", 0, nil, nil,
				0,
			).
			AddRow(
				103, "SW-UNKNOWN", "10.0.1.3", "SW-UNKNOWN", nil,
				"switch", "h3c", "S5130", nil, "",
				"online", true, nil, nil, nil,
				nil, nil, nil, "online", "success",
				"", "", 0, nil, nil,
				0,
			))

	mock.ExpectQuery(`SELECT \* FROM "monitor_maintenances" WHERE enabled = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	// 复现 S5720S-52P-LI-AC：52 物理口（17 up）+ 5 虚拟/管理口（InLoopBack0/NULL0/Vlanif1/MEth0/0/1/Console9/0/0）+ 1 个 2.5GE0/0/1（up）与 1 个三层子接口 2.5GE0/0/1.10
	ifaceRows := sqlmock.NewRows([]string{"device_id", "name", "alias", "is_up"})
	for i := 1; i <= 52; i++ {
		isUp := i <= 17
		ifaceRows.AddRow(101, fmt.Sprintf("if%d", i), fmt.Sprintf("GigabitEthernet0/0/%d", i), isUp)
	}
	ifaceRows.
		AddRow(101, "if53", "InLoopBack0", true).
		AddRow(101, "if54", "NULL0", true).
		AddRow(101, "if55", "Vlanif1", true).
		AddRow(101, "if56", "MEth0/0/1", true).
		AddRow(101, "if57", "Console9/0/0", true).
		AddRow(101, "if58", "GigabitEthernet0/0/1.100", true).
		AddRow(102, "2.5GE0/0/1", nil, true).
		AddRow(102, "2.5GE0/0/1.10", nil, true)

	mock.ExpectQuery(`SELECT device_id, name, alias, is_up FROM "device_interfaces"`).
		WithArgs(101, 102, 103, true).
		WillReturnRows(ifaceRows)

	mock.ExpectQuery(`SELECT device_id, metric_value FROM "device_latest_metrics"`).
		WithArgs(101, 102, 103).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "metric_value"}).
			AddRow(101, 0.0).
			AddRow(102, 2.0))

	mock.ExpectQuery(`FROM device_metrics`).
		WithArgs(101, 102, 103, 12).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "collected_at", "metric_value"}))

	res, err := writer.QueryHostsMatrix(context.Background(), monitoring.HostsMatrixFilter{
		Page:     1,
		PageSize: 20,
	})
	if err != nil {
		t.Fatalf("QueryHostsMatrix() error = %v", err)
	}
	if len(res.Items) != 3 {
		t.Fatalf("len(Items) = %d, want 3", len(res.Items))
	}

	// 设备 101：52 物理口（17 up），5+1 虚拟/子接口全部被剔除，hardware_fault_count=0 -> healthy
	got101 := res.Items[0]
	if got101.InterfacesUp != 17 || got101.InterfacesTotal != 52 {
		t.Fatalf("device 101 ports = %d/%d, want 17/52", got101.InterfacesUp, got101.InterfacesTotal)
	}
	if got101.HardwareFaultCount != 0 || got101.HardwareStatus != monitoring.HardwareStatusHealthy {
		t.Fatalf("device 101 hardware = (%d, %q), want (0, %q)", got101.HardwareFaultCount, got101.HardwareStatus, monitoring.HardwareStatusHealthy)
	}

	// 设备 102：2.5GE0/0/1 保留，2.5GE0/0/1.10 剔除 -> 1/1，hardware_fault_count=2 -> fault
	got102 := res.Items[1]
	if got102.InterfacesUp != 1 || got102.InterfacesTotal != 1 {
		t.Fatalf("device 102 ports = %d/%d, want 1/1", got102.InterfacesUp, got102.InterfacesTotal)
	}
	if got102.HardwareFaultCount != 2 || got102.HardwareStatus != monitoring.HardwareStatusFault {
		t.Fatalf("device 102 hardware = (%d, %q), want (2, %q)", got102.HardwareFaultCount, got102.HardwareStatus, monitoring.HardwareStatusFault)
	}

	// 设备 103：未采集到硬件状态 -> 0, unknown
	got103 := res.Items[2]
	if got103.InterfacesUp != 0 || got103.InterfacesTotal != 0 {
		t.Fatalf("device 103 ports = %d/%d, want 0/0", got103.InterfacesUp, got103.InterfacesTotal)
	}
	if got103.HardwareFaultCount != 0 || got103.HardwareStatus != monitoring.HardwareStatusUnknown {
		t.Fatalf("device 103 hardware = (%d, %q), want (0, %q)", got103.HardwareFaultCount, got103.HardwareStatus, monitoring.HardwareStatusUnknown)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
