package reports

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

const reportBaselineTime = "2026-01-01 00:00:00"

func TestGenerateReportBaseline(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	dataDir := filepath.Join(root, "docs", "report-baseline", "data")
	outputDir := filepath.Join(root, "docs", "report-baseline", "output-go")

	if err := os.RemoveAll(outputDir); err != nil {
		t.Fatalf("清理输出目录失败: %v", err)
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		t.Fatalf("创建输出目录失败: %v", err)
	}

	if err := generateInspectionBaseline(dataDir, filepath.Join(outputDir, "inspection")); err != nil {
		t.Fatalf("生成巡检报表失败: %v", err)
	}
	if err := generateStatisticsBaseline(dataDir, filepath.Join(outputDir, "statistics")); err != nil {
		t.Fatalf("生成统计报表失败: %v", err)
	}
	if err := generateExporterBaseline(dataDir, filepath.Join(outputDir, "exporter")); err != nil {
		t.Fatalf("生成通用导出报表失败: %v", err)
	}
}

func generateInspectionBaseline(dataDir string, outputDir string) error {
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	payload, err := loadReportJSON(filepath.Join(dataDir, "inspection.json"))
	if err != nil {
		return err
	}
	payload["generated_at"] = reportBaselineTime
	params := map[string]interface{}{"inspection_data": payload}
	data, err := buildInspectionReportData(context.Background(), nil, Report{}, params)
	if err != nil {
		return err
	}

	formats := map[string]string{
		"pdf":   "pdf",
		"excel": "xlsx",
		"html":  "html",
		"word":  "docx",
	}
	for format, ext := range formats {
		path := filepath.Join(outputDir, "inspection_report."+ext)
		if _, err := writeInspectionReport(path, format, data); err != nil {
			return err
		}
	}
	return nil
}

func generateStatisticsBaseline(dataDir string, outputDir string) error {
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	payload, err := loadReportJSON(filepath.Join(dataDir, "statistics.json"))
	if err != nil {
		return err
	}
	payload["generated_at"] = reportBaselineTime
	params := map[string]interface{}{"statistics_data": payload}
	report := Report{Title: "统计报表基线"}
	data, err := buildStatisticsReportData(context.Background(), nil, report, params)
	if err != nil {
		return err
	}

	formats := map[string]string{
		"pdf":   "pdf",
		"excel": "xlsx",
		"html":  "html",
		"word":  "docx",
	}
	for format, ext := range formats {
		path := filepath.Join(outputDir, "statistics_report."+ext)
		if _, err := writeStatisticsReport(path, format, data); err != nil {
			return err
		}
	}
	return nil
}

func generateExporterBaseline(dataDir string, outputDir string) error {
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}

	deviceSummaryPayload, err := loadReportJSON(filepath.Join(dataDir, "exporter_device_summary.json"))
	if err != nil {
		return err
	}
	deviceSummaryPayload["generated_at"] = reportBaselineTime
	deviceSummaryParams := map[string]interface{}{"device_summary": deviceSummaryPayload}
	deviceSummaryData, err := buildDeviceSummaryData(context.Background(), nil, Report{}, deviceSummaryParams)
	if err != nil {
		return err
	}
	for _, format := range []string{"pdf", "word"} {
		ext := reportFileExtension(format)
		path := filepath.Join(outputDir, "device_summary."+ext)
		if _, err := writeDeviceSummaryReport(path, format, deviceSummaryData); err != nil {
			return err
		}
	}

	genericPayload, err := loadReportJSON(filepath.Join(dataDir, "exporter_generic.json"))
	if err != nil {
		return err
	}
	genericPayload["generated_at"] = reportBaselineTime
	genericParams := map[string]interface{}{"generic_data": genericPayload}
	for _, reportType := range []string{"inspection_report", "alert_report", "performance_report"} {
		report := Report{ReportType: reportType}
		data := buildGenericReportData(report, genericParams)
		for _, format := range []string{"pdf", "word"} {
			ext := reportFileExtension(format)
			path := filepath.Join(outputDir, reportType+"."+ext)
			if _, err := writeGenericReport(path, format, data); err != nil {
				return err
			}
		}
	}
	return nil
}

func loadReportJSON(path string) (map[string]interface{}, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, err
	}
	return payload, nil
}
