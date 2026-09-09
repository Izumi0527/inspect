package monitoring_test

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

// 报表 charts 分区应与页面一致：性能历史按设备逐行输出 CPU/内存，不再有跨设备均值与 network 列
// （网络流量有独立分区）。用 CSV 断言，因其可直接读文本；PDF/Excel 复用同一份数据投影。
func TestExportMonitoringReportCSV_ChartsSection_ListsPerformancePerDevice(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	bucket := time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC)

	// 24h → 5 分钟桶：按设备性能查询 + 设备名查询
	mock.ExpectQuery(`(?is)SELECT time_bucket\('5 minutes', collected_at\) AS bucket, device_id, metric_name, AVG\(metric_value\) AS value FROM device_metrics WHERE metric_name IN \(\$1,\$2\) AND collected_at >= \$3 AND collected_at <= \$4 GROUP BY bucket, device_id, metric_name ORDER BY bucket ASC`).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "device_id", "metric_name", "value"}).
			AddRow(bucket, 1, "cpu_usage", 10.0).
			AddRow(bucket, 1, "memory_usage", 40.0).
			AddRow(bucket, 2, "cpu_usage", 20.0).
			AddRow(bucket, 2, "memory_usage", 50.0))
	mock.ExpectQuery(deviceLabelQueryPattern + `\$1,\$2\)`).
		WithArgs(1, 2).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address", "name_count"}).
			AddRow(1, "SW-01", "10.0.0.1", 1).
			AddRow(2, "SW-02", "10.0.0.2", 1))
	// 网络流量查询（保持原逻辑，返回空）
	mock.ExpectQuery(`(?is)WITH combined_metrics AS.*`).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "inbound", "outbound"}))

	result, err := writer.ExportMonitoringReport(context.Background(), monitoring.MonitoringReportExportRequest{
		Format:    "csv",
		TimeRange: "24h",
		Sections:  []string{"charts"},
	}, t.TempDir())
	if err != nil {
		t.Fatalf("ExportMonitoringReport() error = %v", err)
	}

	raw, err := os.ReadFile(result.FilePath)
	if err != nil {
		t.Fatalf("ReadFile(%q) error = %v", result.FilePath, err)
	}
	content := string(raw)
	for _, want := range []string{
		"timestamp,device_name,cpu_usage,memory_usage",
		"2026-09-06T12:00:00Z,SW-01,10.00,40.00",
		"2026-09-06T12:00:00Z,SW-02,20.00,50.00",
	} {
		if !strings.Contains(content, want) {
			t.Fatalf("CSV 缺少 %q，内容：\n%s", want, content)
		}
	}
	if strings.Contains(content, "network_traffic") {
		t.Fatalf("性能历史不应再含 network_traffic 列（网络流量有独立分区），内容：\n%s", content)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
