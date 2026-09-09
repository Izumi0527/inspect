package monitoring_test

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

// devices.name 无唯一约束；重名设备若都以名字作字典键会互相覆盖，
// 期望对全表重名的设备追加唯一 IP："核心交换机 (10.0.0.1)"，不重名者保持原名。
const deviceLabelQueryPattern = `(?is)SELECT d\.id, d\.name, d\.ip_address, COALESCE\(c\.name_count, 1\) AS name_count\s+FROM devices d\s+LEFT JOIN \(SELECT name, COUNT\(\*\) AS name_count FROM devices GROUP BY name\) c ON c\.name = d\.name\s+WHERE d\.id IN \(`

func TestGetDevicePerformanceHistory_DuplicateDeviceNames_GetIPSuffix(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	start := time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC)
	end := start.Add(time.Hour)

	mock.ExpectQuery(`(?is)SELECT time_bucket\('5 minutes', collected_at\).*GROUP BY bucket, device_id, metric_name ORDER BY bucket ASC`).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "device_id", "metric_name", "value"}).
			AddRow(start, 1, "cpu_usage", 10.0).
			AddRow(start, 2, "cpu_usage", 20.0).
			AddRow(start, 3, "cpu_usage", 30.0))

	mock.ExpectQuery(deviceLabelQueryPattern+`\$1,\$2,\$3\)`).
		WithArgs(1, 2, 3).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address", "name_count"}).
			AddRow(1, "核心交换机", "10.0.0.1", 2).
			AddRow(2, "核心交换机", "10.0.0.2", 2).
			AddRow(3, "接入交换机", "10.0.0.3", 1))

	points, err := writer.GetDevicePerformanceHistory(context.Background(), start, end, nil)
	if err != nil {
		t.Fatalf("GetDevicePerformanceHistory() error = %v", err)
	}
	if len(points) != 1 {
		t.Fatalf("len(points) = %d, want 1", len(points))
	}
	devices := points[0].Devices
	if len(devices) != 3 {
		t.Fatalf("重名设备被覆盖：devices = %v, want 3 个键", devices)
	}
	if got := devices["核心交换机 (10.0.0.1)"]; got.CPU != 10 {
		t.Fatalf(`devices["核心交换机 (10.0.0.1)"] = %+v, want CPU 10`, got)
	}
	if got := devices["核心交换机 (10.0.0.2)"]; got.CPU != 20 {
		t.Fatalf(`devices["核心交换机 (10.0.0.2)"] = %+v, want CPU 20`, got)
	}
	if got := devices["接入交换机"]; got.CPU != 30 {
		t.Fatalf(`不重名设备不应加后缀，devices["接入交换机"] = %+v`, got)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestGetTemperatureHistory_DuplicateDeviceNames_GetIPSuffix(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	start := time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC)
	end := start.Add(time.Hour)

	mock.ExpectQuery(`(?is)SELECT time_bucket\('5 minutes', collected_at\) AS bucket, device_id, AVG\(metric_value\) AS value FROM device_metrics WHERE metric_name = \$1 AND collected_at >= \$2 AND collected_at <= \$3 GROUP BY bucket, device_id ORDER BY bucket ASC`).
		WithArgs("temperature", start, end).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "device_id", "value"}).
			AddRow(start, 1, 41.0).
			AddRow(start, 2, 43.0))

	mock.ExpectQuery(deviceLabelQueryPattern+`\$1,\$2\)`).
		WithArgs(1, 2).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address", "name_count"}).
			AddRow(1, "核心交换机", "10.0.0.1", 2).
			AddRow(2, "核心交换机", "10.0.0.2", 2))

	points, err := writer.GetTemperatureHistory(context.Background(), start, end, nil)
	if err != nil {
		t.Fatalf("GetTemperatureHistory() error = %v", err)
	}
	if len(points) != 1 || len(points[0].Devices) != 2 {
		t.Fatalf("重名设备被覆盖：points = %+v", points)
	}
	if points[0].Devices["核心交换机 (10.0.0.1)"] != 41 || points[0].Devices["核心交换机 (10.0.0.2)"] != 43 {
		t.Fatalf("devices = %v, want 两个带 IP 后缀的键", points[0].Devices)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
