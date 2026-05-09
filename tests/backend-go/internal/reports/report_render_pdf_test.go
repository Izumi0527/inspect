package reports_test

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
	"gorm.io/datatypes"
)

func TestGenerateReportFile_ShouldRenderGenericPDFTemplate(t *testing.T) {
	generatedBy := "admin"
	generatedAt := time.Date(2026, 5, 7, 10, 30, 0, 0, time.UTC)
	report := reports.Report{
		ID:          9001,
		Title:       "趋势分析报告",
		ReportType:  "trend",
		StartDate:   time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC),
		EndDate:     time.Date(2026, 5, 7, 23, 59, 59, 0, time.UTC),
		GeneratedBy: &generatedBy,
		GeneratedAt: &generatedAt,
		DeviceFilters: datatypes.JSON([]byte(`{
			"report_data": {
				"report_name": "趋势分析报告",
				"range": "2026-05-01 ~ 2026-05-07",
				"generated_by": "admin",
				"generated_at": "2026-05-07 10:30:00",
				"summary": {
					"total": 10,
					"success": 8,
					"failed": 2,
					"avg_score": 92.5
				},
				"notes": "包含预测区间",
				"metrics": ["availability"],
				"include_predictions": true
			}
		}`)),
	}

	filePath, err := reports.GenerateReportFile(context.Background(), nil, t.TempDir(), report, "pdf")
	if err != nil {
		if strings.Contains(err.Error(), "未找到可用的PDF中文字体") {
			t.Skipf("当前环境缺少 PDF 中文字体，跳过渲染结果断言: %v", err)
		}
		t.Fatalf("GenerateReportFile() error = %v", err)
	}

	raw, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("ReadFile(%q) error = %v", filePath, err)
	}
	if filepath.Ext(filePath) != ".pdf" {
		t.Fatalf("GenerateReportFile() ext = %q, want .pdf", filepath.Ext(filePath))
	}
	if !bytes.HasPrefix(raw, []byte("%PDF-")) {
		prefixLen := len(raw)
		if prefixLen > 8 {
			prefixLen = 8
		}
		t.Fatalf("generated report is not a PDF, first bytes = %q", string(raw[:prefixLen]))
	}
	if !bytes.Contains(raw, []byte("/Type /Page")) {
		t.Fatalf("generated PDF missing page object")
	}
	if len(raw) < 4*1024 {
		t.Fatalf("generated PDF size = %d, want at least 4KB", len(raw))
	}
}

func TestGenerateReportFile_ShouldRenderStatisticsPDFLikeHTMLPreview(t *testing.T) {
	generatedAt := time.Date(2026, 5, 7, 10, 30, 0, 0, time.UTC)
	report := reports.Report{
		ID:          9002,
		Title:       "设备统计报表",
		ReportType:  "statistics",
		StartDate:   time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC),
		EndDate:     time.Date(2026, 5, 7, 23, 59, 59, 0, time.UTC),
		GeneratedAt: &generatedAt,
		DeviceFilters: datatypes.JSON([]byte(`{
			"statistics_data": {
				"title": "设备统计报表",
				"generated_at": "2026-05-07 10:30:00",
				"overview": {
					"total_devices": 12,
					"active_devices": 9,
					"offline_devices": 2,
					"warning_devices": 1,
					"error_devices": 0,
					"avg_uptime": 18.25,
					"total_executions": 33,
					"avg_score": 91.6
				},
				"device_distribution": {
					"by_type": {
						"switch": 5,
						"router": 3,
						"firewall": 2,
						"server": 2
					},
					"by_location": {
						"核心机房": 7,
						"分支机房": 5
					}
				},
				"performance_stats": {
					"by_device": [
						{
							"device_name": "core-sw-01",
							"metrics": {
								"cpu_usage": 41.2,
								"memory_usage": 63.4,
								"availability": 99.9,
								"health_score": 92.3
							}
						}
					]
				},
				"top_devices": {
					"by_performance": [
						{"device_name": "core-sw-01", "device_type": "switch", "score": 92.3}
					]
				}
			}
		}`)),
	}

	filePath, err := reports.GenerateReportFile(context.Background(), nil, t.TempDir(), report, "pdf")
	if err != nil {
		if strings.Contains(err.Error(), "未找到可用的PDF中文字体") {
			t.Skipf("当前环境缺少 PDF 中文字体，跳过渲染结果断言: %v", err)
		}
		t.Fatalf("GenerateReportFile() error = %v", err)
	}

	raw, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("ReadFile(%q) error = %v", filePath, err)
	}
	if filepath.Ext(filePath) != ".pdf" {
		t.Fatalf("GenerateReportFile() ext = %q, want .pdf", filepath.Ext(filePath))
	}
	if !bytes.HasPrefix(raw, []byte("%PDF-")) {
		prefixLen := len(raw)
		if prefixLen > 8 {
			prefixLen = 8
		}
		t.Fatalf("generated report is not a PDF, first bytes = %q", string(raw[:prefixLen]))
	}
	if bytes.Count(raw, []byte("/Type /Page")) < 2 {
		t.Fatalf("generated statistics PDF should include multiple report pages")
	}
	if len(raw) < 6*1024 {
		t.Fatalf("generated statistics PDF size = %d, want at least 6KB", len(raw))
	}
}
