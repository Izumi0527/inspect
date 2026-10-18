package reports_test

// 趋势报告 PDF 样本生成器：产物用于人工目检与 pdftotext/pdfplumber 自动审计。
// 运行：go test ./internal/reports/ -run TestTrendReportSample -v
// 产物：build/pdf-audit/sample-trend.pdf

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/reports"
	"gorm.io/datatypes"
)

// 样本数据覆盖五区块的全部形态：3 个指标（升/降/零单位）、2 条预测、
// 2 条告警（critical + warning）、含中文长句的备注与 alerts_meta。
const trendSamplePayload = `{
  "report_data": {
    "report_name": "趋势分析报告 - 2026-10-18",
    "range": "2026-10-11 ~ 2026-10-18",
    "generated_at": "2026-10-18T19:00:00Z",
        "notes": "该趋势报表为摘要版（不包含全部数据点），用于快速回溯趋势变化与预测结果。",
    "summary": {"metrics": 3, "devices": 12},
    "metrics": [
      {"name": "capacity", "metric_name": "capacity", "display_name": "容量使用", "unit": "%", "current": 72.08, "previous": 72.05, "change": 0.04, "change_percentage": 0.05, "trend_direction": "up"},
      {"name": "cpu_usage", "metric_name": "cpu_usage", "display_name": "CPU使用率", "unit": "%", "current": 41.5, "previous": 46.8, "change": -5.3, "change_percentage": -11.32, "trend_direction": "down"},
      {"name": "errors", "metric_name": "errors", "display_name": "错误数", "unit": "", "current": 0, "previous": 3, "change": -3, "change_percentage": -100, "trend_direction": "down"}
    ],
    "predictions": [
      {"metric": "capacity", "current_value": 72.08, "predicted_value": 72.13, "confidence": 0.9, "timeframe": "week", "recommendation": "容量使用稳定"},
      {"metric": "cpu_usage", "current_value": 41.5, "predicted_value": 38.2, "confidence": 0.72, "timeframe": "week", "recommendation": "CPU 使用率预计回落，无需干预"}
    ],
    "alerts": [
      {"id": "memory_usage-20261015030000", "type": "anomaly", "severity": "critical", "title": "内存使用率波动异常", "description": "检测到内存使用在 2026-10-15T03:00:00Z 出现异常值", "affected_metrics": ["memory_usage"], "detected_at": "2026-10-15T03:00:00Z", "status": "active"},
      {"id": "cpu_usage-20261012090000", "type": "anomaly", "severity": "warning", "title": "CPU使用率波动异常", "description": "检测到CPU使用率在 2026-10-12T09:00:00Z 出现异常值", "affected_metrics": ["cpu_usage"], "detected_at": "2026-10-12T09:00:00Z", "status": "active"}
    ],
    "alerts_meta": {"evaluated": true, "min_points_required": 6, "actual_points": 24}
  }
}`

func TestTrendReportSample(t *testing.T) {
	const tzQuery = `SELECT COALESCE(value, '') FROM system_settings WHERE key = 'system.timezone' LIMIT 1`
	const creatorQuery = `SELECT COALESCE(NULLIF(TRIM(full_name), ''), username) AS name FROM users WHERE id = $1 LIMIT 1`

	// 生产形态：报表记录持有生成人 UUID，report_data 里没有可读名；
	// 渲染时经数据库解析成用户名、生成时间按业务时区呈现。
	db, mock, cleanup := newReportsDBWithSqlmock(t)
	defer cleanup()
	mock.ExpectQuery(tzQuery).WillReturnRows(sqlmock.NewRows([]string{"value"}).AddRow("Asia/Shanghai"))
	mock.ExpectQuery(creatorQuery).WillReturnRows(sqlmock.NewRows([]string{"name"}).AddRow("张运维"))

	generatedBy := "dff7f0df-baca-464e-900b-87ed6e4c9a01"
	generatedAt := time.Date(2026, 10, 18, 19, 0, 0, 0, time.UTC)
	report := reports.Report{
		ID:            9200,
		Title:         "趋势分析报告 - 2026-10-18",
		ReportType:    "trend",
		GeneratedBy:   &generatedBy,
		GeneratedAt:   &generatedAt,
		DeviceFilters: datatypes.JSON([]byte(trendSamplePayload)),
	}

	outDir := `C:/Coder/Inspect/build/pdf-audit`
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		t.Fatal(err)
	}
	path, err := reports.GenerateReportFile(context.Background(), db, outDir, report, "pdf")
	if err != nil {
		if strings.Contains(err.Error(), "未找到可用的PDF中文字体") {
			t.Skipf("当前环境缺少 PDF 中文字体，跳过样本生成: %v", err)
		}
		t.Fatalf("GenerateReportFile: %v", err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(raw, []byte("%PDF-")) {
		t.Fatalf("产物不是 PDF: %q", raw[:min(16, len(raw))])
	}
	if !bytes.Contains(raw, []byte("/Outlines")) {
		t.Errorf("趋势报告应写入章节书签（/Outlines 缺失）")
	}

	dst := filepath.Join(outDir, "sample-trend.pdf")
	if err := os.WriteFile(dst, raw, 0o644); err != nil {
		t.Fatal(err)
	}
	t.Logf("trend sample: %s (%d bytes)", dst, len(raw))
}

// 空数据（无 metrics/predictions/alerts）也必须能渲染：三条空态分支
// 分别给出可解释的提示，而不是报错或空白页。
func TestTrendReportSample_EmptyData(t *testing.T) {
	report := reports.Report{
		ID:            9201,
		Title:         "趋势分析报告 - 空数据",
		ReportType:    "trend",
		DeviceFilters: datatypes.JSON([]byte(`{"report_data": {"report_name": "趋势分析报告 - 空数据", "range": "2026-10-11 ~ 2026-10-18", "metrics": [], "predictions": [], "alerts": [], "alerts_meta": {"evaluated": false, "min_points_required": 6, "actual_points": 2}}}`)),
	}
	path, err := reports.GenerateReportFile(context.Background(), nil, t.TempDir(), report, "pdf")
	if err != nil {
		if strings.Contains(err.Error(), "未找到可用的PDF中文字体") {
			t.Skipf("当前环境缺少 PDF 中文字体，跳过: %v", err)
		}
		t.Fatalf("GenerateReportFile: %v", err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(raw, []byte("%PDF-")) || len(raw) < 1024 {
		t.Fatalf("空数据趋势报告渲染异常: %d bytes", len(raw))
	}
}
