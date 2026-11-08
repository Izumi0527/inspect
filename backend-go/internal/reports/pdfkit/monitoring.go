package pdfkit

import (
	"fmt"
	"strings"
	"time"

	"github.com/phpdave11/gofpdf"
)

// MonitoringPDFInput is the data carrier the monitoring package hands off
// to pdfkit when producing a monitoring report PDF. It mirrors the fields
// the monitoring service already exposes (Stats / DevicePerformance /
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
	// SampleInterval 趋势图的采样粒度（如 "15 分钟"），并入两张趋势图标题；为空时不显示
	SampleInterval string

	Stats *MonitoringStatsInput
	// PerformanceLabels 性能趋势 X 轴时间戳（RFC3339），与每台设备的 CPU/Memory 等长
	PerformanceLabels []string
	// DevicePerformance 按设备的 CPU/内存序列；缺测点已由调用方补 0
	DevicePerformance []DevicePerformanceSeries
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

// DevicePerformanceSeries 一台设备的 CPU/内存时序（百分比）。
type DevicePerformanceSeries struct {
	Name   string
	CPU    []float64
	Memory []float64
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
	// 15mm 与报告侧 pdfBottomMM 统一（原先 16mm 会让两类 PDF 的底线差 1mm）。
	pdf.SetAutoPageBreak(true, 15)
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
		renderMonitoringCharts(pdf, input.PerformanceLabels, input.DevicePerformance, input.NetworkTraffic, input.SampleInterval)
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
		{Label: "上行流量峰值", Value: formatBandwidthBps(stats.PeakOutbound), Color: ColorTrafficUp},
		{Label: "下行流量峰值", Value: formatBandwidthBps(stats.PeakInbound), Color: ColorTrafficDown},
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

// 与页面一致：最多绘制 5 台设备（颜色 = 设备、线型 = 指标），更多设备只在标题提示
const maxPDFPerformanceDevices = 5

// chartTitleWithInterval 把采样粒度并入趋势图标题。粒度不放页眉 chip：页眉宽度已被
// 生成时间/时间范围/活跃告警占满，chip 循环超宽即 break，会连带挤掉后面的 chip。
func chartTitleWithInterval(title string, sampleInterval string) string {
	if interval := strings.TrimSpace(sampleInterval); interval != "" {
		return fmt.Sprintf("%s · 采样粒度 %s", title, interval)
	}
	return title
}

// trafficLineSpec 构造流量趋势图。输入恒为 Mbps；按两条序列的峰值选择显示单位并换算数值，
// 固定按 Mbps 画时，Kbps 级流量的纵轴刻度（两位小数）全是 0.00。
func trafficLineSpec(traffic []NetworkTrafficPoint, sampleInterval string) LineSpec {
	peak := 0.0
	for _, p := range traffic {
		if p.Inbound > peak {
			peak = p.Inbound
		}
		if p.Outbound > peak {
			peak = p.Outbound
		}
	}
	unit, factor := trafficDisplayUnit(peak)

	labels := make([]string, len(traffic))
	inValues := make([]float64, len(traffic))
	outValues := make([]float64, len(traffic))
	for i, p := range traffic {
		labels[i] = shortenTimestamp(p.Timestamp)
		inValues[i] = p.Inbound * factor
		outValues[i] = p.Outbound * factor
	}
	return LineSpec{
		Title:   chartTitleWithInterval(fmt.Sprintf("流量 (%s)", unit), sampleInterval),
		XLabels: labels,
		Series: []LineSeries{
			{Name: "下行", Color: ColorTrafficDown, Values: inValues},
			{Name: "上行", Color: ColorTrafficUp, Values: outValues},
		},
	}
}

// trafficDisplayUnit 返回峰值（Mbps）对应的显示单位与换算系数，分档与 formatBandwidthBps 一致；
// 全为 0 时沿用 Mbps。
func trafficDisplayUnit(peakMbps float64) (string, float64) {
	switch {
	case peakMbps <= 0:
		return "Mbps", 1
	case peakMbps < 0.001:
		return "bps", 1_000_000
	case peakMbps < 1:
		return "Kbps", 1_000
	case peakMbps < 1_000:
		return "Mbps", 1
	default:
		return "Gbps", 0.001
	}
}

func renderMonitoringCharts(pdf *gofpdf.Fpdf, perfLabels []string, devices []DevicePerformanceSeries, traffic []NetworkTrafficPoint, sampleInterval string) {
	left, _, _, _ := pdf.GetMargins()
	usable := UsableWidth(pdf)
	perfChartH := usable * 0.45
	trafficChartH := usable * 0.4

	hasPerf := len(devices) > 0 && len(perfLabels) > 0
	if hasPerf {
		ensureSpace(pdf, sectionTitleHeight+perfChartH)
	}
	SectionTitle(pdf, "性能趋势")
	if !hasPerf {
		EmptyStateWithHint(pdf, "暂无系统性能数据", "请扩大时间范围或检查设备采集状态")
	} else {
		shown := devices
		if len(shown) > maxPDFPerformanceDevices {
			shown = shown[:maxPDFPerformanceDevices]
		}
		labels := make([]string, len(perfLabels))
		for i, ts := range perfLabels {
			labels[i] = shortenTimestamp(ts)
		}
		series := make([]LineSeries, 0, len(shown)*2)
		for i, dev := range shown {
			color := DeviceSeriesPalette[i%len(DeviceSeriesPalette)]
			series = append(series,
				LineSeries{Name: dev.Name + " CPU", Color: color, Values: dev.CPU},
				LineSeries{Name: dev.Name + " 内存", Color: color, Values: dev.Memory, DashArray: []float64{6, 4}},
			)
		}
		title := "CPU（实线）/ 内存（虚线），单位 %"
		if len(devices) > len(shown) {
			title = fmt.Sprintf("%s · 显示 %d/%d 台设备", title, len(shown), len(devices))
		}
		spec := LineSpec{Title: chartTitleWithInterval(title, sampleInterval), XLabels: labels, Series: series, NoFill: true}
		if png, err := RenderLineChart(spec); err == nil {
			y := pdf.GetY()
			_ = EmbedChart(pdf, png, left, y, usable, perfChartH)
			pdf.SetY(y + perfChartH + 4)
		}
	}

	pdf.Ln(SpaceSM)
	if len(traffic) > 0 {
		ensureSpace(pdf, sectionTitleHeight+trafficChartH)
	}
	SectionTitle(pdf, "网络流量")
	if len(traffic) == 0 {
		EmptyStateWithHint(pdf, "暂无网络流量数据", "采样间隔可能过短或链路当前空闲")
		return
	}
	spec := trafficLineSpec(traffic, sampleInterval)
	if png, err := RenderLineChart(spec); err == nil {
		y := pdf.GetY()
		_ = EmbedChart(pdf, png, left, y, usable, trafficChartH)
		pdf.SetY(y + trafficChartH + 4)
	}
}

// ensureSpace 在剩余高度不足 needMM 时先换页。图表以绝对坐标嵌入，不会触发 gofpdf 的自动分页，
// 放不下时图片会越过底边距压住页脚；调用方在节标题之前按「标题 + 图表」检查，标题随图表一起换页。
func ensureSpace(pdf *gofpdf.Fpdf, needMM float64) {
	_, pageH := pdf.GetPageSize()
	_, bottom := pdf.GetAutoPageBreak()
	if pdf.GetY()+needMM > pageH-bottom {
		pdf.AddPage()
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
