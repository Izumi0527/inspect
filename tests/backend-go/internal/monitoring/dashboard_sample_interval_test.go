package monitoring_test

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

// 监控中心页的采样间隔由调用方显式传入：页面四个时序查询（性能/温度/聚合流量/单接口流量）
// 统一传 monitoring.DashboardSampleInterval（5 分钟），使 1h~14d 各档位点位密度一致；
// 报告导出、流量分析等长时段消费者传 monitoring.AutoBucket，继续按范围分档。
func TestDashboardSampleInterval_ForcesFiveMinuteBucketOnLongRanges(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	start := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	end := start.Add(7 * 24 * time.Hour)
	ctx := context.Background()

	// 性能趋势：7 天档走 5 分钟桶（分档策略下是 1 小时）
	mock.ExpectQuery(`(?is)SELECT time_bucket\('5 minutes', collected_at\) AS bucket, device_id, metric_name, AVG\(metric_value\) AS value FROM device_metrics WHERE metric_name IN \(\$1,\$2\) AND collected_at >= \$3 AND collected_at <= \$4 GROUP BY bucket, device_id, metric_name ORDER BY bucket ASC`).
		WithArgs("cpu_usage", "memory_usage", start, end).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "device_id", "metric_name", "value"}))
	if _, err := writer.GetDevicePerformanceHistory(ctx, start, end, nil, monitoring.DashboardSampleInterval); err != nil {
		t.Fatalf("GetDevicePerformanceHistory() error = %v", err)
	}

	// 温度：7 天档走 5 分钟桶
	mock.ExpectQuery(`(?is)SELECT time_bucket\('5 minutes', collected_at\) AS bucket, device_id, AVG\(metric_value\) AS value FROM device_metrics WHERE metric_name = \$1 AND collected_at >= \$2 AND collected_at <= \$3 GROUP BY bucket, device_id ORDER BY bucket ASC`).
		WithArgs("temperature", start, end).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "device_id", "value"}))
	if _, err := writer.GetTemperatureHistory(ctx, start, end, nil, monitoring.DashboardSampleInterval); err != nil {
		t.Fatalf("GetTemperatureHistory() error = %v", err)
	}

	// 聚合流量：7 天档走 5 分钟桶
	mock.ExpectQuery(sprintfPattern(aggregateTrafficQueryPattern, "5 minutes", "")).
		WithArgs(start, end).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "inbound", "outbound"}))
	if _, err := writer.GetNetworkTrafficHistory(ctx, start, end, nil, monitoring.DashboardSampleInterval); err != nil {
		t.Fatalf("GetNetworkTrafficHistory() error = %v", err)
	}

	// 单设备接口流量（监控页流量卡接口视图）：7 天档同样走 5 分钟桶
	speed := int64(1000)
	mock.ExpectQuery(upInterfacesQueryPattern).
		WithArgs(6).
		WillReturnRows(sqlmock.NewRows([]string{"name", "alias", "speed"}).AddRow("if6", "GigabitEthernet0/0/1", speed))
	mock.ExpectQuery(`(?is)FROM interface_metrics WHERE device_id = \$1 AND collected_at >= \$2 AND collected_at <= \$3.*time_bucket\('5 minutes', collected_at\)|(?is)time_bucket\('5 minutes', collected_at\).*FROM interface_metrics`).
		WithArgs(6, start, end, "if6").
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "inbound", "outbound"}))
	if _, err := writer.GetDeviceInterfaceTraffic(ctx, 6, start, end, "", monitoring.DashboardSampleInterval); err != nil {
		t.Fatalf("GetDeviceInterfaceTraffic() error = %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// AutoBucket 保持既有分档口径：7 天档仍按小时聚合（缺 hourly 聚合表时回退动态 1 小时桶），
// 保证报告导出与流量分析的数据量与渲染成本不被本次改动放大。
func TestAutoBucket_KeepsTieredBucketPolicy(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	start := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	end := start.Add(7 * 24 * time.Hour)

	mock.ExpectQuery(`(?is)FROM "device_metrics_hourly"`).
		WillReturnError(undefinedRelationErr("device_metrics_hourly"))
	mock.ExpectQuery(`(?is)SELECT time_bucket\('1 hour', collected_at\) AS bucket, device_id, AVG\(metric_value\) AS value FROM device_metrics WHERE metric_name = \$1 AND collected_at >= \$2 AND collected_at <= \$3 GROUP BY bucket, device_id ORDER BY bucket ASC`).
		WithArgs("temperature", start, end).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "device_id", "value"}))
	if _, err := writer.GetTemperatureHistory(context.Background(), start, end, nil, monitoring.AutoBucket); err != nil {
		t.Fatalf("GetTemperatureHistory() error = %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// 1 小时档：页面路径与分档策略一致，都落在 5 分钟桶上（回归保护，避免改动把短档也改坏）。
func TestAutoBucket_ShortRangeMatchesDashboardInterval(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	start := time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC)
	end := start.Add(time.Hour)

	mock.ExpectQuery(`(?is)SELECT time_bucket\('5 minutes', collected_at\) AS bucket, device_id, AVG\(metric_value\) AS value FROM device_metrics WHERE metric_name = \$1 AND collected_at >= \$2 AND collected_at <= \$3 GROUP BY bucket, device_id ORDER BY bucket ASC`).
		WithArgs("temperature", start, end).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "device_id", "value"}))
	if _, err := writer.GetTemperatureHistory(context.Background(), start, end, nil, monitoring.AutoBucket); err != nil {
		t.Fatalf("GetTemperatureHistory() error = %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
