package monitoring_test

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

const upInterfacesQueryPattern = `(?is)SELECT name, alias, speed FROM device_interfaces WHERE device_id = \$1 AND is_up = TRUE`

// 接口列表只含物理 UP 口（Vlanif/LoopBack/NULL/Console 等逻辑口剔除），按 ifIndex 升序，
// label 缺省回退 name；未指定接口时默认取首个物理口，按 (接口, 时间桶) AVG 后输出 Mbps。
func TestGetDeviceInterfaceTraffic_DefaultsToFirstPhysicalUpInterface(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	start := time.Date(2026, 9, 10, 2, 0, 0, 0, time.UTC)
	end := start.Add(time.Hour)
	bucket1 := start
	bucket2 := start.Add(5 * time.Minute)
	speed := int64(1000)

	mock.ExpectQuery(upInterfacesQueryPattern).
		WithArgs(6).
		WillReturnRows(sqlmock.NewRows([]string{"name", "alias", "speed"}).
			AddRow("if6", "GigabitEthernet0/0/1", speed).
			AddRow("if5", "Vlanif1", speed).
			AddRow("if1", "InLoopBack0", nil).
			AddRow("if2", "NULL0", nil).
			AddRow("if3", "Console9/0/0", nil).
			AddRow("if4", nil, nil))

	mock.ExpectQuery(`(?is)SELECT bucket, SUM\(inbound\) AS inbound, SUM\(outbound\) AS outbound FROM \(SELECT time_bucket\('5 minutes', collected_at\) AS bucket, interface_name, AVG\(CASE WHEN metric_name IN \('bandwidth_in','network_bytes_in','throughput_in'\) THEN metric_value END\) AS inbound, AVG\(CASE WHEN metric_name IN \('bandwidth_out','network_bytes_out','throughput_out'\) THEN metric_value END\) AS outbound FROM interface_metrics WHERE device_id = \$1 AND collected_at >= \$2 AND collected_at <= \$3 AND metric_name IN \('bandwidth_in','network_bytes_in','throughput_in','bandwidth_out','network_bytes_out','throughput_out'\) AND interface_name = \$4 GROUP BY bucket, interface_name\) AS per_interface GROUP BY bucket ORDER BY bucket ASC`).
		WithArgs(6, start, end, "if4").
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "inbound", "outbound"}).
			AddRow(bucket1, 2_500_000.0, 500_000.0).
			AddRow(bucket2, nil, 1_000_000.0))

	result, err := writer.GetDeviceInterfaceTraffic(context.Background(), 6, start, end, "")
	if err != nil {
		t.Fatalf("GetDeviceInterfaceTraffic() error = %v", err)
	}

	if result.DeviceID != 6 || result.Interface != "if4" {
		t.Fatalf("result = {DeviceID:%d Interface:%q}, want {6 \"if4\"}（默认首个物理 UP 口）", result.DeviceID, result.Interface)
	}
	if len(result.Interfaces) != 2 {
		t.Fatalf("Interfaces = %+v, want only the 2 physical interfaces", result.Interfaces)
	}
	if result.Interfaces[0].Name != "if4" || result.Interfaces[0].Label != "if4" || result.Interfaces[0].SpeedMbps != nil {
		t.Fatalf("Interfaces[0] = %+v, want {Name:if4 Label:if4 SpeedMbps:nil}", result.Interfaces[0])
	}
	if result.Interfaces[1].Name != "if6" || result.Interfaces[1].Label != "GigabitEthernet0/0/1" || result.Interfaces[1].SpeedMbps == nil || *result.Interfaces[1].SpeedMbps != 1000 {
		t.Fatalf("Interfaces[1] = %+v, want {Name:if6 Label:GigabitEthernet0/0/1 SpeedMbps:1000}", result.Interfaces[1])
	}

	if len(result.Points) != 2 {
		t.Fatalf("len(Points) = %d, want 2", len(result.Points))
	}
	if got := result.Points[0]; got.Timestamp != bucket1.Format(time.RFC3339Nano) || got.Inbound != 2.5 || got.Outbound != 0.5 {
		t.Fatalf("Points[0] = %+v, want {%s 2.5 0.5}", got, bucket1.Format(time.RFC3339Nano))
	}
	if got := result.Points[1]; got.Inbound != 0 || got.Outbound != 1 {
		t.Fatalf("Points[1] = %+v, want inbound 0 (NULL) / outbound 1", got)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// 指定单个接口时按 interface_name 精确过滤，接口列表仍返回全部物理 UP 口供选择器使用。
func TestGetDeviceInterfaceTraffic_SingleInterface_FiltersByName(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	start := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	end := start.Add(7 * 24 * time.Hour)

	mock.ExpectQuery(upInterfacesQueryPattern).
		WithArgs(6).
		WillReturnRows(sqlmock.NewRows([]string{"name", "alias", "speed"}).
			AddRow("if6", "GigabitEthernet0/0/1", int64(1000)).
			AddRow("if7", "GigabitEthernet0/0/2", int64(1000)))

	mock.ExpectQuery(`(?is)time_bucket\('1 hour', collected_at\).* AND interface_name = \$4 GROUP BY bucket, interface_name\) AS per_interface GROUP BY bucket ORDER BY bucket ASC`).
		WithArgs(6, start, end, "if7").
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "inbound", "outbound"}).
			AddRow(start, 8_000_000.0, 4_000_000.0))

	result, err := writer.GetDeviceInterfaceTraffic(context.Background(), 6, start, end, " if7 ")
	if err != nil {
		t.Fatalf("GetDeviceInterfaceTraffic() error = %v", err)
	}
	if result.Interface != "if7" {
		t.Fatalf("result.Interface = %q, want if7", result.Interface)
	}
	if len(result.Interfaces) != 2 || result.Interfaces[0].Name != "if6" || result.Interfaces[1].Name != "if7" {
		t.Fatalf("Interfaces = %+v, want [if6 if7] in ifIndex order", result.Interfaces)
	}
	if len(result.Points) != 1 || result.Points[0].Inbound != 8 || result.Points[0].Outbound != 4 {
		t.Fatalf("Points = %+v, want single point 8/4 Mbps", result.Points)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// 设备没有 UP 接口时不执行时序查询，points 为空切片（JSON 输出 [] 而非 null）。
func TestGetDeviceInterfaceTraffic_NoUpInterfaces_SkipsSeriesQuery(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	start := time.Date(2026, 9, 10, 2, 0, 0, 0, time.UTC)
	end := start.Add(time.Hour)

	mock.ExpectQuery(upInterfacesQueryPattern).
		WithArgs(6).
		WillReturnRows(sqlmock.NewRows([]string{"name", "alias", "speed"}))

	result, err := writer.GetDeviceInterfaceTraffic(context.Background(), 6, start, end, "")
	if err != nil {
		t.Fatalf("GetDeviceInterfaceTraffic() error = %v", err)
	}
	if result.Interfaces == nil || len(result.Interfaces) != 0 {
		t.Fatalf("Interfaces = %#v, want empty non-nil slice", result.Interfaces)
	}
	if result.Points == nil || len(result.Points) != 0 {
		t.Fatalf("Points = %#v, want empty non-nil slice", result.Points)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// UP 口全是逻辑口时同样视为无可选接口：不查时序、interface 为空。
func TestGetDeviceInterfaceTraffic_OnlyLogicalUpInterfaces_ReturnsEmpty(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	start := time.Date(2026, 9, 10, 2, 0, 0, 0, time.UTC)
	end := start.Add(time.Hour)

	mock.ExpectQuery(upInterfacesQueryPattern).
		WithArgs(6).
		WillReturnRows(sqlmock.NewRows([]string{"name", "alias", "speed"}).
			AddRow("if1", "InLoopBack0", nil).
			AddRow("if5", "Vlanif1", int64(1000)))

	result, err := writer.GetDeviceInterfaceTraffic(context.Background(), 6, start, end, "")
	if err != nil {
		t.Fatalf("GetDeviceInterfaceTraffic() error = %v", err)
	}
	if result.Interface != "" || len(result.Interfaces) != 0 || len(result.Points) != 0 {
		t.Fatalf("result = %+v, want no selectable interface and no points", result)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
