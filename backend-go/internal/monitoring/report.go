package monitoring

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/reports/pdfkit"
)

var (
	ErrInvalidReportFormat    = errors.New("invalid report format")
	ErrInvalidReportTimeRange = errors.New("invalid time_range")
)

const (
	defaultReportTimeRange = "24h"
	maxReportRows          = 500
)

var reportTimeRangePattern = regexp.MustCompile(`^(\d+)([mhdw])$`)

type MonitoringReportExportRequest struct {
	Format    string   `json:"format"`
	TimeRange string   `json:"time_range"`
	Sections  []string `json:"sections"`
}

type MonitoringReportExportResult struct {
	Format      string
	TimeRange   string
	Sections    []string
	GeneratedAt time.Time
	FileName    string
	FilePath    string
}

type MonitoringReportData struct {
	GeneratedAt       time.Time
	TimeRange         string
	StartTime         time.Time
	EndTime           time.Time
	Sections          []string
	Stats             *MonitoringStats
	SystemPerformance []SystemPerformancePoint
	NetworkTraffic    []NetworkTrafficPoint
	Alerts            []MonitoringReportAlert
}

type MonitoringReportAlert struct {
	ID           int
	DeviceID     int
	DeviceName   string
	Title        string
	Severity     string
	Status       string
	Message      string
	CreatedAt    time.Time
	LastOccurred time.Time
}

func (w *MetricsWriter) ExportMonitoringReport(
	ctx context.Context,
	req MonitoringReportExportRequest,
	outputDir string,
) (MonitoringReportExportResult, error) {
	if w == nil || w.db == nil {
		return MonitoringReportExportResult{}, fmt.Errorf("database not initialized")
	}

	format := strings.ToLower(strings.TrimSpace(req.Format))
	if format == "" {
		format = "pdf"
	}
	extension, ok := reportFormatExtension(format)
	if !ok {
		return MonitoringReportExportResult{}, ErrInvalidReportFormat
	}

	timeRange := strings.TrimSpace(req.TimeRange)
	if timeRange == "" {
		timeRange = defaultReportTimeRange
	}
	start, end, err := parseReportTimeRange(timeRange, time.Now().UTC())
	if err != nil {
		return MonitoringReportExportResult{}, ErrInvalidReportTimeRange
	}

	sections := normalizeReportSections(req.Sections)
	if len(sections) == 0 {
		sections = []string{"stats", "charts", "alerts"}
	}

	data := MonitoringReportData{
		GeneratedAt: time.Now().UTC(),
		TimeRange:   timeRange,
		StartTime:   start,
		EndTime:     end,
		Sections:    sections,
	}

	if hasReportSection(sections, "stats") {
		stats, err := w.GetMonitoringStats(ctx, nil)
		if err != nil {
			return MonitoringReportExportResult{}, err
		}
		data.Stats = &stats
	}

	if hasReportSection(sections, "charts") {
		perf, err := w.GetSystemPerformanceHistory(ctx, start, end, nil, nil)
		if err != nil {
			return MonitoringReportExportResult{}, err
		}
		traffic, err := w.GetNetworkTrafficHistory(ctx, start, end, nil)
		if err != nil {
			return MonitoringReportExportResult{}, err
		}
		data.SystemPerformance = perf
		data.NetworkTraffic = traffic
	}

	if hasReportSection(sections, "alerts") {
		alerts, err := queryReportAlerts(ctx, w.db, start, end)
		if err != nil {
			return MonitoringReportExportResult{}, err
		}
		data.Alerts = alerts
	}

	content, err := renderMonitoringReport(data, format)
	if err != nil {
		return MonitoringReportExportResult{}, err
	}

	if strings.TrimSpace(outputDir) == "" {
		return MonitoringReportExportResult{}, fmt.Errorf("report output not configured")
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return MonitoringReportExportResult{}, err
	}

	fileName := fmt.Sprintf("monitoring-report-%s.%s", data.GeneratedAt.Format("20060102-150405"), extension)
	filePath := filepath.Join(outputDir, fileName)
	if err := os.WriteFile(filePath, content, 0o644); err != nil {
		return MonitoringReportExportResult{}, err
	}

	return MonitoringReportExportResult{
		Format:      format,
		TimeRange:   timeRange,
		Sections:    sections,
		GeneratedAt: data.GeneratedAt,
		FileName:    fileName,
		FilePath:    filePath,
	}, nil
}

func renderMonitoringReport(data MonitoringReportData, format string) ([]byte, error) {
	switch format {
	case "csv":
		return renderMonitoringReportCSV(data)
	case "excel":
		return renderMonitoringReportExcel(data)
	case "pdf":
		return renderMonitoringReportPDF(data)
	default:
		return nil, ErrInvalidReportFormat
	}
}

func renderMonitoringReportCSV(data MonitoringReportData) ([]byte, error) {
	buf := &bytes.Buffer{}
	writer := csv.NewWriter(buf)

	writeRow := func(values ...string) {
		_ = writer.Write(values)
	}

	writeRow("监控报告")
	writeRow("生成时间", data.GeneratedAt.Format(time.RFC3339))
	writeRow("时间范围", data.StartTime.Format(time.RFC3339), data.EndTime.Format(time.RFC3339))
	writeRow()

	if hasReportSection(data.Sections, "stats") {
		writeRow("统计指标")
		if data.Stats == nil {
			writeRow("暂无统计数据")
		} else {
			writeRow("设备总数", strconv.Itoa(data.Stats.TotalDevices))
			writeRow("可用性(%)", formatFloat(data.Stats.Availability, 2))
			writeRow("活跃告警", strconv.Itoa(data.Stats.ActiveAlerts))
			writeRow("平均CPU(%)", formatFloat(data.Stats.AvgCPU, 1))
			writeRow("平均内存(%)", formatFloat(data.Stats.AvgMemory, 1))
			writeRow("平均网络", formatFloat(data.Stats.AvgNetwork, 1))
		}
		writeRow()
	}

	if hasReportSection(data.Sections, "charts") {
		writeRow("系统性能历史")
		if len(data.SystemPerformance) == 0 {
			writeRow("暂无系统性能数据")
		} else {
			writeRow("timestamp", "cpu_usage", "memory_usage", "network_traffic")
			perf := data.SystemPerformance
			if len(perf) > maxReportRows {
				perf = perf[:maxReportRows]
			}
			for _, point := range perf {
				writeRow(
					point.Timestamp,
					formatFloat(point.CPUUsage, 2),
					formatFloat(point.MemoryUsage, 2),
					formatFloat(point.NetworkTraffic, 2),
				)
			}
			if len(data.SystemPerformance) > maxReportRows {
				writeRow("已截断", fmt.Sprintf("仅保留前%d条", maxReportRows))
			}
		}
		writeRow()

		writeRow("网络流量历史")
		if len(data.NetworkTraffic) == 0 {
			writeRow("暂无网络流量数据")
		} else {
			writeRow("timestamp", "inbound", "outbound")
			traffic := data.NetworkTraffic
			if len(traffic) > maxReportRows {
				traffic = traffic[:maxReportRows]
			}
			for _, point := range traffic {
				writeRow(
					point.Timestamp,
					formatFloat(point.Inbound, 2),
					formatFloat(point.Outbound, 2),
				)
			}
			if len(data.NetworkTraffic) > maxReportRows {
				writeRow("已截断", fmt.Sprintf("仅保留前%d条", maxReportRows))
			}
		}
		writeRow()
	}

	if hasReportSection(data.Sections, "alerts") {
		writeRow("告警记录")
		if len(data.Alerts) == 0 {
			writeRow("暂无告警记录")
		} else {
			writeRow("id", "device_id", "device_name", "title", "severity", "status", "message", "created_at", "last_occurred")
			alerts := data.Alerts
			if len(alerts) > maxReportRows {
				alerts = alerts[:maxReportRows]
			}
			for _, alert := range alerts {
				writeRow(
					strconv.Itoa(alert.ID),
					strconv.Itoa(alert.DeviceID),
					alert.DeviceName,
					alert.Title,
					alert.Severity,
					alert.Status,
					alert.Message,
					alert.CreatedAt.Format(time.RFC3339),
					alert.LastOccurred.Format(time.RFC3339),
				)
			}
			if len(data.Alerts) > maxReportRows {
				writeRow("已截断", fmt.Sprintf("仅保留前%d条", maxReportRows))
			}
		}
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func renderMonitoringReportExcel(data MonitoringReportData) ([]byte, error) {
	file := excelize.NewFile()
	sheetName := file.GetSheetName(0)
	if sheetName == "" {
		sheetName = "Sheet1"
	}
	if sheetName != "监控报告" {
		if err := file.SetSheetName(sheetName, "监控报告"); err != nil {
			return nil, err
		}
	}
	sheetName = "监控报告"

	row := 1
	writeRow := func(values ...interface{}) error {
		if len(values) == 0 {
			row++
			return nil
		}
		for idx, value := range values {
			cell, _ := excelize.CoordinatesToCellName(idx+1, row)
			if err := file.SetCellValue(sheetName, cell, value); err != nil {
				return err
			}
		}
		row++
		return nil
	}

	if err := writeRow("监控报告"); err != nil {
		return nil, err
	}
	if err := writeRow("生成时间", data.GeneratedAt.Format(time.RFC3339)); err != nil {
		return nil, err
	}
	if err := writeRow("时间范围", data.StartTime.Format(time.RFC3339), data.EndTime.Format(time.RFC3339)); err != nil {
		return nil, err
	}
	if err := writeRow(); err != nil {
		return nil, err
	}

	if hasReportSection(data.Sections, "stats") {
		if err := writeRow("统计指标"); err != nil {
			return nil, err
		}
		if data.Stats == nil {
			if err := writeRow("暂无统计数据"); err != nil {
				return nil, err
			}
		} else {
			if err := writeRow("设备总数", strconv.Itoa(data.Stats.TotalDevices)); err != nil {
				return nil, err
			}
			if err := writeRow("可用性(%)", formatFloat(data.Stats.Availability, 2)); err != nil {
				return nil, err
			}
			if err := writeRow("活跃告警", strconv.Itoa(data.Stats.ActiveAlerts)); err != nil {
				return nil, err
			}
			if err := writeRow("平均CPU(%)", formatFloat(data.Stats.AvgCPU, 1)); err != nil {
				return nil, err
			}
			if err := writeRow("平均内存(%)", formatFloat(data.Stats.AvgMemory, 1)); err != nil {
				return nil, err
			}
			if err := writeRow("平均网络", formatFloat(data.Stats.AvgNetwork, 1)); err != nil {
				return nil, err
			}
		}
		if err := writeRow(); err != nil {
			return nil, err
		}
	}

	if hasReportSection(data.Sections, "charts") {
		if err := writeRow("系统性能历史"); err != nil {
			return nil, err
		}
		if len(data.SystemPerformance) == 0 {
			if err := writeRow("暂无系统性能数据"); err != nil {
				return nil, err
			}
		} else {
			if err := writeRow("timestamp", "cpu_usage", "memory_usage", "network_traffic"); err != nil {
				return nil, err
			}
			perf := data.SystemPerformance
			if len(perf) > maxReportRows {
				perf = perf[:maxReportRows]
			}
			for _, point := range perf {
				if err := writeRow(
					point.Timestamp,
					formatFloat(point.CPUUsage, 2),
					formatFloat(point.MemoryUsage, 2),
					formatFloat(point.NetworkTraffic, 2),
				); err != nil {
					return nil, err
				}
			}
			if len(data.SystemPerformance) > maxReportRows {
				if err := writeRow("已截断", fmt.Sprintf("仅保留前%d条", maxReportRows)); err != nil {
					return nil, err
				}
			}
		}
		if err := writeRow(); err != nil {
			return nil, err
		}

		if err := writeRow("网络流量历史"); err != nil {
			return nil, err
		}
		if len(data.NetworkTraffic) == 0 {
			if err := writeRow("暂无网络流量数据"); err != nil {
				return nil, err
			}
		} else {
			if err := writeRow("timestamp", "inbound", "outbound"); err != nil {
				return nil, err
			}
			traffic := data.NetworkTraffic
			if len(traffic) > maxReportRows {
				traffic = traffic[:maxReportRows]
			}
			for _, point := range traffic {
				if err := writeRow(
					point.Timestamp,
					formatFloat(point.Inbound, 2),
					formatFloat(point.Outbound, 2),
				); err != nil {
					return nil, err
				}
			}
			if len(data.NetworkTraffic) > maxReportRows {
				if err := writeRow("已截断", fmt.Sprintf("仅保留前%d条", maxReportRows)); err != nil {
					return nil, err
				}
			}
		}
		if err := writeRow(); err != nil {
			return nil, err
		}
	}

	if hasReportSection(data.Sections, "alerts") {
		if err := writeRow("告警记录"); err != nil {
			return nil, err
		}
		if len(data.Alerts) == 0 {
			if err := writeRow("暂无告警记录"); err != nil {
				return nil, err
			}
		} else {
			if err := writeRow("id", "device_id", "device_name", "title", "severity", "status", "message", "created_at", "last_occurred"); err != nil {
				return nil, err
			}
			alerts := data.Alerts
			if len(alerts) > maxReportRows {
				alerts = alerts[:maxReportRows]
			}
			for _, alert := range alerts {
				if err := writeRow(
					strconv.Itoa(alert.ID),
					strconv.Itoa(alert.DeviceID),
					alert.DeviceName,
					alert.Title,
					alert.Severity,
					alert.Status,
					alert.Message,
					alert.CreatedAt.Format(time.RFC3339),
					alert.LastOccurred.Format(time.RFC3339),
				); err != nil {
					return nil, err
				}
			}
			if len(data.Alerts) > maxReportRows {
				if err := writeRow("已截断", fmt.Sprintf("仅保留前%d条", maxReportRows)); err != nil {
					return nil, err
				}
			}
		}
	}

	buf, err := file.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func renderMonitoringReportPDF(data MonitoringReportData) ([]byte, error) {
	// Render through the shared pdfkit pipeline so monitoring PDFs match
	// the report-center visual system (CJK fonts, hero, cards, line charts,
	// soft tables) instead of the legacy hand-rolled PDF byte stream that
	// could only render ASCII characters.
	tmp, err := os.CreateTemp("", "monitoring-report-*.pdf")
	if err != nil {
		return nil, err
	}
	tmpPath := tmp.Name()
	_ = tmp.Close()
	defer os.Remove(tmpPath)

	if err := pdfkit.RenderMonitoringPDF(tmpPath, buildMonitoringPDFInput(data)); err != nil {
		return nil, err
	}
	return os.ReadFile(tmpPath)
}

// buildMonitoringPDFInput projects MonitoringReportData onto pdfkit's
// primitive input type. Keeping the projection in this file (and not in
// pdfkit) means pdfkit doesn't have to depend on the monitoring package.
func buildMonitoringPDFInput(data MonitoringReportData) pdfkit.MonitoringPDFInput {
	input := pdfkit.MonitoringPDFInput{
		Title:       "监控报告",
		Subtitle:    "系统状态、性能与告警概览",
		GeneratedAt: data.GeneratedAt,
		TimeRange:   data.TimeRange,
		StartTime:   data.StartTime,
		EndTime:     data.EndTime,
		Sections:    data.Sections,
	}
	if data.Stats != nil {
		input.Stats = &pdfkit.MonitoringStatsInput{
			TotalDevices: data.Stats.TotalDevices,
			Availability: data.Stats.Availability,
			ActiveAlerts: data.Stats.ActiveAlerts,
			AvgCPU:       data.Stats.AvgCPU,
			AvgMemory:    data.Stats.AvgMemory,
			AvgNetwork:   data.Stats.AvgNetwork,
		}
	}
	for _, p := range data.SystemPerformance {
		input.SystemPerformance = append(input.SystemPerformance, pdfkit.TimeSeriesPoint{
			Timestamp:      p.Timestamp,
			CPUUsage:       p.CPUUsage,
			MemoryUsage:    p.MemoryUsage,
			NetworkTraffic: p.NetworkTraffic,
		})
	}
	for _, p := range data.NetworkTraffic {
		input.NetworkTraffic = append(input.NetworkTraffic, pdfkit.NetworkTrafficPoint{
			Timestamp: p.Timestamp,
			Inbound:   p.Inbound,
			Outbound:  p.Outbound,
		})
	}
	for _, a := range data.Alerts {
		input.Alerts = append(input.Alerts, pdfkit.MonitoringAlertInput{
			ID:           a.ID,
			DeviceID:     a.DeviceID,
			DeviceName:   a.DeviceName,
			Title:        a.Title,
			Severity:     a.Severity,
			Status:       a.Status,
			Message:      a.Message,
			CreatedAt:    a.CreatedAt,
			LastOccurred: a.LastOccurred,
		})
	}
	return input
}

func normalizeReportSections(sections []string) []string {
	if len(sections) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(sections))
	result := make([]string, 0, len(sections))
	for _, section := range sections {
		normalized := strings.ToLower(strings.TrimSpace(section))
		if normalized == "" {
			continue
		}
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		result = append(result, normalized)
	}
	return result
}

func hasReportSection(sections []string, target string) bool {
	target = strings.ToLower(strings.TrimSpace(target))
	for _, section := range sections {
		if strings.ToLower(strings.TrimSpace(section)) == target {
			return true
		}
	}
	return false
}

func reportFormatExtension(format string) (string, bool) {
	switch format {
	case "pdf":
		return "pdf", true
	case "csv":
		return "csv", true
	case "excel":
		return "xlsx", true
	default:
		return "", false
	}
}

func parseReportTimeRange(raw string, now time.Time) (time.Time, time.Time, error) {
	value := strings.ToLower(strings.TrimSpace(raw))
	if value == "" {
		value = defaultReportTimeRange
	}

	matches := reportTimeRangePattern.FindStringSubmatch(value)
	if len(matches) != 3 {
		return time.Time{}, time.Time{}, fmt.Errorf("invalid time_range")
	}

	amount, err := strconv.Atoi(matches[1])
	if err != nil || amount <= 0 {
		return time.Time{}, time.Time{}, fmt.Errorf("invalid time_range")
	}

	end := now.UTC()
	var start time.Time
	switch matches[2] {
	case "m":
		start = end.Add(-time.Duration(amount) * time.Minute)
	case "h":
		start = end.Add(-time.Duration(amount) * time.Hour)
	case "d":
		start = end.Add(-time.Duration(amount) * 24 * time.Hour)
	case "w":
		start = end.Add(-time.Duration(amount) * 7 * 24 * time.Hour)
	default:
		return time.Time{}, time.Time{}, fmt.Errorf("invalid time_range")
	}

	return start, end, nil
}

func queryReportAlerts(ctx context.Context, db *gorm.DB, start time.Time, end time.Time) ([]MonitoringReportAlert, error) {
	if db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	type alertRow struct {
		ID           int        `gorm:"column:id"`
		DeviceID     int        `gorm:"column:device_id"`
		DeviceName   *string    `gorm:"column:device_name"`
		Title        string     `gorm:"column:title"`
		Severity     string     `gorm:"column:severity"`
		Status       string     `gorm:"column:status"`
		Message      string     `gorm:"column:message"`
		CreatedAt    time.Time  `gorm:"column:created_at"`
		LastOccurred *time.Time `gorm:"column:last_occurred"`
	}

	rows := make([]alertRow, 0)
	query := `
        SELECT a.id,
               a.device_id,
               d.name AS device_name,
               a.title,
               a.severity,
               a.status,
               a.message,
               a.created_at,
               a.last_occurred
        FROM alerts a
        JOIN devices d ON d.id = a.device_id
        WHERE a.created_at >= ? AND a.created_at <= ?
        ORDER BY a.created_at DESC
        LIMIT ?`

	if err := db.WithContext(ctx).Raw(query, start, end, maxReportRows).Scan(&rows).Error; err != nil {
		return nil, err
	}

	alerts := make([]MonitoringReportAlert, 0, len(rows))
	for _, row := range rows {
		deviceName := ""
		if row.DeviceName != nil {
			deviceName = *row.DeviceName
		}
		if deviceName == "" && row.DeviceID > 0 {
			deviceName = fmt.Sprintf("device_%d", row.DeviceID)
		}
		lastOccurred := row.CreatedAt
		if row.LastOccurred != nil && !row.LastOccurred.IsZero() {
			lastOccurred = row.LastOccurred.UTC()
		}
		alerts = append(alerts, MonitoringReportAlert{
			ID:           row.ID,
			DeviceID:     row.DeviceID,
			DeviceName:   deviceName,
			Title:        row.Title,
			Severity:     row.Severity,
			Status:       row.Status,
			Message:      row.Message,
			CreatedAt:    row.CreatedAt.UTC(),
			LastOccurred: lastOccurred,
		})
	}
	return alerts, nil
}

func formatFloat(value float64, precision int) string {
	return strconv.FormatFloat(value, 'f', precision, 64)
}
