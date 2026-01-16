package reports

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gorm.io/gorm"
)

func GenerateReportFile(ctx context.Context, db *gorm.DB, outputDir string, report Report, format string) (string, error) {
	if strings.TrimSpace(outputDir) == "" {
		return "", fmt.Errorf("report output not configured")
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return "", err
	}

	normalized := normalizeFormat(format)
	ext := reportFileExtension(normalized)
	filename := fmt.Sprintf("report-%d-%s.%s", report.ID, time.Now().UTC().Format("20060102-150405"), ext)
	fullPath := filepath.Join(outputDir, filename)

	params := decodeJSONMap(report.DeviceFilters)

	switch report.ReportType {
	case "inspection":
		data, err := buildInspectionReportData(ctx, db, report, params)
		if err != nil {
			return "", err
		}
		return writeInspectionReport(fullPath, normalized, data)
	case "statistics":
		data, err := buildStatisticsReportData(ctx, db, report, params)
		if err != nil {
			return "", err
		}
		return writeStatisticsReport(fullPath, normalized, data)
	case "availability":
		data, err := buildDeviceSummaryData(ctx, db, report, params)
		if err != nil {
			return "", err
		}
		return writeDeviceSummaryReport(fullPath, normalized, data)
	case "alert", "performance":
		data := buildGenericReportData(report, params)
		return writeGenericReport(fullPath, normalized, data)
	default:
		data := buildGenericReportData(report, params)
		return writeGenericReport(fullPath, normalized, data)
	}
}

func normalizeFormat(format string) string {
	value := strings.ToLower(strings.TrimSpace(format))
	switch value {
	case "pdf", "excel", "html", "word":
		return value
	case "xlsx":
		return "excel"
	case "docx":
		return "word"
	default:
		return "pdf"
	}
}

func reportFileExtension(format string) string {
	switch format {
	case "excel":
		return "xlsx"
	case "word":
		return "docx"
	case "html":
		return "html"
	case "pdf":
		return "pdf"
	default:
		return "pdf"
	}
}
