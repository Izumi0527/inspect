package reports_test

// 趋势报告的非 PDF 格式（excel / html / word）走结构化降级：数据仍是
// 人类可读的行式文本，不得回退成 JSON dump。本测试解压 OOXML（zip）
// 与读取 HTML 明文，直接对产物内容断言。

import (
	"archive/zip"
	"context"
	"io"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
	"gorm.io/datatypes"
)

func TestTrendReport_DegradedFormatsHaveNoRawJSON(t *testing.T) {
	for _, format := range []string{"html", "excel", "word"} {
		t.Run(format, func(t *testing.T) {
			generatedAt := time.Date(2026, 10, 18, 19, 0, 0, 0, time.UTC)
			report := reports.Report{
				ID:            9300,
				Title:         "趋势分析报告 - 2026-10-18",
				ReportType:    "trend",
				GeneratedAt:   &generatedAt,
				DeviceFilters: datatypes.JSON([]byte(trendSamplePayload)),
			}
			path, err := reports.GenerateReportFile(context.Background(), nil, t.TempDir(), report, format)
			if err != nil {
				if strings.Contains(err.Error(), "未找到可用的PDF中文字体") {
					t.Skipf("当前环境缺少字体，跳过: %v", err)
				}
				t.Fatalf("GenerateReportFile(%s): %v", format, err)
			}

			text := readReportText(t, path, format)
			if len(text) < 100 {
				t.Fatalf("产物内容过少（%d 字节文本）", len(text))
			}

			// JSON 语法特征一律不得出现：这些正是用户抱怨的机器格式。
			for _, bad := range []string{`"change"`, `"change_percentage"`, `"metric_name"`, `"predicted_value"`, `"trend_direction"`} {
				if strings.Contains(text, bad) {
					t.Errorf("产物含 JSON 字段 %s（降级失败，仍在 dump）", bad)
				}
			}
			// 降级后应保留人类可读的语义：指标行中的值/单位与本地化周期。
			if !strings.Contains(text, "72.08%") {
				t.Errorf("缺少指标当前值文本")
			}
			if !strings.Contains(text, "未来 1 周") {
				t.Errorf("预测周期未本地化（仍是英文枚举）")
			}
			if !strings.Contains(text, "严重") {
				t.Errorf("告警级别未本地化")
			}
		})
	}
}

// readReportText 取产物中可读文本：HTML 直接读文件；OOXML（xlsx/docx）
// 解压后取字符串/xml 部件。
func readReportText(t *testing.T, path string, format string) string {
	t.Helper()
	if format == "html" {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		return string(raw)
	}

	reader, err := zip.OpenReader(path)
	if err != nil {
		t.Fatalf("打开 %s 失败: %v", format, err)
	}
	defer reader.Close()

	parts := []string{"xl/sharedStrings.xml", "word/document.xml"}
	var builder strings.Builder
	for _, file := range reader.File {
		matched := false
		for _, part := range parts {
			if file.Name == part {
				matched = true
			}
		}
		if !matched {
			continue
		}
		f, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		raw, err := io.ReadAll(f)
		f.Close()
		if err != nil {
			t.Fatal(err)
		}
		builder.Write(raw)
	}
	return builder.String()
}
