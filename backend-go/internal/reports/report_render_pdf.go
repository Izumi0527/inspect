package reports

import (
	"fmt"
	"strings"
	"time"

	"github.com/phpdave11/gofpdf"

	"github.com/your-org/inspect-system/backend-go/internal/reports/pdfkit"
)

// pdfFontName routes through pdfkit.FontFamilyCJK so all SetFont calls in
// this file pick up the Tailwind-aligned font registration done by
// pdfkit.RegisterFonts. The legacy "report" alias is also registered there
// for any caller that still passes the old string literal.
const (
	pdfFontName    = pdfkit.FontFamilyCJK
	pdfTitleSize   = 18
	pdfHeadingSize = 14
	pdfBodySize    = 11
	pdfSmallSize   = 10
	pdfMarginMM    = 18.0
	pdfBottomMM    = 15.0
	pdfTopOffsetMM = 1.6
	pdfTableLineMM = 0.14
)

func writeInspectionPDF(path string, data InspectionReportData) error {
	pdf, err := newReportPDF()
	if err != nil {
		return err
	}

	generatedAt := normalizeReportTime(strings.TrimSpace(data.GeneratedTimestamp), time.Time{})
	if generatedAt == "" {
		generatedAt = time.Now().Format("2006-01-02 15:04:05")
	}
	inspectionTime := strings.TrimSpace(data.InspectionTime)
	if inspectionTime == "" {
		inspectionTime = strings.TrimSpace(data.GeneratedTimestamp)
	}
	inspectionTime = normalizeReportTime(inspectionTime, time.Time{})
	pdfkit.WriteHeroBanner(pdf, pdfkit.HeroBanner{
		Title:    "网络设备巡检报告",
		Subtitle: data.InspectionName,
		Brand:    "INSPECT",
		Tagline:  "Report Center",
		Chips: []string{
			fmt.Sprintf("生成时间 %s", generatedAt),
			fmt.Sprintf("设备 %d 台", len(data.Devices)),
			fmt.Sprintf("通过率 %s", formatPercent(data.SummaryStats.PassRate, 1)),
		},
	})
	pdf.Ln(6)

	writePDFSectionTitle(pdf, "基本信息")
	// 4 张「基本信息」卡片改用 pdfkit.WriteStatCardRow（白底+顶色条）
	// 与「统计摘要」风格统一；颜色按业务语义彩虹化：标识/时间/数量/性能时长
	// → indigo/emerald/amber/rose，避免旧版「执行时长」突兀灰色。
	pdfkit.WriteStatCardRow(pdf, []pdfkit.StatCard{
		{Label: "巡检ID", Value: fallbackPDFValue(data.InspectionID), Color: pdfkit.ColorPrimary},
		{Label: "巡检时间", Value: fallbackPDFValue(inspectionTime), Color: pdfkit.ColorEmerald500},
		{Label: "设备总数", Value: fmt.Sprintf("%d", len(data.Devices)), Color: pdfkit.ColorAmber500},
		{Label: "执行时长", Value: formatDurationSeconds(data.ExecutionDuration), Color: pdfkit.ColorRose500},
	}, 4)
	pdf.Ln(4)

	writePDFSectionTitle(pdf, "统计摘要")
	pdfkit.WriteStatCardRow(pdf, []pdfkit.StatCard{
		{Label: "总检查项", Value: fmt.Sprintf("%d", data.SummaryStats.TotalChecks), Color: pdfkit.ColorPrimary},
		{Label: "通过", Value: fmt.Sprintf("%d", data.SummaryStats.PassedChecks), Color: pdfkit.ColorSuccess},
		{Label: "警告", Value: fmt.Sprintf("%d", data.SummaryStats.WarningChecks), Color: pdfkit.ColorWarning},
		{Label: "失败", Value: fmt.Sprintf("%d", data.SummaryStats.FailedChecks), Color: pdfkit.ColorDanger},
	}, 4)
	pdf.Ln(2)
	pdfkit.ProgressBar(pdf, "通过率", data.SummaryStats.PassRate, pdfkit.PassRateColor(data.SummaryStats.PassRate))
	embedInspectionDonut(pdf, data.SummaryStats)

	addPDFPage(pdf)
	pdf.Ln(1)
	writePDFSectionTitle(pdf, "设备巡检详情")
	if len(data.Devices) == 0 {
		pdfkit.EmptyStateWithHint(pdf, "当前筛选条件下暂无设备巡检明细", "请调整筛选条件后重试")
		return pdf.OutputFileAndClose(path)
	}
	overviewRows := make([][]string, 0, len(data.Devices))
	for _, device := range data.Devices {
		overviewRows = append(overviewRows, []string{
			fallbackPDFValue(device.DeviceName),
			fallbackPDFValue(device.IPAddress),
			fallbackPDFValue(device.DeviceType),
			fallbackPDFValue(device.InspectionStatus),
			formatPercent(device.PassRate, 1),
			fmt.Sprintf("%d", device.IssueCount),
		})
	}
	overviewStyle := defaultPDFTableStyle(pdfHeaderStyleBlue)
	overviewStyle.BodyAlign = "C"
	writePDFTable(pdf, []string{"设备名称", "IP地址", "类型", "状态", "通过率", "问题"}, overviewRows, []float64{35, 28, 25, 24, 24, 18}, overviewStyle)
	pdf.Ln(9)

	for _, device := range data.Devices {
		writePDFSubSectionTitle(pdf, fmt.Sprintf("设备: %s", device.DeviceName))
		deviceRows := [][]string{
			{"IP地址", device.IPAddress},
			{"设备类型", device.DeviceType},
			{"厂商", device.Vendor},
			{"型号", device.Model},
			{"软件版本", device.SoftwareVersion},
			{"运行时长", device.Uptime},
			{"最近巡检", device.LastInspectionTime},
			{"巡检状态", device.InspectionStatus},
			{"通过率", formatPercent(device.PassRate, 1)},
			{"问题数量", fmt.Sprintf("%d", device.IssueCount)},
			{"CPU使用率", formatPercent(device.Performance.CPUUsage, 1)},
			{"内存使用率", formatPercent(device.Performance.MemoryUsage, 1)},
			{"接口状态", fmt.Sprintf("%d/%d 活跃", device.Performance.ActiveInterfaces, device.Performance.TotalInterfaces)},
		}
		deviceStyle := defaultPDFTableStyle(pdfHeaderStyleLight)
		deviceStyle.TableAlign = "L"
		writePDFTable(pdf, []string{"属性", "值"}, deviceRows, []float64{45.7, 91.4}, deviceStyle)
		if len(device.CheckResults) > 0 {
			pdf.Ln(5)
			resultRows := make([][]string, 0, len(device.CheckResults))
			for idx, result := range device.CheckResults {
				if idx >= 12 {
					resultRows = append(resultRows, []string{"已截断", fmt.Sprintf("仅展示前%d条检查结果", 12), "", ""})
					break
				}
				resultRows = append(resultRows, []string{
					result.CheckItemName,
					result.CheckItemType,
					result.Status,
					result.ActualValue,
				})
			}
			resultStyle := defaultPDFTableStyle(pdfHeaderStyleBlue)
			resultStyle.BodyAlign = "L"
			writePDFTable(pdf, []string{"检查项", "类型", "状态", "实际值"}, resultRows, []float64{45.7, 30.5, 20.3, 45.7}, resultStyle)
		}
		pdf.Ln(10)
	}

	return pdf.OutputFileAndClose(path)
}

func writeStatisticsPDF(path string, data StatisticsReportData) error {
	pdf, err := newReportPDF()
	if err != nil {
		return err
	}

	title := normalizeReportTitle(data.Title, "统计报表")
	generatedAt := normalizeReportTime(strings.TrimSpace(data.GeneratedTimestamp), time.Time{})
	if generatedAt == "" {
		generatedAt = time.Now().Format("2006-01-02 15:04:05")
	}
	pdfkit.WriteHeroBanner(pdf, pdfkit.HeroBanner{
		Title:    title,
		Subtitle: "设备状态、分布与健康评分概览",
		Brand:    "INSPECT",
		Tagline:  "Report Center",
		Chips: []string{
			fmt.Sprintf("生成时间 %s", generatedAt),
			fmt.Sprintf("设备 %d 台", data.Overview.TotalDevices),
			fmt.Sprintf("平均评分 %s", formatFloat(data.Overview.AvgScore, 1)),
		},
	})
	pdf.Ln(6)

	writePDFSectionTitle(pdf, "统计概览")
	pdfkit.WriteStatCardRow(pdf, []pdfkit.StatCard{
		{Label: "设备总数", Value: fmt.Sprintf("%d", data.Overview.TotalDevices), Color: pdfkit.ColorPrimary},
		{Label: "在线设备", Value: fmt.Sprintf("%d", data.Overview.ActiveDevices), Color: pdfkit.ColorSuccess},
		{Label: "离线设备", Value: fmt.Sprintf("%d", data.Overview.OfflineDevices), Color: pdfkit.ColorSlate500},
		{Label: "平均评分", Value: formatFloat(data.Overview.AvgScore, 1), Color: pdfkit.ColorAmber500},
	}, 4)
	pdf.Ln(4)
	overview := buildStatisticsPDFOverviewRows(data)
	overviewStyle := defaultPDFTableStyle(pdfHeaderStyleLight)
	overviewStyle.TableAlign = "L"
	writePDFTable(pdf, []string{"统计项", "数值"}, overview, []float64{68, 48}, overviewStyle)

	addPDFPage(pdf)
	writePDFSectionTitle(pdf, "设备类型分布")
	embedDistributionBar(pdf, "设备类型占比", data.Distribution.ByType, []string{"switch", "router", "firewall", "server"})
	rows := buildIntDistributionRows(data.Distribution.ByType, []string{"switch", "router", "firewall", "server"}, "暂无设备类型分布数据")
	distributionStyle := defaultPDFTableStyle(pdfHeaderStyleLight)
	distributionStyle.BodyAlign = "L"
	writePDFTable(pdf, []string{"设备类型", "数量"}, rows, []float64{76.2, 50.8}, distributionStyle)
	pdf.Ln(9)

	writePDFSectionTitle(pdf, "位置分布")
	embedDistributionBar(pdf, "位置占比", data.Distribution.ByLocation, nil)
	locationRows := buildIntDistributionRows(data.Distribution.ByLocation, nil, "暂无位置分布数据")
	writePDFTable(pdf, []string{"位置", "数量"}, locationRows, []float64{76.2, 50.8}, distributionStyle)

	if len(data.TopDevices) > 0 {
		pdf.Ln(9)
		writePDFSectionTitle(pdf, "健康评分 Top 设备")
		topRows := make([][]string, 0, len(data.TopDevices))
		for idx, device := range data.TopDevices {
			if idx >= 10 {
				break
			}
			topRows = append(topRows, []string{device.DeviceName, device.DeviceType, formatFloat(device.Score, 1)})
		}
		topStyle := defaultPDFTableStyle(pdfHeaderStyleBlue)
		topStyle.BodyAlign = "C"
		writePDFTable(pdf, []string{"设备名称", "设备类型", "健康评分"}, topRows, []float64{61, 38.1, 30.5}, topStyle)
	}

	if len(data.Performance.ByDevice) > 0 {
		addPDFPage(pdf)
		writePDFSectionTitle(pdf, "性能指标明细")
		performanceRows := make([][]string, 0, len(data.Performance.ByDevice))
		for idx, item := range data.Performance.ByDevice {
			if idx >= 20 {
				performanceRows = append(performanceRows, []string{"已截断", "", "", "", "仅展示前20台设备"})
				break
			}
			performanceRows = append(performanceRows, []string{
				item.DeviceName,
				formatPercent(item.Metrics.CPUUsage, 1),
				formatPercent(item.Metrics.MemoryUsage, 1),
				formatPercent(item.Metrics.Availability, 1),
				formatFloat(item.Metrics.HealthScore, 1),
			})
		}
		performanceStyle := defaultPDFTableStyle(pdfHeaderStyleBlue)
		performanceStyle.BodyAlign = "C"
		writePDFTable(pdf, []string{"设备", "CPU", "内存", "可用性", "健康分"}, performanceRows, []float64{45.7, 25.4, 25.4, 25.4, 25.4}, performanceStyle)
	}

	return pdf.OutputFileAndClose(path)
}

func writeDeviceSummaryPDF(path string, data DeviceSummaryData) error {
	pdf, err := newReportPDF()
	if err != nil {
		return err
	}

	generatedAt := normalizeReportTime(strings.TrimSpace(data.GeneratedTimestamp), time.Time{})
	if generatedAt == "" {
		generatedAt = time.Now().Format("2006-01-02 15:04:05")
	}
	pdfkit.WriteHeroBanner(pdf, pdfkit.HeroBanner{
		Title:    "设备汇总报表",
		Subtitle: "设备在线状态与位置分布汇总",
		Brand:    "INSPECT",
		Tagline:  "Report Center",
		Chips: []string{
			fmt.Sprintf("生成时间 %s", generatedAt),
			fmt.Sprintf("设备 %d 台", data.Total),
			fmt.Sprintf("在线 %s", formatPercentByTotal(data.Online, data.Total)),
		},
	})
	pdf.Ln(6)

	writePDFSectionTitle(pdf, "设备概览统计")
	pdfkit.WriteStatCardRow(pdf, []pdfkit.StatCard{
		{Label: "设备总数", Value: fmt.Sprintf("%d", data.Total), Color: pdfkit.ColorPrimary},
		{Label: "在线设备", Value: fmt.Sprintf("%d", data.Online), Color: pdfkit.ColorSuccess},
		{Label: "离线设备", Value: fmt.Sprintf("%d", data.Offline), Color: pdfkit.ColorSlate500},
		{Label: "告警设备", Value: fmt.Sprintf("%d", data.Warning), Color: pdfkit.ColorWarning},
	}, 4)
	pdf.Ln(4)
	embedDeviceSummaryDonut(pdf, data)

	if len(data.Devices) > 0 {
		writePDFSectionTitle(pdf, "设备详情列表")
		rows := make([][]string, 0, len(data.Devices))
		for _, device := range data.Devices {
			rows = append(rows, []string{
				device.Name,
				device.IP,
				device.DeviceType,
				device.Status,
				device.Location,
			})
		}
		deviceStyle := defaultPDFTableStyle(pdfHeaderStyleBlue)
		deviceStyle.BodyAlign = "C"
		deviceStyle.HeaderHeight = 9.5
		deviceStyle.BodyHeight = 6.5
		writePDFTable(pdf, []string{"设备名称", "IP地址", "设备类型", "状态", "位置"}, rows, []float64{38.1, 30.5, 25.4, 20.3, 38.1}, deviceStyle)
	}

	return pdf.OutputFileAndClose(path)
}

func writeGenericPDF(path string, data GenericReportData) error {
	pdf, err := newReportPDF()
	if err != nil {
		return err
	}

	title := resolveGenericReportTitle(data.ReportType, data.ReportTitle, data.ReportName)
	reportName := normalizeReportTitle(data.ReportName, title)
	generatedAt := normalizeReportTime(strings.TrimSpace(data.GeneratedTimestamp), time.Time{})
	if generatedAt == "" {
		generatedAt = time.Now().Format("2006-01-02 15:04:05")
	}
	subtitle := reportName
	if subtitle == title {
		subtitle = genericReportTypeLabel(data.ReportType)
	}
	pdfkit.WriteHeroBanner(pdf, pdfkit.HeroBanner{
		Title:    title,
		Subtitle: subtitle,
		Brand:    "INSPECT",
		Tagline:  "Report Center",
		Chips: []string{
			fmt.Sprintf("生成时间 %s", generatedAt),
			fmt.Sprintf("统计周期 %s", fallbackPDFValue(data.Range)),
			fmt.Sprintf("生成人 %s", fallbackPDFValue(data.GeneratedBy)),
		},
	})
	pdf.Ln(6)

	writePDFSectionTitle(pdf, "报表概览")
	overviewRows := buildGenericPDFOverviewRows(data, reportName, generatedAt)
	overviewStyle := defaultPDFTableStyle(pdfHeaderStyleLight)
	overviewStyle.BodyAlign = "L"
	writePDFTable(pdf, []string{"项目", "内容"}, overviewRows, []float64{45.7, 91.4}, overviewStyle)
	pdf.Ln(9)

	writePDFSectionTitle(pdf, "摘要指标")
	summaryRows := buildGenericPDFSummaryRows(data.Summary)
	if len(data.Summary) > 0 {
		pdfkit.WriteStatCardRow(pdf, buildGenericPDFStatCards(data.Summary), 4)
		pdf.Ln(4)
	}
	summaryStyle := defaultPDFTableStyle(pdfHeaderStyleBlue)
	summaryStyle.BodyAlign = "L"
	writePDFTable(pdf, []string{"指标", "值"}, summaryRows, []float64{45.7, 91.4}, summaryStyle)

	extraRows := buildGenericPDFExtraRows(data)
	if len(extraRows) > 0 {
		pdf.Ln(9)
		writePDFSectionTitle(pdf, "补充信息")
		writePDFKeyValueBlocks(pdf, extraRows)
	}

	return pdf.OutputFileAndClose(path)
}

func buildStatisticsPDFOverviewRows(data StatisticsReportData) [][]string {
	return [][]string{
		{"设备总数", fmt.Sprintf("%d", data.Overview.TotalDevices)},
		{"在线设备", fmt.Sprintf("%d", data.Overview.ActiveDevices)},
		{"离线设备", fmt.Sprintf("%d", data.Overview.OfflineDevices)},
		{"告警设备", fmt.Sprintf("%d", data.Overview.WarningDevices)},
		{"异常设备", fmt.Sprintf("%d", data.Overview.ErrorDevices)},
		{"平均运行时长", formatHours(data.Overview.AvgUptimeHours)},
		{"巡检执行次数", fmt.Sprintf("%d", data.Overview.TotalExecutions)},
		{"平均健康评分", formatFloat(data.Overview.AvgScore, 1)},
	}
}

func buildGenericPDFOverviewRows(data GenericReportData, reportName string, generatedAt string) [][]string {
	return [][]string{
		{"报表名称", fallbackPDFValue(reportName)},
		{"报表类型", genericReportTypeLabel(data.ReportType)},
		{"统计周期", fallbackPDFValue(data.Range)},
		{"生成人", fallbackPDFValue(data.GeneratedBy)},
		{"生成时间", fallbackPDFValue(generatedAt)},
	}
}

func buildGenericPDFSummaryRows(summary map[string]interface{}) [][]string {
	if len(summary) == 0 {
		return [][]string{{"摘要", "暂无摘要数据"}}
	}

	preferred := []string{"total", "success", "passed", "failed", "warning", "error", "avg_score", "avg", "min", "max"}
	used := make(map[string]struct{}, len(summary))
	rows := make([][]string, 0, len(summary))
	for _, key := range preferred {
		value, ok := summary[key]
		if !ok {
			continue
		}
		rows = append(rows, []string{genericReportFieldLabel(key), fallbackPDFValue(formatSummaryItem(value))})
		used[key] = struct{}{}
	}

	keys := sortedKeys(summary)
	filteredKeys := make([]string, 0, len(keys))
	for _, key := range keys {
		if _, ok := used[key]; ok {
			continue
		}
		filteredKeys = append(filteredKeys, key)
	}
	for _, key := range filteredKeys {
		rows = append(rows, []string{genericReportFieldLabel(key), fallbackPDFValue(formatSummaryItem(summary[key]))})
	}
	return rows
}

// buildGenericPDFStatCards 把 generic 报表的 summary map 投影到统一的
// pdfkit.StatCard 类型。优先按 preferred 顺序选取（让 total/success/passed
// 等核心指标排在前面），不足 4 张时再用剩余字段按字典序补齐。颜色按
// metricColorForKey 的语义映射保持不变。
func buildGenericPDFStatCards(summary map[string]interface{}) []pdfkit.StatCard {
	preferred := []string{"total", "success", "passed", "failed", "warning", "error", "avg_score", "avg", "min", "max"}
	used := make(map[string]struct{}, len(summary))
	cards := make([]pdfkit.StatCard, 0, len(summary))
	for _, key := range preferred {
		value, ok := summary[key]
		if !ok {
			continue
		}
		cards = append(cards, pdfkit.StatCard{
			Label: genericReportFieldLabel(key),
			Value: fallbackPDFValue(formatSummaryItem(value)),
			Color: metricColorForKey(key),
		})
		used[key] = struct{}{}
		if len(cards) >= 4 {
			return cards
		}
	}

	for _, key := range sortedKeys(summary) {
		if _, ok := used[key]; ok {
			continue
		}
		cards = append(cards, pdfkit.StatCard{
			Label: genericReportFieldLabel(key),
			Value: fallbackPDFValue(formatSummaryItem(summary[key])),
			Color: metricColorForKey(key),
		})
		if len(cards) >= 4 {
			break
		}
	}
	return cards
}

func buildGenericPDFExtraRows(data GenericReportData) [][]string {
	rows := make([][]string, 0, len(data.Extra)+1)
	if strings.TrimSpace(data.Notes) != "" {
		rows = append(rows, []string{"备注", strings.TrimSpace(data.Notes)})
	}
	keys := sortedKeys(data.Extra)
	for _, key := range keys {
		rows = append(rows, []string{genericReportFieldLabel(key), fallbackPDFValue(formatValueForReport(data.Extra[key]))})
	}
	return rows
}

func buildIntDistributionRows(values map[string]int, preferred []string, emptyText string) [][]string {
	if len(values) == 0 {
		return [][]string{{emptyText, "0"}}
	}
	keys := orderedKeysByPreference(values, preferred)
	rows := make([][]string, 0, len(keys))
	for _, key := range keys {
		rows = append(rows, []string{fallbackPDFValue(key), fmt.Sprintf("%d", values[key])})
	}
	return rows
}

func genericReportTypeLabel(reportType string) string {
	switch strings.ToLower(strings.TrimSpace(reportType)) {
	case "inspection", "inspection_report":
		return "巡检结果报表"
	case "trend", "trend_report", "trend_analysis":
		return "趋势分析报表"
	case "statistics", "statistics_report":
		return "统计报表"
	case "custom", "custom_report":
		return "自定义报表"
	case "alert", "alert_report", "alert_summary":
		return "告警统计报表"
	case "performance", "performance_report":
		return "性能分析报表"
	case "availability", "device_summary", "device_status":
		return "设备汇总报表"
	default:
		if strings.TrimSpace(reportType) == "" {
			return "通用报表"
		}
		return strings.TrimSpace(reportType)
	}
}

func genericReportFieldLabel(key string) string {
	switch strings.ToLower(strings.TrimSpace(key)) {
	case "total":
		return "总数"
	case "success":
		return "成功"
	case "passed":
		return "通过"
	case "failed":
		return "失败"
	case "warning":
		return "警告"
	case "error", "errors":
		return "错误"
	case "avg_score":
		return "平均评分"
	case "avg":
		return "平均值"
	case "min":
		return "最小值"
	case "max":
		return "最大值"
	case "metrics":
		return "指标"
	case "include_predictions":
		return "包含预测"
	case "include_charts":
		return "包含图表"
	case "include_details", "include_detail_data":
		return "包含明细"
	case "include_recommendations":
		return "包含建议"
	case "description":
		return "描述"
	case "category":
		return "分类"
	case "parameters":
		return "参数"
	case "custom_config":
		return "自定义配置"
	default:
		return strings.TrimSpace(key)
	}
}

func fallbackPDFValue(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || trimmed == "{}" {
		return "-"
	}
	return trimmed
}

type pdfHeaderStyle struct {
	FillColor [3]int
	TextColor [3]int
	FontStyle string
	FontSize  float64
	Align     string
}

type pdfTableStyle struct {
	Header             pdfHeaderStyle
	BodyAlign          string
	BodyFillColor      [3]int
	AlternateFillColor [3]int
	BodyTextColor      [3]int
	BorderColor        [3]int
	BodyFontSize       float64
	HeaderHeight       float64
	BodyHeight         float64
	HeaderBorder       string
	BodyBorder         string
	TableAlign         string
}

var (
	pdfColorPaper       = pdfkit.ColorSurfaceMuted // slate-50
	pdfColorPanel       = pdfkit.ColorSurfacePanel // slate-100
	pdfColorPrimary     = pdfkit.ColorPrimary      // indigo-500
	pdfColorPurple      = pdfkit.ColorIndigo400    // accent — Tailwind indigo-400 替代旧 #667EEA
	pdfColorSuccess     = pdfkit.ColorSuccess      // emerald-500
	pdfColorWarning     = pdfkit.ColorWarning      // amber-500
	pdfColorDanger      = pdfkit.ColorDanger       // rose-500
	pdfColorGrey        = pdfkit.ColorSlate500
	pdfColorText        = pdfkit.ColorText      // slate-900
	pdfColorMuted       = pdfkit.ColorTextMuted // slate-500
	pdfColorBorder      = pdfkit.ColorBorder    // slate-200
	pdfHeaderStyleLight = pdfHeaderStyle{
		FillColor: pdfColorPanel,
		TextColor: pdfColorText,
		FontStyle: "B",
		FontSize:  10,
		Align:     "L",
	}
	pdfHeaderStyleBlue = pdfHeaderStyle{
		FillColor: pdfColorPrimary,
		TextColor: pdfkit.ColorWhite,
		FontStyle: "B",
		FontSize:  9,
		Align:     "C",
	}
)

func newReportPDF() (*gofpdf.Fpdf, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(pdfMarginMM, pdfMarginMM, pdfMarginMM)
	pdf.SetAutoPageBreak(true, pdfBottomMM)
	if err := pdfkit.RegisterFonts(pdf); err != nil {
		return nil, err
	}
	// 直接走 pdfkit.PageFooter，与监控 PDF 共享同一份页脚渲染，确保
	// 中文字体回退一致（旧实现自带 SetFooterFunc 也用 pdfFontName=CJK，
	// 但样式细节与 pdfkit.PageFooter 不同，会让两类报告页脚视觉不统一）。
	pdf.SetFooterFunc(func() {
		pdfkit.PageFooter(pdf, "Inspect Report Center", pdf.PageNo())
	})
	addPDFPage(pdf)
	pdf.SetFont(pdfFontName, "", pdfBodySize)
	return pdf, nil
}

func addPDFPage(pdf *gofpdf.Fpdf) {
	pdf.AddPage()
	if pdfTopOffsetMM != 0 {
		pdf.SetY(pdf.GetY() + pdfTopOffsetMM)
	}
}

func writePDFTitle(pdf *gofpdf.Fpdf, title string) {
	pdf.SetFont(pdfFontName, "B", pdfTitleSize)
	pdf.CellFormat(0, 10, title, "", 1, "C", false, 0, "")
}

func writePDFTitleColored(pdf *gofpdf.Fpdf, title string, color [3]int) {
	pdf.SetFont(pdfFontName, "B", pdfTitleSize)
	pdf.SetTextColor(color[0], color[1], color[2])
	pdf.CellFormat(0, 10, title, "", 1, "C", false, 0, "")
	pdf.SetTextColor(0, 0, 0)
}

func writePDFSubtitle(pdf *gofpdf.Fpdf, subtitle string) {
	pdf.SetFont(pdfFontName, "", pdfBodySize)
	pdf.CellFormat(0, 8, subtitle, "", 1, "C", false, 0, "")
}

func writePDFSectionTitle(pdf *gofpdf.Fpdf, title string) {
	pdf.SetFont(pdfFontName, "B", pdfHeadingSize)
	x := pdf.GetX()
	y := pdf.GetY()
	pdf.SetFillColor(pdfColorPrimary[0], pdfColorPrimary[1], pdfColorPrimary[2])
	pdf.Rect(x, y+1.4, 1.8, 6.3, "F")
	pdf.SetX(x + 4)
	pdf.SetTextColor(pdfColorText[0], pdfColorText[1], pdfColorText[2])
	pdf.CellFormat(0, 8, title, "", 1, "L", false, 0, "")
	pdf.SetTextColor(0, 0, 0)
	pdf.SetFont(pdfFontName, "", pdfBodySize)
	pdf.Ln(2)
}

func writePDFSubSectionTitle(pdf *gofpdf.Fpdf, title string) {
	pdf.SetFont(pdfFontName, "B", pdfBodySize)
	pdf.SetTextColor(pdfColorText[0], pdfColorText[1], pdfColorText[2])
	pdf.CellFormat(0, 7, title, "", 1, "L", false, 0, "")
	pdf.SetTextColor(0, 0, 0)
	pdf.SetFont(pdfFontName, "", pdfBodySize)
	pdf.Ln(4)
}

func writePDFKeyValueBlocks(pdf *gofpdf.Fpdf, rows [][]string) {
	for _, row := range rows {
		if len(row) < 2 {
			continue
		}
		pdf.SetFont(pdfFontName, "B", pdfBodySize)
		pdf.CellFormat(0, 7, row[0], "", 1, "L", false, 0, "")
		pdf.SetFont(pdfFontName, "", pdfSmallSize)
		pdf.SetTextColor(pdfColorGrey[0], pdfColorGrey[1], pdfColorGrey[2])
		pdf.MultiCell(0, 6, row[1], "", "L", false)
		pdf.SetTextColor(0, 0, 0)
		pdf.Ln(4)
	}
	pdf.SetFont(pdfFontName, "", pdfBodySize)
}

func writePDFRightAligned(pdf *gofpdf.Fpdf, text string) {
	pdf.SetFont(pdfFontName, "", pdfSmallSize)
	pdf.CellFormat(0, 6, text, "", 1, "R", false, 0, "")
	pdf.SetFont(pdfFontName, "", pdfBodySize)
}

func writePDFRightAlignedColored(pdf *gofpdf.Fpdf, text string, color [3]int) {
	pdf.SetFont(pdfFontName, "", pdfSmallSize)
	pdf.SetTextColor(color[0], color[1], color[2])
	pdf.CellFormat(0, 6, text, "", 1, "R", false, 0, "")
	pdf.SetTextColor(0, 0, 0)
	pdf.SetFont(pdfFontName, "", pdfBodySize)
}

func defaultPDFTableStyle(header pdfHeaderStyle) pdfTableStyle {
	return pdfTableStyle{
		Header:             header,
		BodyAlign:          "L",
		BodyFillColor:      [3]int{255, 255, 255},
		AlternateFillColor: pdfColorPaper,
		BodyTextColor:      pdfColorText,
		BorderColor:        pdfColorBorder,
		BodyFontSize:       pdfSmallSize,
		HeaderHeight:       8,
		BodyHeight:         7,
		HeaderBorder:       "1",
		BodyBorder:         "1",
		TableAlign:         "C",
	}
}

func writePDFTable(pdf *gofpdf.Fpdf, headers []string, rows [][]string, colWidths []float64, style pdfTableStyle) {
	if len(headers) == 0 || len(colWidths) == 0 {
		return
	}
	totalWidth := 0.0
	for _, width := range colWidths {
		totalWidth += width
	}
	startX := tableStartX(pdf, totalWidth, style.TableAlign)
	prevLineWidth := pdf.GetLineWidth()
	pdf.SetLineWidth(pdfTableLineMM)
	defer pdf.SetLineWidth(prevLineWidth)

	pdf.SetDrawColor(style.BorderColor[0], style.BorderColor[1], style.BorderColor[2])
	pdf.SetFont(pdfFontName, style.Header.FontStyle, style.Header.FontSize)
	pdf.SetFillColor(style.Header.FillColor[0], style.Header.FillColor[1], style.Header.FillColor[2])
	pdf.SetTextColor(style.Header.TextColor[0], style.Header.TextColor[1], style.Header.TextColor[2])
	pdf.SetX(startX)
	headerBorder := style.HeaderBorder
	if headerBorder == "" {
		headerBorder = "1"
	}
	for i, header := range headers {
		if i >= len(colWidths) {
			break
		}
		pdf.CellFormat(colWidths[i], style.HeaderHeight, header, headerBorder, 0, style.Header.Align, true, 0, "")
	}
	pdf.Ln(-1)
	pdf.SetFont(pdfFontName, "", style.BodyFontSize)
	pdf.SetTextColor(style.BodyTextColor[0], style.BodyTextColor[1], style.BodyTextColor[2])
	bodyBorder := style.BodyBorder
	if bodyBorder == "" {
		bodyBorder = "1"
	}
	for rowIndex, row := range rows {
		pdf.SetX(startX)
		fill := style.BodyFillColor
		if rowIndex%2 == 1 && !isZeroColor(style.AlternateFillColor) {
			fill = style.AlternateFillColor
		}
		pdf.SetFillColor(fill[0], fill[1], fill[2])
		for i := range headers {
			if i >= len(colWidths) {
				break
			}
			value := ""
			if i < len(row) {
				value = row[i]
			}
			pdf.CellFormat(colWidths[i], style.BodyHeight, value, bodyBorder, 0, style.BodyAlign, true, 0, "")
		}
		pdf.Ln(-1)
	}
	pdf.SetTextColor(0, 0, 0)
	pdf.SetFont(pdfFontName, "", pdfBodySize)
}

func tableStartX(pdf *gofpdf.Fpdf, totalWidth float64, align string) float64 {
	pageWidth, _ := pdf.GetPageSize()
	left, _, right, _ := pdf.GetMargins()
	usableWidth := pageWidth - left - right
	if usableWidth <= 0 {
		return left
	}

	switch strings.ToUpper(strings.TrimSpace(align)) {
	case "C", "CENTER":
		return left + (usableWidth-totalWidth)/2
	case "R", "RIGHT":
		return left + usableWidth - totalWidth
	default:
		return left
	}
}

func metricColorForKey(key string) [3]int {
	switch strings.ToLower(strings.TrimSpace(key)) {
	case "success", "passed", "avg_score", "avg":
		return pdfColorSuccess
	case "failed", "error", "errors":
		return pdfColorDanger
	case "warning":
		return pdfColorWarning
	case "min", "max":
		return pdfColorPrimary
	default:
		return pdfColorPurple
	}
}

func isZeroColor(color [3]int) bool {
	return color == [3]int{}
}

// =========================================================================
// Chart embedders — bridge the existing PDF flow to pdfkit's chart renderers.
// Each helper is best-effort: if the chart can't be rendered (no slices /
// missing fonts / etc) it silently returns and the surrounding table-only
// layout still ships, so PDF generation never fails just because a chart
// could not be produced.
// =========================================================================

// embedInspectionDonut renders the pass / warn / fail / error breakdown as
// a donut chart sized to ~50% page width, centered horizontally.
func embedInspectionDonut(pdf *gofpdf.Fpdf, stats InspectionSummaryStats) {
	slices := []pdfkit.DonutSlice{
		{Label: "通过", Value: float64(stats.PassedChecks), Color: pdfkit.ColorSuccess},
		{Label: "警告", Value: float64(stats.WarningChecks), Color: pdfkit.ColorWarning},
		{Label: "失败", Value: float64(stats.FailedChecks), Color: pdfkit.ColorDanger},
		{Label: "错误", Value: float64(stats.ErrorChecks), Color: pdfkit.ColorRose600},
	}
	if pdfkitDonutEmpty(slices) {
		return
	}
	png, err := pdfkit.RenderDonutChart(pdfkit.DonutSpec{
		Title:  "检查项分布",
		Slices: slices,
	})
	if err != nil {
		return
	}
	embedCenteredImage(pdf, png, 0.55, 0.6)
}

// embedDistributionBar renders a categorical distribution as a bar chart.
// Preferred order pins well-known device types (switch/router/firewall/...)
// to a stable slot; remaining entries are sorted by descending count.
func embedDistributionBar(pdf *gofpdf.Fpdf, title string, values map[string]int, preferred []string) {
	if len(values) == 0 {
		return
	}
	keys := orderedKeysByPreference(values, preferred)
	bars := make([]pdfkit.DonutSlice, 0, len(keys))
	for _, k := range keys {
		v := values[k]
		if v <= 0 {
			continue
		}
		bars = append(bars, pdfkit.DonutSlice{Label: k, Value: float64(v), Color: pdfkit.ColorPrimary})
	}
	if len(bars) == 0 {
		return
	}
	png, err := pdfkit.RenderBarChart(pdfkit.BarSpec{
		Title:    title,
		Bars:     bars,
		BarColor: pdfkit.ColorPrimary,
	})
	if err != nil {
		return
	}
	embedCenteredImage(pdf, png, 0.7, 0.55)
}

// embedDeviceSummaryDonut shows online / warning / offline composition.
func embedDeviceSummaryDonut(pdf *gofpdf.Fpdf, data DeviceSummaryData) {
	slices := []pdfkit.DonutSlice{
		{Label: "在线", Value: float64(data.Online), Color: pdfkit.ColorSuccess},
		{Label: "告警", Value: float64(data.Warning), Color: pdfkit.ColorWarning},
		{Label: "离线", Value: float64(data.Offline), Color: pdfkit.ColorSlate500},
	}
	if pdfkitDonutEmpty(slices) {
		return
	}
	png, err := pdfkit.RenderDonutChart(pdfkit.DonutSpec{
		Title:  "设备状态分布",
		Slices: slices,
	})
	if err != nil {
		return
	}
	embedCenteredImage(pdf, png, 0.55, 0.6)
}

func pdfkitDonutEmpty(slices []pdfkit.DonutSlice) bool {
	for _, s := range slices {
		if s.Value > 0 {
			return false
		}
	}
	return true
}

// embedCenteredImage places a PNG centered horizontally with a width that
// is `widthRatio` of the usable page width and a height proportional via
// `heightRatio` (height = width * heightRatio). Advances Y past the image.
func embedCenteredImage(pdf *gofpdf.Fpdf, png []byte, widthRatio, heightRatio float64) {
	pageW, _ := pdf.GetPageSize()
	left, _, right, _ := pdf.GetMargins()
	usable := pageW - left - right
	w := usable * widthRatio
	h := w * heightRatio
	x := left + (usable-w)/2
	y := pdf.GetY()
	if err := pdfkit.EmbedChart(pdf, png, x, y, w, h); err != nil {
		return
	}
	pdf.SetY(y + h + 4)
}
