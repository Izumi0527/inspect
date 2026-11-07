package monitoring_test

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"
	_ "unsafe"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
	"github.com/your-org/inspect-system/backend-go/internal/reports/pdfkit"
)

// 报表 charts 分区应与页面一致：性能历史按设备逐行输出 CPU/内存，不再有跨设备均值与 network 列
// （网络流量有独立分区）。用 CSV 断言，因其可直接读文本；PDF/Excel 复用同一份数据投影。
func TestExportMonitoringReportCSV_ChartsSection_ListsPerformancePerDevice(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	bucket := time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC)

	// 24h → 6 分钟桶（点数预算 360 内对齐 3 分钟采集的最小桶）：按设备性能查询 + 设备名查询
	mock.ExpectQuery(`(?is)SELECT time_bucket\('6 minutes', collected_at\) AS bucket, device_id, metric_name, AVG\(metric_value\) AS value FROM device_metrics WHERE metric_name IN \(\$1,\$2\) AND collected_at >= \$3 AND collected_at <= \$4 GROUP BY bucket, device_id, metric_name ORDER BY bucket ASC`).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "device_id", "metric_name", "value"}).
			AddRow(bucket, 1, "cpu_usage", 10.0).
			AddRow(bucket, 1, "memory_usage", 40.0).
			AddRow(bucket, 2, "cpu_usage", 20.0).
			AddRow(bucket, 2, "memory_usage", 50.0))
	mock.ExpectQuery(deviceLabelQueryPattern+`\$1,\$2\)`).
		WithArgs(1, 2).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address", "name_count"}).
			AddRow(1, "SW-01", "10.0.0.1", 1).
			AddRow(2, "SW-02", "10.0.0.2", 1))
	// 网络流量查询：只读 device_metrics，桶内按设备 AVG 再跨设备 SUM（返回空）
	mock.ExpectQuery(`(?is)SELECT bucket, SUM\(inbound\) AS inbound, SUM\(outbound\) AS outbound FROM \(SELECT time_bucket\('6 minutes', collected_at\) AS bucket, device_id, AVG\(.*FROM device_metrics WHERE .*GROUP BY bucket, device_id\) AS per_device GROUP BY bucket ORDER BY bucket ASC`).
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

// 报告必须写明实际采样粒度（与页面的 3 分钟可能不同），粒度取自查询真正使用的桶宽。
func TestExportMonitoringReportCSV_StatesSampleInterval(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	mock.ExpectQuery(`(?is)SELECT time_bucket\('15 minutes', collected_at\).*GROUP BY bucket, device_id, metric_name`).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "device_id", "metric_name", "value"}))
	mock.ExpectQuery(`(?is)FROM \(SELECT time_bucket\('15 minutes', collected_at\)`).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "inbound", "outbound"}))

	content := exportReportCSV(t, writer, "3d")
	if !strings.Contains(content, "采样粒度,15 分钟") {
		t.Fatalf("CSV 缺少「采样粒度,15 分钟」，内容：\n%s", content)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// 超过行数上限时保留最新的行：数据按时间升序，截取开头会把最近的数据丢掉。
func TestExportMonitoringReportCSV_TruncationKeepsNewestRows(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	mock.ExpectQuery(`(?is)GROUP BY bucket, device_id, metric_name`).
		WillReturnRows(sqlmock.NewRows([]string{"bucket", "device_id", "metric_name", "value"}))
	base := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	rows := sqlmock.NewRows([]string{"bucket", "inbound", "outbound"})
	const total = 501
	for i := 0; i < total; i++ {
		rows.AddRow(base.Add(time.Duration(i)*6*time.Minute), float64(i), 0.0)
	}
	mock.ExpectQuery(`(?is)AS per_device GROUP BY bucket`).WillReturnRows(rows)

	content := exportReportCSV(t, writer, "24h")
	oldest := base.Format(time.RFC3339Nano)
	newest := base.Add(time.Duration(total-1) * 6 * time.Minute).Format(time.RFC3339Nano)
	if strings.Contains(content, oldest+",") {
		t.Fatalf("CSV 仍包含最旧一行 %s，应保留最新 500 行", oldest)
	}
	if !strings.Contains(content, newest+",") {
		t.Fatalf("CSV 缺少最新一行 %s", newest)
	}
	if !strings.Contains(content, "仅保留最新500条") {
		t.Fatalf("截断提示应说明保留的是最新数据，内容尾部：\n%s", content[len(content)-200:])
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

//go:linkname buildMonitoringPDFInput github.com/your-org/inspect-system/backend-go/internal/monitoring.buildMonitoringPDFInput
func buildMonitoringPDFInput(data monitoring.MonitoringReportData) pdfkit.MonitoringPDFInput

// PDF 的采样粒度与 CSV 同源（报告数据里的桶宽），交给 pdfkit 渲染为页眉标签。
func TestBuildMonitoringPDFInput_CarriesSampleInterval(t *testing.T) {
	input := buildMonitoringPDFInput(monitoring.MonitoringReportData{
		Sections:       []string{"charts"},
		SampleInterval: 30 * time.Minute,
	})
	if input.SampleInterval != "30 分钟" {
		t.Fatalf("SampleInterval = %q，want %q", input.SampleInterval, "30 分钟")
	}
}

func exportReportCSV(t *testing.T, writer *monitoring.MetricsWriter, timeRange string) string {
	t.Helper()
	result, err := writer.ExportMonitoringReport(context.Background(), monitoring.MonitoringReportExportRequest{
		Format:    "csv",
		TimeRange: timeRange,
		Sections:  []string{"charts"},
	}, t.TempDir())
	if err != nil {
		t.Fatalf("ExportMonitoringReport() error = %v", err)
	}
	raw, err := os.ReadFile(result.FilePath)
	if err != nil {
		t.Fatalf("ReadFile(%q) error = %v", result.FilePath, err)
	}
	return string(raw)
}
