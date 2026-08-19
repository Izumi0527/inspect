package pdfkit

import (
	"fmt"
	"strings"
	"time"

	"github.com/phpdave11/gofpdf"
)

// MonitoringPDFInput is the data carrier the monitoring package hands off
// to pdfkit when producing a monitoring report PDF. It mirrors the fields
// the monitoring service already exposes (Stats / SystemPerformance /
// NetworkTraffic / Alerts) but expressed in primitive types so pdfkit has
// no compile-time dependency on the monitoring package.
type MonitoringPDFInput struct {
	Title       string // optional override; defaults to "监控报告"
	Subtitle    string // optional, e.g. "系统运行状态总览"
	GeneratedAt time.Time
	TimeRange   string // human-readable, e.g. "24h" or "2026-05-01 ~ 2026-05-09"
	StartTime   time.Time
	EndTime     time.Time
	Sections    []string // which sections to render: stats / charts / alerts

	Stats             *MonitoringStatsInput
	SystemPerformance []TimeSeriesPoint
	NetworkTraffic    []NetworkTrafficPoint
	Alerts            []MonitoringAlertInput
}

// MonitoringStatsInput captures the high-level KPI block.
type MonitoringStatsInput struct {
	TotalDevices int
	ActiveAlerts int
	AvgCPU       float64
	AvgMemory    float64
	PeakOutbound float64 // 24小时上行(出站)峰值，bps
	PeakInbound  float64 // 24小时下行(入站)峰值，bps
}

// TimeSeriesPoint is one (timestamp, cpu/mem/net) sample for the system
// performance chart.
type TimeSeriesPoint struct {
	Timestamp      string // pre-formatted label for the X axis
	CPUUsage       float64
	MemoryUsage    float64
	NetworkTraffic float64
}

// NetworkTrafficPoint is one (timestamp, in, out) sample.
type NetworkTrafficPoint struct {
	Timestamp string
	Inbound   float64
	Outbound  float64
}

// MonitoringAlertInput is a flattened alert row for the table.
type MonitoringAlertInput struct {
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

// RenderMonitoringPDF writes a styled monitoring report PDF to path. It
// uses the same design tokens, fonts, hero, cards, charts and soft tables
// that drive the reports module — so users see one consistent visual
// system whether they download a monitoring snapshot or a full report.
//
// All sections are best-effort: empty data degrades to an EmptyState block
// instead of erroring, matching the original monitoring exporter behavior.
func RenderMonitoringPDF(path string, input MonitoringPDFInput) error {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(18, 18, 18)
	pdf.SetAutoPageBreak(true, 16)
	if err := RegisterFonts(pdf); err != nil {
		return err
	}
	pdf.SetFooterFunc(func() {
		PageFooter(pdf, "巡检系统 · 监控中心", pdf.PageNo())
	})
	pdf.AddPage()
	pdf.SetFont(FontFamilyCJK, "", FontBody)

	title := strings.TrimSpace(input.Title)
	if title == "" {
		title = "监控报告"
	}
	subtitle := strings.TrimSpace(input.Subtitle)
	if subtitle == "" {
		subtitle = "系统运行状态、性能与告警概览"
	}

	generatedAt := input.GeneratedAt
	if generatedAt.IsZero() {
		generatedAt = time.Now().UTC()
	}

	chips := []string{
		fmt.Sprintf("生成时间 %s", generatedAt.Format("2006-01-02 15:04:05")),
	}
	if rng := strings.TrimSpace(input.TimeRange); rng != "" {
		chips = append(chips, fmt.Sprintf("时间范围 %s", rng))
	}
	if input.Stats != nil {
		chips = append(chips, fmt.Sprintf("活跃告警 %d", input.Stats.ActiveAlerts))
	}

	WriteHeroBanner(pdf, HeroBanner{
		Title:    title,
		Subtitle: subtitle,
		Brand:    "巡检系统",
		Tagline:  "监控中心",
		Chips:    chips,
	})
	pdf.Ln(SpaceMD)

	sections := normalizeSections(input.Sections)

	if hasSection(sections, "stats") {
		renderMonitoringStats(pdf, input.Stats)
		pdf.Ln(SpaceMD)
	}

	if hasSection(sections, "charts") {
		renderMonitoringCharts(pdf, input.SystemPerformance, input.NetworkTraffic)
		pdf.Ln(SpaceMD)
	}

	if hasSection(sections, "alerts") {
		renderMonitoringAlerts(pdf, input.Alerts)
	}

	return pdf.OutputFileAndClose(path)
}

func renderMonitoringStats(pdf *gofpdf.Fpdf, stats *MonitoringStatsInput) {
	SectionTitle(pdf, "统计概览")
	if stats == nil {
		EmptyStateWithHint(pdf, "暂无统计数据", "采集器尚未上报或时间窗内无样本")
		return
	}
	// 6 列单行布局：A4 174mm 可用宽 / 6 张约 26mm 宽，正好放下 6 个 KPI；
	// 旧的 4+2 布局让第二行右侧 2 列空白，破坏视觉秩序。彩虹色相
	// (indigo/danger/amber/indigo-light/primary/emerald) 让每个指标
	// 类型一眼可辨。
	WriteStatCardRow(pdf, []StatCard{
		{Label: "设备总数", Value: fmt.Sprintf("%d", stats.TotalDevices), Color: ColorPrimary},
		{Label: "活跃告警", Value: fmt.Sprintf("%d", stats.ActiveAlerts), Color: ColorDanger},
		{Label: "平均CPU", Value: fmt.Sprintf("%.1f%%", stats.AvgCPU), Color: ColorAmber500},
		{Label: "平均内存", Value: fmt.Sprintf("%.1f%%", stats.AvgMemory), Color: ColorIndigo400},
		{Label: "上行流量峰值", Value: formatBandwidthBps(stats.PeakOutbound), Color: ColorSuccess},
		{Label: "下行流量峰值", Value: formatBandwidthBps(stats.PeakInbound), Color: ColorEmerald500},
	}, 6)
}

// formatBandwidthBps 将 bps 值格式化为人类可读带宽（与前端 formatBandwidth 分段一致）
func formatBandwidthBps(bps float64) string {
	switch {
	case bps < 0:
		return "0.0 bps"
	case bps < 1_000:
		return fmt.Sprintf("%.1f bps", bps)
	case bps < 1_000_000:
		return fmt.Sprintf("%.1f Kbps", bps/1_000)
	case bps < 1_000_000_000:
		return fmt.Sprintf("%.1f Mbps", bps/1_000_000)
	default:
		return fmt.Sprintf("%.1f Gbps", bps/1_000_000_000)
	}
}

func renderMonitoringCharts(pdf *gofpdf.Fpdf, perf []TimeSeriesPoint, traffic []NetworkTrafficPoint) {
	SectionTitle(pdf, "性能趋势")
	if len(perf) == 0 {
		EmptyStateWithHint(pdf, "暂无系统性能数据", "请扩大时间范围或检查 Agent 上报状态")
	} else {
		labels := make([]string, len(perf))
		cpuValues := make([]float64, len(perf))
		memValues := make([]float64, len(perf))
		netValues := make([]float64, len(perf))
		for i, p := range perf {
			labels[i] = shortenTimestamp(p.Timestamp)
			cpuValues[i] = p.CPUUsage
			memValues[i] = p.MemoryUsage
			netValues[i] = p.NetworkTraffic
		}
		spec := LineSpec{
			Title:   "CPU / 内存 / 网络",
			XLabels: labels,
			Series: []LineSeries{
				{Name: "CPU%", Color: ColorPrimary, Values: cpuValues},
				{Name: "Memory%", Color: ColorIndigo400, Values: memValues},
				{Name: "Network", Color: ColorEmerald500, Values: netValues},
			},
		}
		if png, err := RenderLineChart(spec); err == nil {
			pageW, _ := pdf.GetPageSize()
			left, _, right, _ := pdf.GetMargins()
			usable := pageW - left - right
			h := usable * 0.45
			y := pdf.GetY()
			_ = EmbedChart(pdf, png, left, y, usable, h)
			pdf.SetY(y + h + 4)
		}
	}

	pdf.Ln(SpaceSM)
	SectionTitle(pdf, "网络流量")
	if len(traffic) == 0 {
		EmptyStateWithHint(pdf, "暂无网络流量数据", "采样间隔可能过短或链路当前空闲")
		return
	}
	labels := make([]string, len(traffic))
	inValues := make([]float64, len(traffic))
	outValues := make([]float64, len(traffic))
	for i, p := range traffic {
		labels[i] = shortenTimestamp(p.Timestamp)
		inValues[i] = p.Inbound
		outValues[i] = p.Outbound
	}
	spec := LineSpec{
		Title:   "流量 (Mbps)",
		XLabels: labels,
		Series: []LineSeries{
			{Name: "Inbound", Color: ColorPrimary, Values: inValues},
			{Name: "Outbound", Color: ColorEmerald500, Values: outValues},
		},
	}
	if png, err := RenderLineChart(spec); err == nil {
		pageW, _ := pdf.GetPageSize()
		left, _, right, _ := pdf.GetMargins()
		usable := pageW - left - right
		h := usable * 0.4
		y := pdf.GetY()
		_ = EmbedChart(pdf, png, left, y, usable, h)
		pdf.SetY(y + h + 4)
	}
}

func renderMonitoringAlerts(pdf *gofpdf.Fpdf, alerts []MonitoringAlertInput) {
	SectionTitle(pdf, "告警记录")
	if len(alerts) == 0 {
		EmptyStateWithHint(pdf, "暂无告警记录", "当前时间窗内系统运行正常")
		return
	}

	rows := make([][]string, 0, len(alerts))
	max := 30
	for i, a := range alerts {
		if i >= max {
			rows = append(rows, []string{"…", "", "", "", fmt.Sprintf("已截断，仅展示前 %d 条", max)})
			break
		}
		when := a.CreatedAt
		if !a.LastOccurred.IsZero() {
			when = a.LastOccurred
		}
		rows = append(rows, []string{
			a.DeviceName,
			translateSeverity(a.Severity),
			translateStatus(a.Status),
			when.Local().Format("01-02 15:04"),
			truncate(a.Title, 28),
		})
	}

	WriteSoftTable(pdf, SoftTable{
		Headers: []string{"设备", "严重度", "状态", "最近发生", "标题"},
		Rows:    rows,
		Widths:  []float64{38, 22, 22, 28, 64},
		Align:   "L",
	})
}

func normalizeSections(sections []string) []string {
	if len(sections) == 0 {
		return []string{"stats", "charts", "alerts"}
	}
	out := make([]string, 0, len(sections))
	for _, s := range sections {
		if v := strings.ToLower(strings.TrimSpace(s)); v != "" {
			out = append(out, v)
		}
	}
	if len(out) == 0 {
		return []string{"stats", "charts", "alerts"}
	}
	return out
}

func hasSection(sections []string, target string) bool {
	for _, s := range sections {
		if s == target {
			return true
		}
	}
	return false
}

func translateSeverity(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "critical":
		return "严重"
	case "high":
		return "高"
	case "medium":
		return "中"
	case "low":
		return "低"
	case "info":
		return "信息"
	default:
		return s
	}
}

func translateStatus(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "active", "open":
		return "活跃"
	case "acknowledged":
		return "已确认"
	case "resolved", "closed":
		return "已解决"
	default:
		return s
	}
}

func truncate(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max-1]) + "…"
}

// shortenTimestamp keeps only the trailing "MM-DD HH:MM" portion of an
// RFC3339-ish timestamp so X-axis labels don't overlap.
func shortenTimestamp(s string) string {
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.Local().Format("01-02 15:04")
	}
	if t, err := time.Parse("2006-01-02T15:04:05", s); err == nil {
		return t.Format("01-02 15:04")
	}
	return s
}
