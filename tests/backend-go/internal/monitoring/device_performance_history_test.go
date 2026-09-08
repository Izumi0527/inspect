package monitoring_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

// 性能趋势按设备区分：一条 SQL 同时取 cpu_usage/memory_usage，按 bucket+device_id+metric_name 分组，
// 展平为 [{timestamp, devices:{设备名:{cpu,memory}}}]，供监控中心逐设备绘线。
func TestGetDevicePerformanceHistory_MinuteBucket_GroupsByDeviceAndMetric(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	start := time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC)
	end := start.Add(time.Hour)
	bucket1 := start
	bucket2 := start.Add(5 * time.Minute)

	mock.ExpectQuery(`(?is)SELECT time_bucket\('5 minutes', collected_at\) AS bucket, device_id, metric_name, AVG\(metric_value\) AS value FROM device_metrics WHERE metric_name IN \(\$1,\$2\) AND collected_at >= \$3 AND collected_at <= \$4 AND device_id IN \(\$5,\$6\) GROUP BY bucket, device_id, metric_name ORDER BY bucket ASC`).
		WithArgs("cpu_usage", "memory_usage", start, end, 1, 2).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "device_id", "metric_name", "value"}).
			AddRow(bucket1, 1, "cpu_usage", 10.0).
			AddRow(bucket1, 1, "memory_usage", 40.0).
			AddRow(bucket1, 2, "cpu_usage", 20.0).
			AddRow(bucket1, 2, "memory_usage", 50.0).
			AddRow(bucket2, 1, "cpu_usage", 12.0))

	mock.ExpectQuery(`(?is)SELECT id, name FROM "devices" WHERE id IN \(\$1,\$2\)`).
		WithArgs(1, 2).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name"}).
			AddRow(1, "SW-01").
			AddRow(2, "SW-02"))

	points, err := writer.GetDevicePerformanceHistory(context.Background(), start, end, []int{1, 2})
	if err != nil {
		t.Fatalf("GetDevicePerformanceHistory() error = %v", err)
	}
	if len(points) != 2 {
		t.Fatalf("len(points) = %d, want 2", len(points))
	}

	first := points[0]
	if first.Timestamp != bucket1.Format(time.RFC3339Nano) {
		t.Fatalf("points[0].Timestamp = %q, want %q", first.Timestamp, bucket1.Format(time.RFC3339Nano))
	}
	if got := first.Devices["SW-01"]; got.CPU != 10 || got.Memory != 40 {
		t.Fatalf("points[0].Devices[SW-01] = %+v, want {CPU:10 Memory:40}", got)
	}
	if got := first.Devices["SW-02"]; got.CPU != 20 || got.Memory != 50 {
		t.Fatalf("points[0].Devices[SW-02] = %+v, want {CPU:20 Memory:50}", got)
	}

	second := points[1]
	if second.Timestamp != bucket2.Format(time.RFC3339Nano) {
		t.Fatalf("points[1].Timestamp = %q, want %q", second.Timestamp, bucket2.Format(time.RFC3339Nano))
	}
	if _, ok := second.Devices["SW-02"]; ok {
		t.Fatalf("points[1] should not contain SW-02 (no rows in that bucket)")
	}
	if got := second.Devices["SW-01"]; got.CPU != 12 || got.Memory != 0 {
		t.Fatalf("points[1].Devices[SW-01] = %+v, want {CPU:12 Memory:0}", got)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// 小时桶：优先读 device_metrics_hourly，缺表（SQLSTATE 42P01）时回退到 time_bucket('1 hour') 动态聚合。
func TestGetDevicePerformanceHistory_HourlyBucket_FallsBackWhenHourlyTableMissing(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	start := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	end := start.Add(7 * 24 * time.Hour)
	bucket := start

	mock.ExpectQuery(`(?is)SELECT bucket, device_id, metric_name, avg_value AS value FROM "device_metrics_hourly" WHERE metric_name IN \(\$1,\$2\) AND \(bucket >= \$3 AND bucket <= \$4\) ORDER BY bucket ASC`).
		WithArgs("cpu_usage", "memory_usage", start, end).
		WillReturnError(errors.New(`ERROR: relation "device_metrics_hourly" does not exist (SQLSTATE 42P01)`))

	mock.ExpectQuery(`(?is)SELECT time_bucket\('1 hour', collected_at\) AS bucket, device_id, metric_name, AVG\(metric_value\) AS value FROM device_metrics WHERE metric_name IN \(\$1,\$2\) AND collected_at >= \$3 AND collected_at <= \$4 GROUP BY bucket, device_id, metric_name ORDER BY bucket ASC`).
		WithArgs("cpu_usage", "memory_usage", start, end).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "device_id", "metric_name", "value"}).
			AddRow(bucket, 7, "cpu_usage", 33.0).
			AddRow(bucket, 7, "memory_usage", 66.0))

	mock.ExpectQuery(`(?is)SELECT id, name FROM "devices" WHERE id IN \(\$1\)`).
		WithArgs(7).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name"}).AddRow(7, "CORE-A"))

	points, err := writer.GetDevicePerformanceHistory(context.Background(), start, end, nil)
	if err != nil {
		t.Fatalf("GetDevicePerformanceHistory() error = %v", err)
	}
	if len(points) != 1 {
		t.Fatalf("len(points) = %d, want 1", len(points))
	}
	if got := points[0].Devices["CORE-A"]; got.CPU != 33 || got.Memory != 66 {
		t.Fatalf("points[0].Devices[CORE-A] = %+v, want {CPU:33 Memory:66}", got)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// 无数据时返回空切片（JSON 输出 [] 而非 null），且不再查询 devices 表。
func TestGetDevicePerformanceHistory_NoRows_ReturnsEmptySliceWithoutNameLookup(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	start := time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC)
	end := start.Add(time.Hour)

	mock.ExpectQuery(`(?is)SELECT time_bucket\('5 minutes', collected_at\) AS bucket, device_id, metric_name, AVG\(metric_value\) AS value FROM device_metrics WHERE .* GROUP BY bucket, device_id, metric_name ORDER BY bucket ASC`).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "device_id", "metric_name", "value"}))

	points, err := writer.GetDevicePerformanceHistory(context.Background(), start, end, nil)
	if err != nil {
		t.Fatalf("GetDevicePerformanceHistory() error = %v", err)
	}
	if points == nil {
		t.Fatalf("points should be an empty slice, got nil")
	}
	if len(points) != 0 {
		t.Fatalf("len(points) = %d, want 0", len(points))
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
