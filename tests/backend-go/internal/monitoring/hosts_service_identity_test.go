package monitoring_test

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

func hostDetailMockColumns() []string {
	return []string{
		"id", "name", "ip_address", "hostname", "detected_sys_name",
		"device_type", "vendor", "model", "serial_number", "firmware_version",
		"location", "topology_role", "group_id", "group_name", "status",
		"is_monitored", "cpu_usage", "memory_usage", "temperature", "uptime",
		"response_time", "last_seen", "icmp_status", "snmp_status", "cli_protocol",
		"last_error_code", "consecutive_failures", "backoff_until", "last_success_at", "last_duration_ms",
	}
}

func expectGetHostDetailSupportingQueries(mock sqlmock.Sqlmock, deviceID int) {
	mock.ExpectQuery(`SELECT \* FROM "monitor_maintenances" WHERE enabled = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery(`SELECT device_id, SUM\(CASE WHEN COALESCE\(is_up, false\) THEN 1 ELSE 0 END\) AS up_cnt, COUNT\(\*\) AS total_cnt FROM "device_interfaces"`).
		WithArgs(deviceID, true).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "up_cnt", "total_cnt"}))
	mock.ExpectQuery(`SELECT device_id, metric_value FROM "device_latest_metrics"`).
		WithArgs(deviceID).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "metric_value"}))
	mock.ExpectQuery(`SELECT \* FROM "device_interfaces" WHERE device_id = \$1`).
		WithArgs(deviceID).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery(`FROM device_metrics`).
		WithArgs(deviceID).
		WillReturnRows(sqlmock.NewRows([]string{"collected_at", "tags"}))
	mock.ExpectQuery(`FROM "device_neighbors" WHERE device_id = \$1`).
		WithArgs(deviceID).
		WillReturnRows(sqlmock.NewRows([]string{"local_port_id"}))
	mock.ExpectQuery(`FROM "alert_rules"`).
		WillReturnRows(sqlmock.NewRows([]string{"metric_name", "severity", "threshold_value"}))
}

func TestGetHostDetail_HostnameFallbackAndSerialNormalization(t *testing.T) {
	cases := []struct {
		name            string
		hostname        interface{}
		detectedSysName interface{}
		serialNumber    interface{}
		wantHostname    *string
		wantSerial      *string
	}{
		{
			name:            "hostname 为空时回退 detected_sys_name 并返回 trimmed serial_number",
			hostname:        nil,
			detectedSysName: "SW-CORE-01",
			serialNumber:    " 210235A1B2C3 ",
			wantHostname:    strPtr("SW-CORE-01"),
			wantSerial:      strPtr("210235A1B2C3"),
		},
		{
			name:            "hostname 纯空白时同样回退 detected_sys_name",
			hostname:        "   ",
			detectedSysName: "  SW-EDGE-02  ",
			serialNumber:    "SN-EDGE-02",
			wantHostname:    strPtr("SW-EDGE-02"),
			wantSerial:      strPtr("SN-EDGE-02"),
		},
		{
			name:            "hostname 非空时优先保留 hostname",
			hostname:        "custom-host",
			detectedSysName: "SW-CORE-01",
			serialNumber:    "SN-001",
			wantHostname:    strPtr("custom-host"),
			wantSerial:      strPtr("SN-001"),
		},
		{
			name:            "hostname 与 detected_sys_name 均为空时返回 nil；纯空白 serial_number 归一化为 nil",
			hostname:        "  ",
			detectedSysName: "",
			serialNumber:    "   ",
			wantHostname:    nil,
			wantSerial:      nil,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
			defer cleanup()

			writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
			deviceID := 42

			rows := sqlmock.NewRows(hostDetailMockColumns()).AddRow(
				deviceID, "test-sw", "192.168.20.1", tc.hostname, tc.detectedSysName,
				"switch", "huawei", "S5700-28C-HI", tc.serialNumber, "3.30 V200R001C00",
				nil, "access", nil, "", "online",
				true, nil, nil, nil, nil,
				nil, nil, "online", "success", "",
				"", 0, nil, nil, 0,
			)
			mock.ExpectQuery(`SELECT\s+d\.id, d\.name, d\.ip_address, d\.hostname, d\.detected_sys_name`).
				WithArgs(deviceID, 1).
				WillReturnRows(rows)
			expectGetHostDetailSupportingQueries(mock, deviceID)

			detail, err := writer.GetHostDetail(context.Background(), deviceID, "", false, false, false)
			if err != nil {
				t.Fatalf("GetHostDetail() error = %v", err)
			}

			assertOptionalStrEqual(t, "Device.Hostname", detail.Device.Hostname, tc.wantHostname)
			assertOptionalStrEqual(t, "SerialNumber", detail.SerialNumber, tc.wantSerial)

			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("sqlmock expectations not met: %v", err)
			}
		})
	}
}

func TestQueryHostsMatrix_HostnameFallbackAndDetectedSysNameSearch(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	pattern := "%SW-CORE%"

	mock.ExpectQuery(`SELECT count\(\*\) FROM devices AS d .* COALESCE\(d\.detected_sys_name, ''\) ILIKE \$5`).
		WithArgs(true, pattern, pattern, pattern, pattern, pattern, pattern).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	rowCols := []string{
		"id", "name", "ip_address", "hostname", "detected_sys_name",
		"device_type", "vendor", "model", "group_id", "group_name",
		"status", "is_monitored", "cpu_usage", "memory_usage", "temperature",
		"uptime", "response_time", "last_seen", "icmp_status", "snmp_status",
		"cli_protocol", "last_error_code", "consecutive_failures", "backoff_until", "last_success_at",
		"last_duration_ms",
	}
	mock.ExpectQuery(`SELECT\s+d\.id, d\.name, d\.ip_address, d\.hostname, d\.detected_sys_name`).
		WithArgs(true, pattern, pattern, pattern, pattern, pattern, pattern, 20).
		WillReturnRows(sqlmock.NewRows(rowCols).AddRow(
			7, "core-sw", "10.0.0.1", nil, "SW-CORE-07",
			"switch", "huawei", "S5700", nil, "",
			"online", true, nil, nil, nil,
			nil, nil, nil, "online", "success",
			"", "", 0, nil, nil,
			0,
		))

	mock.ExpectQuery(`SELECT \* FROM "monitor_maintenances" WHERE enabled = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery(`SELECT device_id, SUM\(CASE WHEN COALESCE\(is_up, false\) THEN 1 ELSE 0 END\) AS up_cnt, COUNT\(\*\) AS total_cnt FROM "device_interfaces"`).
		WithArgs(7, true).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "up_cnt", "total_cnt"}))
	mock.ExpectQuery(`SELECT device_id, metric_value FROM "device_latest_metrics"`).
		WithArgs(7).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "metric_value"}))
	mock.ExpectQuery(`FROM device_metrics`).
		WithArgs(7, 12).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "collected_at", "metric_value"}))

	res, err := writer.QueryHostsMatrix(context.Background(), monitoring.HostsMatrixFilter{
		Search:   "SW-CORE",
		Page:     1,
		PageSize: 20,
	})
	if err != nil {
		t.Fatalf("QueryHostsMatrix() error = %v", err)
	}
	if len(res.Items) != 1 {
		t.Fatalf("len(Items) = %d, want 1", len(res.Items))
	}
	assertOptionalStrEqual(t, "Items[0].Hostname", res.Items[0].Hostname, strPtr("SW-CORE-07"))

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestGetHostDetail_InterfaceDisplayNameAndDescription(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	deviceID := 42

	devRows := sqlmock.NewRows(hostDetailMockColumns()).AddRow(
		deviceID, "test-sw", "192.168.20.1", nil, "SW-CORE-01",
		"switch", "huawei", "S5700-28C-HI", "210235A1B2C3", "3.30 V200R001C00",
		nil, "access", nil, "", "online",
		true, nil, nil, nil, nil,
		nil, nil, "online", "success", "",
		"", 0, nil, nil, 0,
	)
	mock.ExpectQuery(`SELECT\s+d\.id, d\.name, d\.ip_address, d\.hostname, d\.detected_sys_name`).
		WithArgs(deviceID, 1).
		WillReturnRows(devRows)

	mock.ExpectQuery(`SELECT \* FROM "monitor_maintenances" WHERE enabled = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery(`SELECT device_id, SUM\(CASE WHEN COALESCE\(is_up, false\) THEN 1 ELSE 0 END\) AS up_cnt, COUNT\(\*\) AS total_cnt FROM "device_interfaces"`).
		WithArgs(deviceID, true).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "up_cnt", "total_cnt"}))
	mock.ExpectQuery(`SELECT device_id, metric_value FROM "device_latest_metrics"`).
		WithArgs(deviceID).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "metric_value"}))

	ifaceRows := sqlmock.NewRows([]string{"id", "name", "alias", "description"}).
		AddRow(201, "if8", "GigabitEthernet0/0/3", nil).
		AddRow(202, "if8", "GigabitEthernet0/0/3", "To-Core-SW").
		AddRow(203, "if9", nil, "   ").
		AddRow(204, "GigabitEthernet0/0/1", nil, "Uplink")
	mock.ExpectQuery(`SELECT \* FROM "device_interfaces" WHERE device_id = \$1`).
		WithArgs(deviceID).
		WillReturnRows(ifaceRows)

	mock.ExpectQuery(`FROM device_metrics`).
		WithArgs(deviceID).
		WillReturnRows(sqlmock.NewRows([]string{"collected_at", "tags"}))
	mock.ExpectQuery(`FROM "device_neighbors" WHERE device_id = \$1`).
		WithArgs(deviceID).
		WillReturnRows(sqlmock.NewRows([]string{"local_port_id"}))
	mock.ExpectQuery(`FROM "alert_rules"`).
		WillReturnRows(sqlmock.NewRows([]string{"metric_name", "severity", "threshold_value"}))

	detail, err := writer.GetHostDetail(context.Background(), deviceID, "", false, false, false)
	if err != nil {
		t.Fatalf("GetHostDetail() error = %v", err)
	}
	if len(detail.Interfaces) != 4 {
		t.Fatalf("len(Interfaces) = %d, want 4", len(detail.Interfaces))
	}

	if detail.Interfaces[0].Name != "if8" || detail.Interfaces[0].DisplayName != "GigabitEthernet0/0/3" || detail.Interfaces[0].Description != nil {
		t.Fatalf("iface[0] = %+v", detail.Interfaces[0])
	}
	if detail.Interfaces[1].DisplayName != "GigabitEthernet0/0/3" || detail.Interfaces[1].Description == nil || *detail.Interfaces[1].Description != "To-Core-SW" {
		t.Fatalf("iface[1] = %+v", detail.Interfaces[1])
	}
	if detail.Interfaces[2].Name != "if9" || detail.Interfaces[2].DisplayName != "" || detail.Interfaces[2].Description != nil {
		t.Fatalf("iface[2] = %+v, want display_name='' and description=nil", detail.Interfaces[2])
	}
	if detail.Interfaces[3].DisplayName != "GigabitEthernet0/0/1" || detail.Interfaces[3].Description == nil || *detail.Interfaces[3].Description != "Uplink" {
		t.Fatalf("iface[3] = %+v", detail.Interfaces[3])
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func assertOptionalStrEqual(t *testing.T, field string, got, want *string) {
	t.Helper()
	if want == nil {
		if got != nil {
			t.Fatalf("%s = %q, want nil", field, *got)
		}
		return
	}
	if got == nil {
		t.Fatalf("%s = nil, want %q", field, *want)
	}
	if *got != *want {
		t.Fatalf("%s = %q, want %q", field, *got, *want)
	}
}
