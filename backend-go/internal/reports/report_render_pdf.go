package reports

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/phpdave11/gofpdf"

	"github.com/your-org/inspect-system/backend-go/internal/reports/pdfkit"
)

// pdfFontName routes through pdfkit.FontFamilyCJK so all SetFont calls in
// this file pick up the font registration done by pdfkit.RegisterFonts
// (regular + true-bold CJK faces resolved per host).
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
	// pdfMaxWrapLines 限制换行列单格最多展开的行数，防止异常超长的采集
	// 输出把一行撑到整页；到达上限后末行以省略号收尾。
	pdfMaxWrapLines = 6
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
		Brand:    "巡检系统",
		Tagline:  "报告中心",
		Chips: []string{
			// chip 按重要度排序：HeroBanner 在宽度不足时从尾部丢弃，
			// 「待处理 N 项」是行动指标不能被挤掉，设备台数在「基本信息」
			// 卡片里已有一份，放最后即使被截断也不丢信息。
			fmt.Sprintf("生成时间 %s", generatedAt),
			fmt.Sprintf("通过率 %s", formatPercent(data.SummaryStats.PassRate, 1)),
			inspectionIssueChip(data.SummaryStats),
			fmt.Sprintf("设备 %d 台", len(data.Devices)),
		},
	})
	pdf.Ln(6)

	writePDFSectionTitle(pdf, "基本信息")
	// 4 张「基本信息」卡片改用 pdfkit.WriteStatCardRow（白底+顶色条）
	// 与「统计摘要」风格统一；颜色按业务语义彩虹化：标识/时间/数量/性能时长
	// → indigo/emerald/amber/rose，避免旧版「执行时长」突兀灰色。
	pdfkit.WriteStatCardRow(pdf, []pdfkit.StatCard{
		// 首卡展示巡检名称（可读标识）；内部编号降级为 Hint 小字保留，
		// 既满足「一眼看清是哪次巡检」，又不丢失工单追溯所需的 ID。
		{Label: "巡检名称", Value: fallbackPDFValue(data.InspectionName), Hint: "编号 " + fallbackPDFValue(data.InspectionID), Color: pdfkit.ColorPrimary},
		{Label: "巡检时间", Value: fallbackPDFValue(inspectionTime), Color: pdfkit.ColorEmerald500},
		{Label: "设备总数", Value: fmt.Sprintf("%d", len(data.Devices)), Color: pdfkit.ColorAmber500},
		{Label: "执行时长", Value: formatDurationSeconds(data.ExecutionDuration), Color: pdfkit.ColorRose500},
	}, 4)
	pdf.Ln(4)

	writePDFSectionTitle(pdf, "统计摘要")
	// 卡片按实际出现的状态动态生成：只有真的存在「错误 / 跳过 / 未知」
	// 检查项时才多出对应卡片。固定 4 张卡（总/通过/警告/失败）是旧版
	// 「9 = 7 + 1 + 0」缺一项的直接原因——第 9 项没有任何一张卡能承载。
	summaryCards := buildInspectionSummaryCards(data.SummaryStats)
	pdfkit.WriteStatCardRow(pdf, summaryCards, len(summaryCards))
	pdf.Ln(1)
	// 口径说明行把恒等式直接写出来，读者不必自己做减法去猜差额去哪了。
	writePDFRightAlignedColored(pdf, describeInspectionTally(data.SummaryStats), pdfColorMuted)
	pdf.Ln(1)
	pdfkit.ProgressBar(pdf, "通过率", data.SummaryStats.PassRate, pdfkit.PassRateColor(data.SummaryStats.PassRate))
	embedInspectionDonut(pdf, data.SummaryStats)

	// 异常清单紧跟统计摘要：数字之后立刻给出「哪台设备的哪一项出了问题」，
	// 读者不必翻到后面逐设备明细里自行检索状态列。
	pdf.Ln(2)
	writeInspectionIssueSection(pdf, collectInspectionIssues(data))
	pdf.Ln(4)

	// 旧版此处无条件 addPDFPage，设备很少甚至为空时首页下半页整片留白。
	// 改为仅在当前页放不下「节标题 + 概览表头 + 约 4 行」时才换页；更长的
	// 概览表依赖 writePDFTable 的跨页表头重绘自然续页。
	ensurePDFSpace(pdf, 48)
	pdf.Ln(1)
	writePDFSectionTitle(pdf, "设备巡检详情")
	if len(data.Devices) == 0 {
		pdfkit.EmptyStateWithHint(pdf, "当前筛选条件下暂无设备巡检明细", "请调整筛选条件后重试")
		return pdf.OutputFileAndClose(path)
	}
	overviewRows := make([][]string, 0, len(data.Devices))
	overviewFills := make([][3]int, 0, len(data.Devices))
	overviewAccents := make([][3]int, 0, len(data.Devices))
	for _, device := range data.Devices {
		overviewRows = append(overviewRows, []string{
			fallbackPDFValue(device.DeviceName),
			fallbackPDFValue(device.IPAddress),
			fallbackPDFValue(localizeDeviceType(device.DeviceType)),
			fallbackPDFValue(localizeStatusWord(device.InspectionStatus)),
			formatPercent(device.PassRate, 1),
			fmt.Sprintf("%d", device.IssueCount),
		})
		// 有问题的设备整行染色，读者扫一眼概览表就知道该盯哪几台。
		fill, accent := [3]int{}, [3]int{}
		if device.IssueCount > 0 {
			fill, accent = pdfkit.ColorRose100, pdfkit.ColorDanger
		}
		overviewFills = append(overviewFills, fill)
		overviewAccents = append(overviewAccents, accent)
	}
	overviewStyle := defaultPDFTableStyle(pdfHeaderStyleBlue)
	overviewStyle.BodyAlign = "C"
	overviewStyle.RowFills = overviewFills
	overviewStyle.RowAccents = overviewAccents
	writePDFTable(pdf, []string{"设备名称", "IP地址", "类型", "状态", "通过率", "问题"}, overviewRows, []float64{35, 28, 25, 24, 24, 18}, overviewStyle)
	pdf.Ln(9)

	for _, device := range data.Devices {
		// 小节标题 + 属性表头 + 前两行合计约 35mm；不够就先换页，避免
		// 「设备: xxx」标题孤悬页底而表格全部落到下一页。
		ensurePDFSpace(pdf, 42)
		writePDFSubSectionTitle(pdf, fmt.Sprintf("设备: %s", device.DeviceName))
		deviceRows := [][]string{
			{"IP地址", device.IPAddress},
			{"设备类型", localizeDeviceType(device.DeviceType)},
			{"厂商", localizeVendor(device.Vendor)},
			{"型号", device.Model},
			{"软件版本", device.SoftwareVersion},
			{"运行时长", device.Uptime},
			{"最近巡检", device.LastInspectionTime},
			{"巡检状态", localizeStatusWord(device.InspectionStatus)},
			{"通过率", formatPercent(device.PassRate, 1)},
			{"问题数量", fmt.Sprintf("%d", device.IssueCount)},
		}
		deviceStyle := defaultPDFTableStyle(pdfHeaderStyleLight)
		deviceStyle.TableAlign = "L"
		writePDFTable(pdf, []string{"属性", "值"}, deviceRows, []float64{45.7, 91.4}, deviceStyle)
		if len(device.CheckResults) > 0 {
			pdf.Ln(5)
			resultRows := make([][]string, 0, len(device.CheckResults))
			for idx, result := range device.CheckResults {
				if idx >= 12 {
					resultRows = append(resultRows, []string{"已截断", fmt.Sprintf("仅展示前%d条检查结果", 12), "", "", ""})
					break
				}
				resultRows = append(resultRows, []string{
					result.CheckItemName,
					localizeProtocolTerm(result.CheckItemType),
					localizeStatusWord(result.Status),
					fallbackPDFValue(result.ExpectedValue),
					result.ActualValue,
				})
			}
			resultStyle := defaultPDFTableStyle(pdfHeaderStyleBlue)
			resultStyle.BodyAlign = "L"
			// "参考标准"（index 3）与"实际值"（index 4）都可能是长文本
			//（阈值区间说明 / 原始采集输出），启用换行完整展示，不截断。
			resultStyle.WrapColumns = []int{3, 4}
			// 明细表里的异常行同样染色，与前置异常清单形成呼应。
			resultStyle.RowFills, resultStyle.RowAccents = checkResultRowTints(resultRows, 2)
			writePDFTable(pdf, []string{"检查项", "类型", "状态", "参考标准", "实际值"}, resultRows, []float64{38, 16, 13, 37, 38.2}, resultStyle)

			// 明细型检查项各自出一张表：上表的定宽单元格塞不下长清单，
			// 也无法承载逐项的原始值与判定依据。
			for _, result := range device.CheckResults {
				writeCheckDetailTables(pdf, result)
			}
		}
		pdf.Ln(10)
	}

	writeInspectionConclusion(pdf, data)

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
		Brand:    "巡检系统",
		Tagline:  "报告中心",
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

	ensurePDFSpace(pdf, 110)
	writePDFSectionTitle(pdf, "设备类型分布")
	// 类型分布的 key 是英文枚举（switch/router/…），图表与表格展示前先
	// 翻译；preferred 顺序表同步翻译以维持固定排序。
	typeCounts := localizeIntMapKeys(data.Distribution.ByType, localizeDeviceType)
	typePreferred := localizeStrings([]string{"switch", "router", "firewall", "server"}, localizeDeviceType)
	embedDistributionBar(pdf, "设备类型占比", typeCounts, typePreferred)
	rows := buildIntDistributionRows(typeCounts, typePreferred, "暂无设备类型分布数据")
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
			topRows = append(topRows, []string{device.DeviceName, localizeDeviceType(device.DeviceType), formatFloat(device.Score, 1)})
		}
		topStyle := defaultPDFTableStyle(pdfHeaderStyleBlue)
		topStyle.BodyAlign = "C"
		writePDFTable(pdf, []string{"设备名称", "设备类型", "健康评分"}, topRows, []float64{61, 38.1, 30.5}, topStyle)
	}

	if len(data.Performance.ByDevice) > 0 {
		ensurePDFSpace(pdf, 64)
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
		Brand:    "巡检系统",
		Tagline:  "报告中心",
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
				localizeDeviceType(device.DeviceType),
				localizeStatusWord(device.Status),
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
		Brand:    "巡检系统",
		Tagline:  "报告中心",
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

// pdfEmptyValuePlaceholder 是表格里「无此数据」的统一占位符。
// 缺失必须与 0 可区分：「未上报电压」和「电压 0V」是两个完全不同的结论。
const pdfEmptyValuePlaceholder = "-"

func fallbackPDFValue(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || trimmed == "{}" {
		return pdfEmptyValuePlaceholder
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
	// WrapColumns 列出的列索引启用自动换行：单元格按列宽拆行、行高随
	// 行数增长（上限 pdfMaxWrapLines），完整展示长文本；未列出的列保持
	// 单行 + 截断省略号。
	WrapColumns []int
	// RowFills 按行索引覆盖该行底色（零值回退斑马纹），RowAccents 在行
	// 左缘绘制一条竖色条。两者用于把「警告 / 失败 / 错误」行从通过行里
	// 视觉分离出来——只靠奇偶灰白，异常行和正常行权重完全一样。
	RowFills   [][3]int
	RowAccents [][3]int
}

// rowTint 取第 index 行的语义色（底色或色条），越界或零值时返回 false。
func rowTint(list [][3]int, index int) ([3]int, bool) {
	if index < 0 || index >= len(list) || isZeroColor(list[index]) {
		return [3]int{}, false
	}
	return list[index], true
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
		pdfkit.PageFooter(pdf, "巡检系统 · 报告中心", pdf.PageNo())
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

// ensurePDFSpace starts a new page when fewer than needMM millimeters remain
// above the bottom margin. Callers use it before section titles / sub-tables
// so a heading is never orphaned at the very bottom of a page, and small
// reports are no longer forced onto a mostly-blank extra page.
func ensurePDFSpace(pdf *gofpdf.Fpdf, needMM float64) {
	_, pageH := pdf.GetPageSize()
	if pdf.GetY()+needMM > pageH-pdfBottomMM {
		addPDFPage(pdf)
	}
}

// truncatePDFText shortens text with a trailing ellipsis until it fits
// maxWidth at the currently-set font. gofpdf's CellFormat neither wraps nor
// clips, so untruncated long values (device names, raw check outputs) would
// otherwise be drawn straight across the neighbouring columns.
func truncatePDFText(pdf *gofpdf.Fpdf, text string, maxWidth float64) string {
	if maxWidth <= 0 || pdf.GetStringWidth(text) <= maxWidth {
		return text
	}
	const ellipsis = "…"
	runes := []rune(text)
	for len(runes) > 0 {
		runes = runes[:len(runes)-1]
		candidate := string(runes) + ellipsis
		if pdf.GetStringWidth(candidate) <= maxWidth {
			return candidate
		}
	}
	return ellipsis
}

// splitPDFTextLines wraps text into lines no wider than maxWidth using the
// currently-set font, breaking on rune boundaries. gofpdf's own SplitText
// walks the string byte-by-byte (designed for cp1252 fonts) and may break
// inside a multi-byte CJK sequence, swallowing one byte at the break point —
// a Chinese character silently disappears from the output. Width accumulates
// per rune, which matches full-string measurement since gofpdf applies no
// kerning.
func splitPDFTextLines(pdf *gofpdf.Fpdf, text string, maxWidth float64) []string {
	if text == "" {
		return []string{""}
	}
	lines := make([]string, 0, 2)
	var current strings.Builder
	lineWidth := 0.0
	for _, r := range text {
		runeWidth := pdf.GetStringWidth(string(r))
		if current.Len() > 0 && maxWidth > 0 && lineWidth+runeWidth > maxWidth {
			lines = append(lines, current.String())
			current.Reset()
			lineWidth = 0
		}
		current.WriteRune(r)
		lineWidth += runeWidth
	}
	return append(lines, current.String())
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

// formatBandwidthPDF 把 bps 速率渲染成易读单位；缺采样时显示 "-"。
func formatBandwidthPDF(bps *float64) string {
	if bps == nil {
		return "-"
	}
	value := *bps
	switch {
	case value >= 1_000_000_000:
		return fmt.Sprintf("%.2f Gbps", value/1_000_000_000)
	case value >= 1_000_000:
		return fmt.Sprintf("%.2f Mbps", value/1_000_000)
	case value >= 1_000:
		return fmt.Sprintf("%.2f Kbps", value/1_000)
	default:
		return fmt.Sprintf("%.0f bps", value)
	}
}

// writeInterfaceUtilizationPDFTable 为「接口利用率」检查项输出逐接口明细表。
// 上层的 5 列检查结果表只能容纳一行摘要，接口清单必须单独成表才不会被截断。
// 未参与评估的接口附原因一并列出，避免"29 个接口只看到 2 行"的困惑。
func writeInterfaceUtilizationPDFTable(pdf *gofpdf.Fpdf, result InspectionCheckResult) {
	detail := result.InterfaceUtilization
	if detail == nil || (len(detail.Interfaces) == 0 && len(detail.Skipped) == 0) {
		return
	}

	pdf.Ln(4)
	ensurePDFSpace(pdf, 40)
	writePDFSubSectionTitle(pdf, fmt.Sprintf("%s - 逐接口明细（已评估 %d/%d）",
		result.CheckItemName, detail.Evaluated, detail.Total))

	if len(detail.Interfaces) > 0 {
		rows := make([][]string, 0, len(detail.Interfaces))
		for _, entry := range detail.Interfaces {
			percent := fmt.Sprintf("%.2f%%", entry.Percent)
			if entry.Percent > 0 && entry.Percent < 0.01 {
				percent = "<0.01%"
			}
			rows = append(rows, []string{
				entry.Name,
				entry.Direction,
				percent,
				fmt.Sprintf("%d Mbps", entry.SpeedMbps),
				formatBandwidthPDF(entry.InRateBps),
				formatBandwidthPDF(entry.OutRateBps),
			})
		}
		style := defaultPDFTableStyle(pdfHeaderStyleBlue)
		style.BodyAlign = "L"
		style.WrapColumns = []int{0}
		writePDFTable(pdf,
			[]string{"接口", "峰值方向", "利用率", "带宽容量", "入向速率", "出向速率"},
			rows, []float64{40, 18, 20, 22, 21.2, 21}, style)
	}

	if len(detail.Skipped) > 0 {
		pdf.Ln(3)
		ensurePDFSpace(pdf, 25)
		rows := make([][]string, 0, len(detail.Skipped))
		for _, item := range detail.Skipped {
			rows = append(rows, []string{item.Name, item.Reason})
		}
		style := defaultPDFTableStyle(pdfHeaderStyleLight)
		style.BodyAlign = "L"
		style.WrapColumns = []int{0, 1}
		writePDFTable(pdf, []string{"未评估接口", "原因"}, rows, []float64{60, 82.2}, style)
	}
}

// writeCheckDetailTables 按明细类型分派渲染。
// 五种载荷互斥，一条检查结果至多命中一种；都不命中时什么也不画。
func writeCheckDetailTables(pdf *gofpdf.Fpdf, result InspectionCheckResult) {
	writeInterfaceUtilizationPDFTable(pdf, result)
	writeInterfaceRatioPDFTable(pdf, result)
	writeOpticalPowerPDFTable(pdf, result)
	writeBGPPeersPDFTable(pdf, result)
	writeComponentStatusPDFTable(pdf, result)
}

// writeDetailSkippedPDFTable 输出「未参与评估的对象及原因」表。
// 错包与光模块共用：两者都会因设备未上报某个计数器而跳过部分对象，
// 不列出来就会出现「29 个接口只看到 2 行」的困惑。
func writeDetailSkippedPDFTable(pdf *gofpdf.Fpdf, header string, skipped []InterfaceUtilizationSkippedReport) {
	if len(skipped) == 0 {
		return
	}
	pdf.Ln(3)
	ensurePDFSpace(pdf, 25)
	rows := make([][]string, 0, len(skipped))
	for _, item := range skipped {
		rows = append(rows, []string{item.Name, item.Reason})
	}
	style := defaultPDFTableStyle(pdfHeaderStyleLight)
	style.BodyAlign = "L"
	style.WrapColumns = []int{0, 1}
	writePDFTable(pdf, []string{header, "原因"}, rows, []float64{60, 82.2}, style)
}

// formatDetailPercent 格式化比率。极小的非零值显示成 "<0.01%" 而不是 "0.00%"：
// 后者会把「有错包但很少」误传成「一个错包都没有」。
func formatDetailPercent(percent float64) string {
	if percent > 0 && percent < 0.01 {
		return "<0.01%"
	}
	return fmt.Sprintf("%.2f%%", percent)
}

// formatOptionalFloat 渲染可缺失的诊断量。
// 缺失显示为占位符而非 0——「未上报电压」和「电压 0V」是两个完全不同的结论。
func formatOptionalFloat(value *float64, unit string, precision int) string {
	if value == nil {
		return pdfEmptyValuePlaceholder
	}
	text := formatFloat(*value, precision)
	if unit != "" {
		return text + unit
	}
	return text
}

// writeInterfaceRatioPDFTable 为「接口错包率 / 丢弃率」输出逐接口明细表。
//
// 同时给出比率与原始计数：累计比率会被历史上一次性故障长期拉高，
// 只看比率无法区分「持续劣化」与「三年前抖过一次」，原始包数才是判断依据。
func writeInterfaceRatioPDFTable(pdf *gofpdf.Fpdf, result InspectionCheckResult) {
	detail := result.InterfaceRatio
	if detail == nil || (len(detail.Interfaces) == 0 && len(detail.Skipped) == 0) {
		return
	}

	pdf.Ln(4)
	ensurePDFSpace(pdf, 40)
	writePDFSubSectionTitle(pdf, fmt.Sprintf("%s - 逐接口明细（已评估 %d/%d，警告线 %s，故障线 %s）",
		result.CheckItemName, detail.Evaluated, detail.Total,
		formatDetailPercent(detail.WarningThreshold), formatDetailPercent(detail.CriticalThreshold)))

	if len(detail.Interfaces) > 0 {
		rows := make([][]string, 0, len(detail.Interfaces))
		for _, entry := range detail.Interfaces {
			rows = append(rows, []string{
				entry.Name,
				entry.Direction,
				formatDetailPercent(entry.Percent),
				fmt.Sprintf("%d", entry.Count),
				fmt.Sprintf("%d", entry.Packets),
			})
		}
		style := defaultPDFTableStyle(pdfHeaderStyleBlue)
		style.BodyAlign = "L"
		style.WrapColumns = []int{0}
		writePDFTable(pdf,
			[]string{"接口", "峰值方向", "比率", "计数", "包数"},
			rows, []float64{46, 20, 22, 27, 27.2}, style)
	}

	writeDetailSkippedPDFTable(pdf, "未评估接口", detail.Skipped)
}

// writeOpticalPowerPDFTable 为「光模块光功率」输出逐模块明细表。
//
// 电压与偏置电流一并列出，是为了区分光衰的两种成因：偏置电流升高而发光下降
// 指向激光器老化（换模块），否则指向链路侧衰耗（查光纤）。
func writeOpticalPowerPDFTable(pdf *gofpdf.Fpdf, result InspectionCheckResult) {
	detail := result.OpticalPower
	if detail == nil || (len(detail.Modules) == 0 && len(detail.Skipped) == 0) {
		return
	}

	pdf.Ln(4)
	ensurePDFSpace(pdf, 40)
	writePDFSubSectionTitle(pdf, fmt.Sprintf("%s - 逐模块明细（已评估 %d/%d，警告线 %sdBm，故障线 %sdBm）",
		result.CheckItemName, detail.Evaluated, detail.Total,
		formatFloat(detail.WarningThreshold, 1), formatFloat(detail.CriticalThreshold, 1)))

	if len(detail.Modules) > 0 {
		rows := make([][]string, 0, len(detail.Modules))
		for _, module := range detail.Modules {
			unit := module.RxPowerUnit
			if unit == "" {
				unit = "dBm"
			}
			rows = append(rows, []string{
				module.Index,
				localizeStatusWord(module.Verdict),
				formatFloat(module.RxPower, 1) + unit,
				formatOptionalFloat(module.TxPower, module.TxPowerUnit, 1),
				formatOptionalFloat(module.Voltage, module.VoltageUnit, 2),
				formatOptionalFloat(module.BiasCurrent, module.BiasCurrentUnit, 1),
			})
		}
		style := defaultPDFTableStyle(pdfHeaderStyleBlue)
		style.BodyAlign = "L"
		style.WrapColumns = []int{0}
		style.RowFills, style.RowAccents = checkResultRowTints(rows, 1)
		writePDFTable(pdf,
			[]string{"模块", "判定", "收光", "发光", "电压", "偏置电流"},
			rows, []float64{36, 16, 22, 22, 22, 24.2}, style)
	}

	writeDetailSkippedPDFTable(pdf, "未评估模块", detail.Skipped)
}

// writeBGPPeersPDFTable 为「BGP 邻居状态」输出逐邻居明细表。
func writeBGPPeersPDFTable(pdf *gofpdf.Fpdf, result InspectionCheckResult) {
	detail := result.BGPPeers
	if detail == nil || len(detail.Peers) == 0 {
		return
	}

	pdf.Ln(4)
	ensurePDFSpace(pdf, 40)
	writePDFSubSectionTitle(pdf, fmt.Sprintf("%s - 逐邻居明细（共 %d 个，已建立 %d，未建立 %d，近期重建 %d）",
		result.CheckItemName, detail.Total, detail.Established, detail.Down, detail.Flapping))

	rows := make([][]string, 0, len(detail.Peers))
	for _, peer := range detail.Peers {
		rows = append(rows, []string{
			peer.Index,
			localizeStatusWord(peer.Verdict),
			formatBGPPeerState(peer),
			fallbackPDFValue(formatSessionUptime(peer.EstablishedSeconds)),
			fallbackPDFValue(peer.LastError),
		})
	}
	style := defaultPDFTableStyle(pdfHeaderStyleBlue)
	style.BodyAlign = "L"
	style.WrapColumns = []int{0, 4}
	style.RowFills, style.RowAccents = checkResultRowTints(rows, 1)
	writePDFTable(pdf,
		[]string{"邻居", "判定", "会话状态", "建立时长", "最后错误"},
		rows, []float64{32, 16, 26, 28, 40.2}, style)

	if detail.FlappingThresholdSeconds > 0 {
		writePDFRightAligned(pdf, fmt.Sprintf("判定口径：建立时长低于 %s 视为近期重建",
			formatSessionUptime(&detail.FlappingThresholdSeconds)))
	}
}

// formatSessionUptime 把 *int64 秒数适配到 formatUptimeSeconds(*int)。
// BGP 的建立时长来自 SNMP Gauge32，采集端存为 int64；
// 名字不叫 formatDurationSeconds 是因为那个名字已被「执行时长」占用，
// 且那个函数只输出裸秒数，语义与「跑了 10 天」的会话时长不同。
func formatSessionUptime(value *int64) string {
	if value == nil {
		return ""
	}
	seconds := int(*value)
	return formatUptimeSeconds(&seconds)
}

// formatBGPPeerState 渲染邻居会话状态。
// 优先用厂商上报的状态标签；缺失时回落到原始状态码——码本身也是信息，
// 显示成空白等于把「设备报了个我们不认识的状态」这条事实抹掉。
func formatBGPPeerState(peer BGPPeerEntryReport) string {
	if label := strings.TrimSpace(peer.StateLabel); label != "" {
		return label
	}
	if peer.State != nil {
		return fmt.Sprintf("状态码 %d", *peer.State)
	}
	return pdfEmptyValuePlaceholder
}

// writeComponentStatusPDFTable 为「风扇 / 电源状态」输出逐部件明细表。
//
// 表尾附上本次生效的状态码集合：状态码语义因厂商甚至型号而异，
// 报告只说「码 77 未知」运维无从下手，给出判定依据才能据此校准模板配置。
func writeComponentStatusPDFTable(pdf *gofpdf.Fpdf, result InspectionCheckResult) {
	detail := result.ComponentStatus
	if detail == nil || len(detail.Components) == 0 {
		return
	}

	label := strings.TrimSpace(detail.Label)
	if label == "" {
		label = "部件"
	}

	pdf.Ln(4)
	ensurePDFSpace(pdf, 40)
	writePDFSubSectionTitle(pdf, fmt.Sprintf("%s - 逐%s明细（共 %d 个，正常 %d，异常 %d，状态码未知 %d）",
		result.CheckItemName, label, detail.Total, detail.Normal, detail.Abnormal, detail.Unknown))

	rows := make([][]string, 0, len(detail.Components))
	for _, component := range detail.Components {
		state := pdfEmptyValuePlaceholder
		if component.State != nil {
			state = fmt.Sprintf("%d", *component.State)
		}
		rows = append(rows, []string{component.Index, localizeStatusWord(component.Verdict), state})
	}
	style := defaultPDFTableStyle(pdfHeaderStyleBlue)
	style.BodyAlign = "L"
	style.WrapColumns = []int{0}
	style.RowFills, style.RowAccents = checkResultRowTints(rows, 1)
	writePDFTable(pdf, []string{"编号", "判定", "原始状态码"}, rows, []float64{50, 40, 52.2}, style)

	writePDFRightAligned(pdf, fmt.Sprintf("判定依据：正常状态码 %s，异常状态码 %s，其余不作判定",
		formatStateCodeSet(detail.NormalStates), formatStateCodeSet(detail.AbnormalStates)))
}

// formatStateCodeSet 把状态码集合渲染成 "1、2" 形式。
func formatStateCodeSet(codes []float64) string {
	if len(codes) == 0 {
		return "未配置"
	}
	parts := make([]string, 0, len(codes))
	for _, code := range codes {
		parts = append(parts, formatFloat(code, 0))
	}
	return strings.Join(parts, "、")
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

	headerBorder := style.HeaderBorder
	if headerBorder == "" {
		headerBorder = "1"
	}
	bodyBorder := style.BodyBorder
	if bodyBorder == "" {
		bodyBorder = "1"
	}
	// cellPadMM approximates gofpdf's built-in 1mm cell margin on both sides;
	// truncation targets the width actually available to glyphs.
	const cellPadMM = 2.2

	// renderHeader also runs after every manual page break so multi-page
	// tables repeat their column headers instead of continuing "naked".
	renderHeader := func() {
		pdf.SetDrawColor(style.BorderColor[0], style.BorderColor[1], style.BorderColor[2])
		pdf.SetFont(pdfFontName, style.Header.FontStyle, style.Header.FontSize)
		pdf.SetFillColor(style.Header.FillColor[0], style.Header.FillColor[1], style.Header.FillColor[2])
		pdf.SetTextColor(style.Header.TextColor[0], style.Header.TextColor[1], style.Header.TextColor[2])
		pdf.SetX(startX)
		for i, header := range headers {
			if i >= len(colWidths) {
				break
			}
			pdf.CellFormat(colWidths[i], style.HeaderHeight, truncatePDFText(pdf, header, colWidths[i]-cellPadMM), headerBorder, 0, style.Header.Align, true, 0, "")
		}
		pdf.Ln(-1)
		pdf.SetFont(pdfFontName, "", style.BodyFontSize)
		pdf.SetTextColor(style.BodyTextColor[0], style.BodyTextColor[1], style.BodyTextColor[2])
	}
	renderHeader()

	wrapSet := make(map[int]bool, len(style.WrapColumns))
	for _, idx := range style.WrapColumns {
		wrapSet[idx] = true
	}

	_, pageH := pdf.GetPageSize()
	breakLimit := pageH - pdfBottomMM
	for rowIndex, row := range rows {
		// 先按列拆行并计算本行动态行高：换行列按列宽 SplitText 展开
		// （封顶 pdfMaxWrapLines 行，超出末行加省略号），普通列单行截断。
		cellLines := make([][]string, len(headers))
		maxLines := 1
		for i := range headers {
			if i >= len(colWidths) {
				break
			}
			value := ""
			if i < len(row) {
				value = row[i]
			}
			value = sanitizePDFCellText(value)
			textWidth := colWidths[i] - cellPadMM
			if wrapSet[i] {
				split := splitPDFTextLines(pdf, value, textWidth)
				if len(split) > pdfMaxWrapLines {
					last := split[pdfMaxWrapLines-1]
					split = split[:pdfMaxWrapLines]
					split[pdfMaxWrapLines-1] = truncatePDFText(pdf, last+"…", textWidth)
				}
				cellLines[i] = split
				if len(split) > maxLines {
					maxLines = len(split)
				}
			} else {
				cellLines[i] = []string{truncatePDFText(pdf, value, textWidth)}
			}
		}
		rowH := float64(maxLines) * style.BodyHeight

		// 手动分页：整行放不下就先换页并重绘表头。否则 gofpdf 的自动分页
		// 会在绘制某个单元格时才触发，导致新页丢表头、居中表格的行首
		// 退回左边距，产生错位。
		if pdf.GetY()+rowH > breakLimit {
			addPDFPage(pdf)
			renderHeader()
		}
		rowY := pdf.GetY()
		fill := style.BodyFillColor
		if rowIndex%2 == 1 && !isZeroColor(style.AlternateFillColor) {
			fill = style.AlternateFillColor
		}
		if tint, ok := rowTint(style.RowFills, rowIndex); ok {
			fill = tint
		}
		pdf.SetFillColor(fill[0], fill[1], fill[2])
		x := startX
		for i := range headers {
			if i >= len(colWidths) {
				break
			}
			// 先画整格底色+边框（空文本），再在格内逐行写字；单行内容在
			// 多行高度的行里垂直居中。
			pdf.SetXY(x, rowY)
			pdf.CellFormat(colWidths[i], rowH, "", bodyBorder, 0, "", true, 0, "")
			offsetY := (rowH - float64(len(cellLines[i]))*style.BodyHeight) / 2
			for li, line := range cellLines[i] {
				pdf.SetXY(x, rowY+offsetY+float64(li)*style.BodyHeight)
				pdf.CellFormat(colWidths[i], style.BodyHeight, line, "", 0, style.BodyAlign, false, 0, "")
			}
			x += colWidths[i]
		}
		// 色条最后画，压在左侧单元格边框上，形成实心强调条。
		if accent, ok := rowTint(style.RowAccents, rowIndex); ok {
			pdf.SetFillColor(accent[0], accent[1], accent[2])
			pdf.Rect(startX, rowY, 1.5, rowH, "F")
		}
		pdf.SetY(rowY + rowH)
	}
	pdf.SetTextColor(0, 0, 0)
	pdf.SetFont(pdfFontName, "", pdfBodySize)
}

// sanitizePDFCellText flattens control characters for single-line table
// cells: CellFormat renders "\n" as a glyphless box instead of breaking the
// line, so multi-line check outputs collapse to "line1 line2 …" here.
func sanitizePDFCellText(value string) string {
	if !strings.ContainsAny(value, "\r\n\t") {
		return value
	}
	replacer := strings.NewReplacer("\r\n", " ", "\r", " ", "\n", " ", "\t", " ")
	return strings.Join(strings.Fields(replacer.Replace(value)), " ")
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
// 异常与告警聚合 —— 把跨设备的非通过检查项收敛成一张前置清单。
//
// 旧版报告只给出「通过 7 / 警告 1 / 失败 1」的计数，具体哪台设备的哪一项
// 出了问题，读者必须翻到后面逐台设备的检查明细表里、在斑马纹里用肉眼找
// 状态列。设备一多就完全不可读。这里在「统计摘要」之后立刻输出一张按
// 严重度排序的异常清单，并给异常行上语义底色 + 左侧色条。
// =========================================================================

// inspectionIssueSeverity 描述一条非通过检查项的严重度及其配色。
type inspectionIssueSeverity struct {
	Label  string
	Rank   int    // 排序权重，越小越靠前
	Accent [3]int // 左侧色条 / 级别文字
	Tint   [3]int // 行底色
}

// classifyInspectionStatus 把检查项状态映射到严重度。返回 ok=false 表示
// 该状态不算异常（通过 / 跳过），不进入告警清单。
//
// 状态词汇统一走 normalizeCheckStatus，与统计摘要的分类口径同源——两处
// 各自 switch 是「摘要说 1 个告警、设备说 2 个问题」的老病根。
func classifyInspectionStatus(status string) (inspectionIssueSeverity, bool) {
	switch normalizeCheckStatus(status) {
	case checkStatusError:
		return inspectionIssueSeverity{Label: "错误", Rank: 0, Accent: pdfkit.ColorRose600, Tint: pdfkit.ColorRose100}, true
	case checkStatusFailed:
		return inspectionIssueSeverity{Label: "失败", Rank: 1, Accent: pdfkit.ColorDanger, Tint: pdfkit.ColorRose100}, true
	case checkStatusWarning:
		return inspectionIssueSeverity{Label: "警告", Rank: 2, Accent: pdfkit.ColorWarning, Tint: pdfkit.ColorAmber100}, true
	case checkStatusUnknown:
		// 状态词无法识别时不静默丢弃：显式列为「未知」交人工判读。
		return inspectionIssueSeverity{Label: "未知", Rank: 3, Accent: pdfkit.ColorSlate500, Tint: pdfkit.ColorSlate100}, true
	default:
		return inspectionIssueSeverity{}, false
	}
}

// inspectionIssue 是异常清单里的一行。
type inspectionIssue struct {
	Severity   inspectionIssueSeverity
	DeviceName string
	IPAddress  string
	CheckName  string
	CheckType  string
	Expected   string
	Actual     string
}

// pdfMaxIssueRows 限制异常清单长度，避免极端场景下清单本身淹没报告；
// 超出部分在末行注明，完整数据仍在后面的逐设备明细里。
const pdfMaxIssueRows = 30

// collectInspectionIssues 扫描全部设备的检查结果，按严重度稳定排序。
// 同严重度内保持原始设备 / 检查项顺序，便于与后面的明细表对照。
func collectInspectionIssues(data InspectionReportData) []inspectionIssue {
	issues := make([]inspectionIssue, 0)
	for _, device := range data.Devices {
		for _, result := range device.CheckResults {
			severity, ok := classifyInspectionStatus(result.Status)
			if !ok {
				continue
			}
			issues = append(issues, inspectionIssue{
				Severity:   severity,
				DeviceName: fallbackPDFValue(device.DeviceName),
				IPAddress:  fallbackPDFValue(device.IPAddress),
				CheckName:  fallbackPDFValue(result.CheckItemName),
				CheckType:  strings.TrimSpace(result.CheckItemType),
				Expected:   fallbackPDFValue(result.ExpectedValue),
				Actual:     fallbackPDFValue(result.ActualValue),
			})
		}
	}
	sort.SliceStable(issues, func(i, j int) bool {
		return issues[i].Severity.Rank < issues[j].Severity.Rank
	})
	return issues
}

// writePDFCallout 绘制一条带左色条的提示横幅，用于「无异常」这类需要
// 明确正向结论、又不该长成一张空表的场景。
func writePDFCallout(pdf *gofpdf.Fpdf, title, hint string, accent, tint [3]int) {
	pageW, _ := pdf.GetPageSize()
	left, _, right, _ := pdf.GetMargins()
	width := pageW - left - right
	height := 15.0
	y := pdf.GetY()

	pdf.SetFillColor(tint[0], tint[1], tint[2])
	pdf.Rect(left, y, width, height, "F")
	pdf.SetFillColor(accent[0], accent[1], accent[2])
	pdf.Rect(left, y, 1.8, height, "F")

	pdf.SetXY(left+6, y+2.6)
	pdf.SetFont(pdfFontName, "B", pdfBodySize)
	pdf.SetTextColor(accent[0], accent[1], accent[2])
	pdf.CellFormat(width-8, 5.4, title, "", 1, "L", false, 0, "")
	if strings.TrimSpace(hint) != "" {
		pdf.SetXY(left+6, y+8.2)
		pdf.SetFont(pdfFontName, "", pdfSmallSize)
		pdf.SetTextColor(pdfColorMuted[0], pdfColorMuted[1], pdfColorMuted[2])
		pdf.CellFormat(width-8, 5, hint, "", 1, "L", false, 0, "")
	}
	pdf.SetTextColor(0, 0, 0)
	pdf.SetFont(pdfFontName, "", pdfBodySize)
	pdf.SetY(y + height + 3)
}

// writeInspectionIssueSection 输出「异常与告警」章节。无异常时给出绿色
// 结论横幅，而不是留白或空表。
func writeInspectionIssueSection(pdf *gofpdf.Fpdf, issues []inspectionIssue) {
	ensurePDFSpace(pdf, 46)
	writePDFSectionTitle(pdf, "异常与告警")

	if len(issues) == 0 {
		writePDFCallout(pdf, "本次巡检未发现异常项",
			"全部检查项均处于通过状态，无需人工介入。",
			pdfkit.ColorSuccess, pdfkit.ColorEmerald50)
		return
	}

	rows := make([][]string, 0, len(issues))
	fills := make([][3]int, 0, len(issues))
	accents := make([][3]int, 0, len(issues))
	for idx, issue := range issues {
		if idx >= pdfMaxIssueRows {
			rows = append(rows, []string{"已截断", "-", fmt.Sprintf("仅展示前%d条异常项，完整结果见下方逐设备明细", pdfMaxIssueRows), "", ""})
			fills = append(fills, pdfColorPaper)
			accents = append(accents, pdfColorGrey)
			break
		}
		rows = append(rows, []string{
			issue.Severity.Label,
			issue.DeviceName,
			issue.CheckName,
			issue.Expected,
			issue.Actual,
		})
		fills = append(fills, issue.Severity.Tint)
		accents = append(accents, issue.Severity.Accent)
	}

	style := defaultPDFTableStyle(pdfHeaderStyleBlue)
	style.BodyAlign = "L"
	style.AlternateFillColor = [3]int{}
	style.WrapColumns = []int{2, 3, 4}
	style.RowFills = fills
	style.RowAccents = accents
	writePDFTable(pdf,
		[]string{"级别", "设备", "检查项", "参考标准", "实际值"},
		rows, []float64{14, 30, 32, 30, 36.2}, style)
	pdf.Ln(3)
	writePDFRightAlignedColored(pdf,
		fmt.Sprintf("共 %d 项需关注，按严重度排序（错误 > 失败 > 警告）", len(issues)),
		pdfColorMuted)
}

// inspectionIssueChip 生成 Hero 横幅上的异常计数 chip。全部通过时给出
// 正向文案，读者在封面就能拿到结论。
func inspectionIssueChip(stats InspectionSummaryStats) string {
	if abnormal := stats.AbnormalChecks(); abnormal > 0 {
		return fmt.Sprintf("待处理 %d 项", abnormal)
	}
	return "无异常项"
}

// checkResultRowTints 为逐设备检查结果表生成按状态的底色 / 色条，让异常
// 行在明细里同样一眼可见。statusIndex 是状态列在行数据中的下标。
func checkResultRowTints(rows [][]string, statusIndex int) (fills [][3]int, accents [][3]int) {
	fills = make([][3]int, len(rows))
	accents = make([][3]int, len(rows))
	for i, row := range rows {
		if statusIndex >= len(row) {
			continue
		}
		severity, ok := classifyInspectionStatusLabel(row[statusIndex])
		if !ok {
			continue
		}
		fills[i] = severity.Tint
		accents[i] = severity.Accent
	}
	return fills, accents
}

// classifyInspectionStatusLabel 接受已本地化的中文状态词（明细表里存的
// 是 localizeStatusWord 的输出），映射回严重度。必须显式列出「通过 /
// 跳过」并返回 false——否则它们会掉进 normalizeCheckStatus 的 unknown
// 分支，通过行被误染成灰色异常行。
func classifyInspectionStatusLabel(label string) (inspectionIssueSeverity, bool) {
	switch strings.TrimSpace(label) {
	case "错误":
		return classifyInspectionStatus(checkStatusError)
	case "失败", "超时":
		return classifyInspectionStatus(checkStatusFailed)
	case "警告":
		return classifyInspectionStatus(checkStatusWarning)
	case "未知":
		return classifyInspectionStatus(checkStatusUnknown)
	case "通过", "跳过", "不适用", "":
		return inspectionIssueSeverity{}, false
	default:
		return classifyInspectionStatus(label)
	}
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

// =========================================================================
// 统计口径展示 + 结论与修复方案
// =========================================================================

// buildInspectionSummaryCards 生成统计摘要卡片。基础四张（总检查项 /
// 通过 / 警告 / 失败）恒定展示，「错误 / 跳过 / 未知」仅在计数大于 0 时
// 追加——旧版固定四张卡装不下第五类状态，那一项就从算式里凭空消失了。
func buildInspectionSummaryCards(stats InspectionSummaryStats) []pdfkit.StatCard {
	cards := []pdfkit.StatCard{
		{Label: "总检查项", Value: fmt.Sprintf("%d", stats.TotalChecks), Color: pdfkit.ColorPrimary},
		{Label: "通过", Value: fmt.Sprintf("%d", stats.PassedChecks), Color: pdfkit.ColorSuccess},
		{Label: "警告", Value: fmt.Sprintf("%d", stats.WarningChecks), Color: pdfkit.ColorWarning},
		{Label: "失败", Value: fmt.Sprintf("%d", stats.FailedChecks), Color: pdfkit.ColorDanger},
	}
	if stats.ErrorChecks > 0 {
		cards = append(cards, pdfkit.StatCard{Label: "错误", Value: fmt.Sprintf("%d", stats.ErrorChecks), Color: pdfkit.ColorRose600})
	}
	if stats.SkippedChecks > 0 {
		cards = append(cards, pdfkit.StatCard{Label: "跳过", Value: fmt.Sprintf("%d", stats.SkippedChecks), Color: pdfkit.ColorSlate500})
	}
	// 不适用与跳过分卡展示：前者是设备天然没这个特性（无需处理），
	// 后者是该查却没查成（要跟进），合成一张卡会让运维分不清要不要动手。
	if stats.NotApplicableChecks > 0 {
		cards = append(cards, pdfkit.StatCard{Label: "不适用", Value: fmt.Sprintf("%d", stats.NotApplicableChecks), Color: pdfkit.ColorSlate400})
	}
	if stats.UnknownChecks > 0 {
		cards = append(cards, pdfkit.StatCard{Label: "未知", Value: fmt.Sprintf("%d", stats.UnknownChecks), Color: pdfkit.ColorSlate600})
	}
	return cards
}

// describeInspectionTally 把「总数 = 各分项之和」的算式直接写成一行文字。
// 有了这行，读者不需要自己做减法去猜差额跑哪去了；口径一旦再次失衡，
// 算式会当场露出来，而不是悄悄留下一个互相矛盾的数字。
func describeInspectionTally(stats InspectionSummaryStats) string {
	parts := make([]string, 0, 6)
	appendPart := func(label string, count int) {
		if count > 0 {
			parts = append(parts, fmt.Sprintf("%s %d", label, count))
		}
	}
	appendPart("通过", stats.PassedChecks)
	appendPart("警告", stats.WarningChecks)
	appendPart("失败", stats.FailedChecks)
	appendPart("错误", stats.ErrorChecks)
	appendPart("跳过", stats.SkippedChecks)
	appendPart("不适用", stats.NotApplicableChecks)
	appendPart("未知", stats.UnknownChecks)
	if len(parts) == 0 {
		return "暂无检查项数据"
	}
	tally := fmt.Sprintf("口径：总检查项 %d = %s", stats.TotalChecks, strings.Join(parts, " + "))
	// 跳过与不适用都不进通过率分母，但成因不同，分别说明才好让运维知道
	// 哪些需要跟进（跳过要查凭据与 MIB 支持度，不适用什么都不用做）。
	excluded := make([]string, 0, 2)
	if stats.SkippedChecks > 0 {
		excluded = append(excluded, fmt.Sprintf("跳过 %d 项", stats.SkippedChecks))
	}
	if stats.NotApplicableChecks > 0 {
		excluded = append(excluded, fmt.Sprintf("设备不适用 %d 项", stats.NotApplicableChecks))
	}
	if len(excluded) > 0 {
		tally += fmt.Sprintf("；通过率分母已剔除%s（按 %d 项计）",
			strings.Join(excluded, "与"),
			stats.TotalChecks-stats.SkippedChecks-stats.NotApplicableChecks)
	}
	return tally
}

// inspectionHealthGrade 依据通过率与异常构成给出整体结论等级。存在
// 失败 / 错误时直接压到「需处理」，不让高通过率掩盖硬故障。
func inspectionHealthGrade(stats InspectionSummaryStats) (grade string, accent [3]int, tint [3]int) {
	switch {
	case stats.FailedChecks > 0 || stats.ErrorChecks > 0:
		return "需处理", pdfkit.ColorDanger, pdfkit.ColorRose100
	case stats.WarningChecks > 0 || stats.UnknownChecks > 0:
		return "需关注", pdfkit.ColorWarning, pdfkit.ColorAmber100
	case stats.TotalChecks > 0:
		return "健康", pdfkit.ColorSuccess, pdfkit.ColorEmerald50
	default:
		return "无数据", pdfkit.ColorSlate500, pdfkit.ColorSurfaceMuted
	}
}

// buildInspectionNarrative 生成「巡检情况说明」正文：覆盖范围、通过情况、
// 异常构成、最需优先处理的对象。全部由实际统计驱动，不写死话术。
func buildInspectionNarrative(data InspectionReportData) []string {
	stats := data.SummaryStats
	lines := make([]string, 0, 5)

	lines = append(lines, fmt.Sprintf(
		"本次巡检覆盖 %d 台设备、%d 个检查项，通过 %d 项，通过率 %s。",
		len(data.Devices), stats.TotalChecks, stats.PassedChecks, formatPercent(stats.PassRate, 1)))

	if abnormal := stats.AbnormalChecks(); abnormal == 0 {
		lines = append(lines, "全部检查项均达到参考标准，未发现需要人工介入的异常。")
	} else {
		lines = append(lines, fmt.Sprintf(
			"共发现 %d 项需关注（%s），逐项定位见「异常与告警」章节。",
			abnormal, describeAbnormalBreakdown(stats)))
	}

	// 点名问题最集中的设备：多设备巡检时这句决定运维先去看哪一台。
	if worst := worstInspectionDevice(data.Devices); worst != nil && worst.IssueCount > 0 {
		lines = append(lines, fmt.Sprintf(
			"问题最集中的设备为 %s（%s），存在 %d 项异常，建议优先排查。",
			fallbackPDFValue(worst.DeviceName), fallbackPDFValue(worst.IPAddress), worst.IssueCount))
	}

	if stats.SkippedChecks > 0 {
		lines = append(lines, fmt.Sprintf(
			"另有 %d 项检查被跳过（未执行），不计入通过率；如需完整覆盖，请核对巡检模板与设备凭据配置。",
			stats.SkippedChecks))
	}
	if stats.UnknownChecks > 0 {
		lines = append(lines, fmt.Sprintf(
			"有 %d 项检查返回了无法识别的状态，已在异常清单中标记为「未知」，需人工判读原始采集结果。",
			stats.UnknownChecks))
	}
	return lines
}

// describeAbnormalBreakdown 描述异常构成，如「错误 1 项、警告 1 项」。
func describeAbnormalBreakdown(stats InspectionSummaryStats) string {
	parts := make([]string, 0, 4)
	if stats.ErrorChecks > 0 {
		parts = append(parts, fmt.Sprintf("错误 %d 项", stats.ErrorChecks))
	}
	if stats.FailedChecks > 0 {
		parts = append(parts, fmt.Sprintf("失败 %d 项", stats.FailedChecks))
	}
	if stats.WarningChecks > 0 {
		parts = append(parts, fmt.Sprintf("警告 %d 项", stats.WarningChecks))
	}
	if stats.UnknownChecks > 0 {
		parts = append(parts, fmt.Sprintf("未知 %d 项", stats.UnknownChecks))
	}
	if len(parts) == 0 {
		return "无"
	}
	return strings.Join(parts, "、")
}

// worstInspectionDevice 返回异常项最多的设备；并列时取第一台，保持与
// 设备概览表的顺序一致。
func worstInspectionDevice(devices []InspectionDeviceData) *InspectionDeviceData {
	var worst *InspectionDeviceData
	for i := range devices {
		if worst == nil || devices[i].IssueCount > worst.IssueCount {
			worst = &devices[i]
		}
	}
	return worst
}

// inspectionRemediation 按检查项名称 / 类型给出处置建议。匹配走关键词
// 而非精确等值：巡检模板里的检查项名称由用户自定义（「CPU使用率」
// 「CPU利用率检查」都可能出现），精确匹配几乎必然落空。
func inspectionRemediation(checkName, checkType string) string {
	key := strings.ToLower(checkName + " " + checkType)
	contains := func(words ...string) bool {
		for _, w := range words {
			if strings.Contains(key, w) {
				return true
			}
		}
		return false
	}

	switch {
	case contains("cpu"):
		return "查看设备 CPU 占用明细，定位高占用进程；排查广播风暴、路由震荡或异常流量，必要时拆分业务或评估硬件升级。"
	case contains("内存", "memory", "mem"):
		return "查看内存占用分布，清理无用配置与日志缓存；确认是否存在内存泄漏，长期偏高需评估扩容或版本升级。"
	case contains("温度", "temperature", "temp"):
		return "立即检查机房空调、设备进出风口是否积尘堵塞、风扇是否正常运转；持续超阈值有硬件损坏风险，应尽快现场处理。"
	case contains("风扇", "fan"):
		return "确认风扇模块运行状态与告警指示；单风扇故障应尽快更换备件，避免散热余量不足引发连锁高温。"
	case contains("电源", "power", "psu"):
		return "核查双电源冗余是否失效、市电与 PDU 供电是否正常；单电源运行状态下须尽快恢复冗余。"
	case contains("连通", "ping", "icmp", "可达"):
		return "确认设备电源与上联链路状态，检查中间链路 ACL / 防火墙策略与路由是否变更；持续不可达需现场确认设备是否宕机。"
	case contains("利用率", "带宽", "utilization", "bandwidth"):
		return "查看「逐接口明细」定位高负载接口；评估链路扩容、启用链路聚合或调整流量调度策略，并核实是否存在异常大流量。"
	case contains("接口", "端口", "interface", "port"):
		return "核对 down 端口与错包计数，检查光模块、跳线与对端配置，排除物理层故障。"
	case contains("丢包", "误码", "crc"):
		return "重点排查物理链路质量：更换光模块或跳线，核对双工与速率协商，必要时联系线路提供商检测。"
	case contains("运行时长", "uptime", "重启", "reboot"):
		return "运行时长过短说明设备近期重启，需查看日志确认是否为异常掉电、看门狗复位或版本升级，排除非计划重启。"
	case contains("配置", "config"):
		return "对比当前配置与基线，确认变更是否经过审批；及时执行配置保存与备份，防止掉电丢失。"
	case contains("版本", "version", "firmware"):
		return "核对当前版本是否在厂商推荐版本列表内，评估已知缺陷与安全公告，规划窗口期升级。"
	case contains("日志", "log", "syslog"):
		return "检查日志服务器可达性与日志级别配置，确认关键告警未被过滤丢弃。"
	case contains("snmp"):
		return "核对 SNMP 团体名或 v3 凭据、ACL 放通与 MIB 支持情况；采集失败会导致后续指标类检查连带失效。"
	case contains("ssh", "telnet", "登录", "凭据", "认证"):
		return "核对设备登录凭据与远程管理服务状态，确认账号未过期、未被锁定，且源地址在放通范围内。"
	default:
		return "对照「参考标准」与「实际值」的差距定位偏差原因，结合设备日志排查；若为阈值设置不合理，可在巡检模板中调整该检查项阈值。"
	}
}

// writeInspectionConclusion 在报告结尾输出「巡检情况说明」与「修复方案」。
// 前者是给管理者看的结论段落，后者是给运维执行的动作清单——同一份数据的
// 两种读法。缺了这一段，报告只能停留在「看到了问题」而不是「知道怎么办」。
func writeInspectionConclusion(pdf *gofpdf.Fpdf, data InspectionReportData) {
	ensurePDFSpace(pdf, 60)
	writePDFSectionTitle(pdf, "巡检情况说明")

	grade, accent, tint := inspectionHealthGrade(data.SummaryStats)
	writePDFCallout(pdf, fmt.Sprintf("整体结论：%s", grade),
		fmt.Sprintf("通过率 %s · 需关注 %d 项 · 覆盖设备 %d 台",
			formatPercent(data.SummaryStats.PassRate, 1),
			data.SummaryStats.AbnormalChecks(),
			len(data.Devices)),
		accent, tint)

	pdf.SetFont(pdfFontName, "", pdfSmallSize)
	pdf.SetTextColor(pdfColorText[0], pdfColorText[1], pdfColorText[2])
	pageW, _ := pdf.GetPageSize()
	left, _, right, _ := pdf.GetMargins()
	// 不能用 pdf.MultiCell：gofpdf 的内置断行逐字节遍历（为 cp1252 设计），
	// 会在多字节 UTF-8 序列中间断开并吞掉一个汉字。改走本文件按 rune 累加
	// 宽度的 splitPDFTextLines，与表格换行列共用同一套断行实现。
	textW := pageW - left - right - 4
	for _, line := range buildInspectionNarrative(data) {
		for i, seg := range splitPDFTextLines(pdf, line, textW) {
			ensurePDFSpace(pdf, 12)
			prefix := "· "
			indent := 0.0
			if i > 0 {
				prefix = ""
				indent = 3.4 // 续行缩进对齐首行文字，视觉上仍是同一条
			}
			pdf.SetX(left + indent)
			pdf.CellFormat(0, 5.6, prefix+seg, "", 1, "L", false, 0, "")
		}
		pdf.Ln(1.4)
	}
	pdf.SetTextColor(0, 0, 0)
	pdf.SetFont(pdfFontName, "", pdfBodySize)
	pdf.Ln(4)

	ensurePDFSpace(pdf, 50)
	writePDFSectionTitle(pdf, "修复方案")
	issues := collectInspectionIssues(data)
	if len(issues) == 0 {
		writePDFCallout(pdf, "无待处理事项",
			"本次巡检未发现异常项，建议维持现有巡检周期，持续观察趋势变化。",
			pdfkit.ColorSuccess, pdfkit.ColorEmerald50)
		return
	}

	// 同一「设备 + 检查项」只出一条建议，避免重复条目刷屏。
	rows := make([][]string, 0, len(issues))
	fills := make([][3]int, 0, len(issues))
	accents := make([][3]int, 0, len(issues))
	seen := make(map[string]struct{}, len(issues))
	for _, issue := range issues {
		key := issue.DeviceName + "|" + issue.CheckName
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		rows = append(rows, []string{
			issue.Severity.Label,
			fmt.Sprintf("%s / %s", issue.DeviceName, issue.CheckName),
			fmt.Sprintf("实际 %s（标准 %s）", issue.Actual, issue.Expected),
			inspectionRemediation(issue.CheckName, issue.CheckType),
		})
		fills = append(fills, issue.Severity.Tint)
		accents = append(accents, issue.Severity.Accent)
	}

	style := defaultPDFTableStyle(pdfHeaderStyleBlue)
	style.BodyAlign = "L"
	style.AlternateFillColor = [3]int{}
	style.WrapColumns = []int{1, 2, 3}
	style.RowFills = fills
	style.RowAccents = accents
	writePDFTable(pdf,
		[]string{"级别", "对象", "现状", "建议措施"},
		rows, []float64{14, 34, 34, 60.2}, style)

	pdf.Ln(3)
	writePDFRightAlignedColored(pdf,
		"以上建议为通用处置方向，实际操作请结合现场环境与厂商文档执行。",
		pdfColorMuted)
}
