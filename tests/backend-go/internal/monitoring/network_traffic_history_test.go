package monitoring_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

func sprintfPattern(pattern string, args ...interface{}) string {
	return fmt.Sprintf(pattern, args...)
}

// 聚合流量口径（方案 A）：只读 device_metrics 并关联 devices 限定活跃设备（is_active = TRUE）；
// 设备级 bandwidth_* 已是采集器按物理接口累加的结果，再并上 interface_metrics 会 ×2，
// 同一（桶, 设备）内多样本取 AVG（速率是瞬时量，采集周期与桶宽不对齐时 SUM 会把双样本桶放大一倍），跨设备再 SUM。
const aggregateTrafficQueryPattern = `(?is)SELECT bucket, SUM\(inbound\) AS inbound, SUM\(outbound\) AS outbound FROM \(SELECT time_bucket\('%s', dm\.collected_at\) AS bucket, dm\.device_id, AVG\(CASE WHEN dm\.metric_name IN \('bandwidth_in','network_bytes_in','throughput_in'\) THEN dm\.metric_value END\) AS inbound, AVG\(CASE WHEN dm\.metric_name IN \('bandwidth_out','network_bytes_out','throughput_out'\) THEN dm\.metric_value END\) AS outbound FROM device_metrics dm INNER JOIN devices d ON d\.id = dm\.device_id WHERE dm\.collected_at >= \$1 AND dm\.collected_at <= \$2 AND d\.is_active = TRUE AND dm\.metric_name IN \('bandwidth_in','network_bytes_in','throughput_in','bandwidth_out','network_bytes_out','throughput_out'\)%s GROUP BY bucket, dm\.device_id\) AS per_device GROUP BY bucket ORDER BY bucket ASC$`

func TestGetNetworkTrafficHistory_ShouldAverageWithinDeviceBucketThenSumAcrossDevices(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	start := time.Date(2026, 9, 10, 0, 0, 0, 0, time.UTC)
	end := start.Add(24 * time.Hour)
	bucket := start.Add(5 * time.Minute)

	mock.ExpectQuery(sprintfPattern(aggregateTrafficQueryPattern, "5 minutes", ` AND dm\.device_id IN \(\$3,\$4\)`)).
		WithArgs(start, end, 1, 2).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "inbound", "outbound"}).
			AddRow(bucket, 3_000_000.0, 1_000_000.0))

	points, err := writer.GetNetworkTrafficHistory(context.Background(), start, end, []int{1, 2}, monitoring.AutoBucket)
	if err != nil {
		t.Fatalf("GetNetworkTrafficHistory() error = %v", err)
	}
	if len(points) != 1 {
		t.Fatalf("points = %d, want 1", len(points))
	}
	if points[0].Inbound != 3 || points[0].Outbound != 1 {
		t.Fatalf("point = %+v, want inbound 3 Mbps / outbound 1 Mbps", points[0])
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// 长时段与短时段走同一形状的原始表聚合 SQL，只是桶宽不同（7 天档为 30 分钟）。
func TestGetNetworkTrafficHistory_LongRangeUsesSameShape(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	start := time.Date(2026, 9, 3, 0, 0, 0, 0, time.UTC)
	end := start.Add(7 * 24 * time.Hour)

	mock.ExpectQuery(sprintfPattern(aggregateTrafficQueryPattern, "30 minutes", "")).
		WithArgs(start, end).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "inbound", "outbound"}))

	if _, err := writer.GetNetworkTrafficHistory(context.Background(), start, end, nil, monitoring.AutoBucket); err != nil {
		t.Fatalf("GetNetworkTrafficHistory() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestPeakNetworkMetrics24h_ShouldAveragePerDeviceBucketBeforeSumAndMax(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	mock.ExpectQuery(`(?is)WITH per_device AS \(\s*SELECT\s+time_bucket\('5 minutes', dm\.collected_at\) AS bucket,\s+dm\.device_id,\s+AVG\(CASE WHEN dm\.metric_name IN \(\$1,\$2,\$3\) THEN dm\.metric_value END\) AS inbound,\s+AVG\(CASE WHEN dm\.metric_name IN \(\$4,\$5,\$6\) THEN dm\.metric_value END\) AS outbound\s+FROM device_metrics dm\s+INNER JOIN devices d ON d\.id = dm\.device_id\s+WHERE dm\.metric_name IN \(\$7,\$8,\$9,\$10,\$11,\$12\)\s+AND dm\.collected_at >= NOW\(\) - INTERVAL '24 hours'\s+AND d\.is_active = TRUE\s+AND dm\.metric_value < \$13\s+GROUP BY bucket, dm\.device_id\s*\),\s*time_buckets AS \(\s*SELECT bucket, SUM\(inbound\) AS inbound, SUM\(outbound\) AS outbound FROM per_device GROUP BY bucket\s*\)\s*SELECT\s+MAX\(inbound\) AS peak_inbound.*`).
		WillReturnRows(sqlmock.NewRows([]string{"peak_inbound", "peak_outbound", "peak_combined", "sample_count"}).
			AddRow(10.0, 20.0, 30.0, 1))

	snapshot, err := monitoring.PeakNetworkMetrics24h(context.Background(), db, nil)
	if err != nil {
		t.Fatalf("PeakNetworkMetrics24h() error = %v", err)
	}
	if !snapshot.HasData || snapshot.Combined != 30 {
		t.Fatalf("snapshot = %+v, want HasData with combined 30", snapshot)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestPeakNetworkMetrics24h_FiltersActiveDevicesAndSelectedDeviceIDs(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	mock.ExpectQuery(`(?is)WITH per_device AS \(\s*SELECT\s+time_bucket\('5 minutes', dm\.collected_at\) AS bucket,\s+dm\.device_id,.*FROM device_metrics dm\s+INNER JOIN devices d ON d\.id = dm\.device_id\s+WHERE dm\.metric_name IN \(\$7,\$8,\$9,\$10,\$11,\$12\).*AND d\.is_active = TRUE\s+AND dm\.metric_value < \$13\s+AND dm\.device_id IN \(\$14,\$15\)\s+GROUP BY bucket, dm\.device_id`).
		WithArgs(
			"bandwidth_in", "network_bytes_in", "throughput_in",
			"bandwidth_out", "network_bytes_out", "throughput_out",
			"bandwidth_in", "network_bytes_in", "throughput_in",
			"bandwidth_out", "network_bytes_out", "throughput_out",
			monitoring.MaxReasonableBandwidthBps, 1, 2,
		).
		WillReturnRows(sqlmock.NewRows([]string{"peak_inbound", "peak_outbound", "peak_combined", "sample_count"}).
			AddRow(15.0, 25.0, 40.0, 1))

	snapshot, err := monitoring.PeakNetworkMetrics24h(context.Background(), db, []int{1, 2})
	if err != nil {
		t.Fatalf("PeakNetworkMetrics24h() error = %v", err)
	}
	if !snapshot.HasData || snapshot.Inbound != 15 || snapshot.Outbound != 25 || snapshot.Combined != 40 {
		t.Fatalf("snapshot = %+v, want {Inbound:15 Outbound:25 Combined:40 HasData:true}", snapshot)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
