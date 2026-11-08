package monitoring_test

import (
	"context"
	"testing"
	"time"
	_ "unsafe"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

// 监控中心页的采样间隔由调用方显式传入：页面四个时序查询（性能/温度/聚合流量/单接口流量）
// 统一传 monitoring.DashboardSampleInterval（5 分钟，与采集任务 cron */5 一致），
// 使 1h~14d 各档位点位密度一致、且每个桶恰好覆盖一次采集；
// 报告导出、流量分析等长时段消费者传 monitoring.AutoBucket，继续按范围分档。
func TestDashboardSampleInterval_ForcesFiveMinuteBucketOnLongRanges(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	start := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	end := start.Add(7 * 24 * time.Hour)
	ctx := context.Background()

	// 性能趋势：7 天档走 5 分钟桶（分档策略下是 30 分钟）
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

// 批量历史（POST /monitoring/devices/historical）≥48h 时按小时聚合，直接读原始表。
func TestGetBulkMetricsHistory_LongRangeAggregatesHourlyFromRawTable(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	start := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	end := start.Add(7 * 24 * time.Hour)
	bucket := start.Add(time.Hour)

	mock.ExpectQuery(`(?is)SELECT time_bucket\('1 hour', collected_at\) AS bucket, device_id, metric_name, AVG\(metric_value\) AS metric_value FROM "device_metrics" WHERE \(collected_at >= \$1 AND collected_at <= \$2\) AND device_id IN \(\$3\) GROUP BY bucket, device_id, metric_name ORDER BY bucket ASC`).
		WithArgs(start, end, 4).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "device_id", "metric_name", "metric_value"}).
			AddRow(bucket, 4, "cpu_usage", 42.0))

	points, err := writer.GetBulkMetricsHistory(context.Background(), []int{4}, start, end, nil)
	if err != nil {
		t.Fatalf("GetBulkMetricsHistory() error = %v", err)
	}
	if len(points) != 1 || points[0].Value == nil || *points[0].Value != 42 || points[0].DeviceID != 4 {
		t.Fatalf("points = %+v, want one cpu_usage point of device 4 = 42", points)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

//go:linkname bucketSizeForRange github.com/your-org/inspect-system/backend-go/internal/monitoring.bucketSizeForRange
func bucketSizeForRange(start time.Time, end time.Time) time.Duration

// AutoBucket（报告导出、流量分析、通用历史端点）按「点数预算」选桶：从对齐 5 分钟采集的阶梯里
// 取单序列点数不超过 360 的最小桶。桶宽直接进 SQL，没有另一层封顶——声明与实际由构造保证一致。
func TestAutoBucket_PicksSmallestCollectionAlignedBucketWithinPointBudget(t *testing.T) {
	cases := []struct {
		rangeLabel string
		span       time.Duration
		wantSQL    string
	}{
		{"1h", time.Hour, "5 minutes"},
		{"3h", 3 * time.Hour, "5 minutes"},
		{"6h", 6 * time.Hour, "5 minutes"},
		{"12h", 12 * time.Hour, "5 minutes"},
		{"24h", 24 * time.Hour, "5 minutes"},
		{"48h", 48 * time.Hour, "10 minutes"},
		{"3d", 3 * 24 * time.Hour, "15 minutes"},
		{"7d", 7 * 24 * time.Hour, "30 minutes"},
		{"14d", 14 * 24 * time.Hour, "1 hour"},
		{"30d", 30 * 24 * time.Hour, "3 hours"},
	}
	for _, tc := range cases {
		t.Run(tc.rangeLabel, func(t *testing.T) {
			db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
			defer cleanup()
			writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

			start := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
			end := start.Add(tc.span)
			mock.ExpectQuery(`(?is)^SELECT time_bucket\('`+tc.wantSQL+`', collected_at\) AS bucket, device_id, AVG\(metric_value\) AS value FROM device_metrics WHERE metric_name = \$1`).
				WithArgs("temperature", start, end).
				WillReturnRows(sqlmock.NewRows([]string{"bucket", "device_id", "value"}))
			if _, err := writer.GetTemperatureHistory(context.Background(), start, end, nil, monitoring.AutoBucket); err != nil {
				t.Fatalf("GetTemperatureHistory() error = %v", err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("sqlmock expectations not met: %v", err)
			}
		})
	}
}

// 不变量：任意范围的分档桶都是采样间隔的整数倍（桶内样本数恒定），且点数不超过预算。
func TestAutoBucket_InvariantsAcrossRanges(t *testing.T) {
	const maxPoints = 360
	start := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	for span := time.Minute; span <= 60*24*time.Hour; span += 17 * time.Minute {
		bucket := bucketSizeForRange(start, start.Add(span))
		if bucket%monitoring.DashboardSampleInterval != 0 {
			t.Fatalf("span=%v bucket=%v，不是采样间隔 %v 的整数倍", span, bucket, monitoring.DashboardSampleInterval)
		}
		if points := span / bucket; points > maxPoints && bucket < 24*time.Hour {
			t.Fatalf("span=%v bucket=%v 点数 %d 超过预算 %d", span, bucket, points, maxPoints)
		}
	}
}
