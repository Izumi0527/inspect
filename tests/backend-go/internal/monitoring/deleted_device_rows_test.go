package monitoring_test

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

// 设备删除与指标写入之间有一轮采集的窗口：采集器拿着旧设备列表仍可能往 device_metrics
// 写入已删设备的样本。此前名字查不到就伪造成 "device_<id>" 画进图里，监控中心"全部设备"
// 视图因此出现幽灵曲线。现在查不到名字（devices 表已无此行）的样本直接丢弃。

func TestGetDevicePerformanceHistory_DropsRowsOfDeletedDevices(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	start := time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC)
	end := start.Add(time.Hour)

	mock.ExpectQuery(`(?is)SELECT time_bucket\('5 minutes', collected_at\).*GROUP BY bucket, device_id, metric_name ORDER BY bucket ASC`).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "device_id", "metric_name", "value"}).
			AddRow(start, 6, "cpu_usage", 10.0).
			AddRow(start, 6, "memory_usage", 40.0).
			AddRow(start, 21, "cpu_usage", 20.0))

	// devices 表只剩 21，6 已删除：名字查询只返回 21
	mock.ExpectQuery(deviceLabelQueryPattern+`\$1,\$2\)`).
		WithArgs(6, 21).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address", "name_count"}).
			AddRow(21, "测试", "192.168.20.1", 1))

	points, err := writer.GetDevicePerformanceHistory(context.Background(), start, end, nil)
	if err != nil {
		t.Fatalf("GetDevicePerformanceHistory() error = %v", err)
	}
	if len(points) != 1 {
		t.Fatalf("len(points) = %d, want 1", len(points))
	}
	devices := points[0].Devices
	if len(devices) != 1 {
		t.Fatalf("已删设备不应出现在序列中：devices = %v", devices)
	}
	if _, ok := devices["device_6"]; ok {
		t.Fatal("不应再伪造 device_6 这类名字")
	}
	if got := devices["测试"]; got.CPU != 20 {
		t.Fatalf(`devices["测试"] = %+v, want CPU 20`, got)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// 整桶都是已删设备的样本时，该时间点整体消失，不留空对象。
func TestGetDevicePerformanceHistory_AllRowsDeleted_ReturnsEmpty(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	start := time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC)
	end := start.Add(time.Hour)

	mock.ExpectQuery(`(?is)SELECT time_bucket\('5 minutes', collected_at\).*GROUP BY bucket, device_id, metric_name ORDER BY bucket ASC`).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "device_id", "metric_name", "value"}).
			AddRow(start, 6, "cpu_usage", 10.0))

	mock.ExpectQuery(deviceLabelQueryPattern + `\$1\)`).
		WithArgs(6).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address", "name_count"}))

	points, err := writer.GetDevicePerformanceHistory(context.Background(), start, end, nil)
	if err != nil {
		t.Fatalf("GetDevicePerformanceHistory() error = %v", err)
	}
	if len(points) != 0 {
		t.Fatalf("全是已删设备时应返回空序列，got %+v", points)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestGetTemperatureHistory_DropsRowsOfDeletedDevices(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	start := time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC)
	end := start.Add(time.Hour)

	mock.ExpectQuery(`(?is)SELECT time_bucket\('5 minutes', collected_at\) AS bucket, device_id, AVG\(metric_value\) AS value FROM device_metrics WHERE metric_name = \$1 AND collected_at >= \$2 AND collected_at <= \$3 GROUP BY bucket, device_id ORDER BY bucket ASC`).
		WithArgs("temperature", start, end).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "device_id", "value"}).
			AddRow(start, 6, 41.0).
			AddRow(start, 21, 43.0))

	mock.ExpectQuery(deviceLabelQueryPattern+`\$1,\$2\)`).
		WithArgs(6, 21).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address", "name_count"}).
			AddRow(21, "测试", "192.168.20.1", 1))

	points, err := writer.GetTemperatureHistory(context.Background(), start, end, nil)
	if err != nil {
		t.Fatalf("GetTemperatureHistory() error = %v", err)
	}
	if len(points) != 1 || len(points[0].Devices) != 1 {
		t.Fatalf("已删设备不应出现在序列中：points = %+v", points)
	}
	if _, ok := points[0].Devices["device_6"]; ok {
		t.Fatal("不应再伪造 device_6 这类名字")
	}
	if points[0].Devices["测试"] != 43 {
		t.Fatalf("devices = %v, want 只含「测试」=43", points[0].Devices)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
