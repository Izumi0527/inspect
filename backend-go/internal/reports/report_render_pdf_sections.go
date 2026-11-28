package reports

import (
	"fmt"
	"strings"

	"github.com/phpdave11/gofpdf"

	"github.com/your-org/inspect-system/backend-go/internal/reports/pdfkit"
)

// writeInspectionMetadataTable 在「基本信息」4 张卡片下方渲染紧凑元数据表。
func writeInspectionMetadataTable(pdf *gofpdf.Fpdf, data InspectionReportData, generatedAt string) {
	templateText := strings.TrimSpace(data.TemplateName)
	if templateText == "" {
		if data.TemplateCount > 1 {
			templateText = fmt.Sprintf("跨模板（%d 种）", data.TemplateCount)
		} else {
			templateText = "未记录"
		}
	}
	coverageText := pdfEmptyValuePlaceholder
	if len(data.CoveredMetrics) > 0 {
		coverageText = fmt.Sprintf("%d 项", len(data.CoveredMetrics))
	}

	rows := [][]string{
		{"巡检模板", templateText, "生成人", fallbackPDFValue(data.GeneratedBy)},
		{"报告生成时间", fallbackPDFValue(generatedAt), "覆盖维度", coverageText},
	}
	style := defaultPDFTableStyle(pdfHeaderStyleLight)
	style.TableAlign = "L"
	style.BodyAlign = "L"
	style.HeaderHeight = 7
	style.BodyHeight = 6.5
	style.WrapColumns = []int{1, 3}
	pdfkit.GridTable(pdf, []string{"项目", "内容", "项目", "内容"}, rows, []float64{26, 61, 26, 61}, style)
}

// writeInspectionCategoryStatsSection 在「统计摘要」下渲染四大运维域健康度汇总表。
func writeInspectionCategoryStatsSection(pdf *gofpdf.Fpdf, stats []InspectionCategoryStat) {
	if len(stats) == 0 {
		return
	}
	pdf.Ln(3)
	ensurePDFSpace(pdf, 38)
	writePDFSubSectionTitle(pdf, "巡检维度分类健康度汇总")

	rows := make([][]string, 0, len(stats))
	for _, stat := range stats {
		rows = append(rows, []string{
			stat.Category,
			fmt.Sprintf("%d", stat.Total),
			fmt.Sprintf("%d", stat.Passed),
			fmt.Sprintf("%d", stat.Warning),
			fmt.Sprintf("%d", stat.Failed),
			fmt.Sprintf("%d", stat.Skipped),
			formatPercent(stat.PassRate, 1),
		})
	}
	style := defaultPDFTableStyle(pdfHeaderStyleBlue)
	style.BodyAlign = "C"
	style.WrapColumns = []int{0}
	pdfkit.GridTable(
		pdf,
		[]string{"巡检维度分类", "总项数", "通过", "警告", "失败/错误", "跳过/不适用", "分类通过率"},
		rows,
		[]float64{38, 18, 18, 18, 26, 28, 28},
		style,
	)
}

// formatCheckResultActualWithMessage 融合实测值与诊断说明，避免异常列表只见「-」。
func formatCheckResultActualWithMessage(result InspectionCheckResult, includeMessage bool) string {
	actual := strings.TrimSpace(result.ActualValue)
	msg := strings.TrimSpace(result.Message)
	if actual == "" {
		if msg != "" {
			return msg
		}
		return pdfEmptyValuePlaceholder
	}
	if includeMessage && msg != "" && msg != actual && !strings.Contains(actual, msg) {
		return fmt.Sprintf("%s（%s）", actual, msg)
	}
	return actual
}

// writeInspectionDeviceOverviewTable 渲染带核心指标速览的设备概览总表。
func writeInspectionDeviceOverviewTable(pdf *gofpdf.Fpdf, devices []InspectionDeviceData) {
	overviewRows := make([][]string, 0, len(devices))
	overviewFills := make([][3]int, 0, len(devices))
	overviewAccents := make([][3]int, 0, len(devices))
	for _, device := range devices {
		overviewRows = append(overviewRows, []string{
			fallbackPDFValue(device.DeviceName),
			fallbackPDFValue(device.IPAddress),
			formatDeviceTypeAndModel(device),
			fallbackPDFValue(localizeStatusWord(device.InspectionStatus)),
			formatPercent(device.PassRate, 1),
			fmt.Sprintf("%d", device.IssueCount),
			summarizeDeviceCoreMetrics(device),
		})
		fill, accent := [3]int{}, [3]int{}
		if device.IssueCount > 0 {
			fill, accent = pdfkit.ColorRose100, pdfkit.ColorDanger
		}
		overviewFills = append(overviewFills, fill)
		overviewAccents = append(overviewAccents, accent)
	}
	style := defaultPDFTableStyle(pdfHeaderStyleBlue)
	style.BodyAlign = "L"
	style.WrapColumns = []int{0, 2, 6}
	style.RowFills = overviewFills
	style.RowAccents = overviewAccents
	pdfkit.GridTable(
		pdf,
		[]string{"设备名称", "IP地址", "类型 / 型号", "状态", "通过率", "问题", "实测核心指标速览"},
		overviewRows,
		[]float64{30, 25, 28, 14, 16, 12, 49},
		style,
	)
}

func formatDeviceTypeAndModel(device InspectionDeviceData) string {
	devType := strings.TrimSpace(localizeDeviceType(device.DeviceType))
	model := strings.TrimSpace(device.Model)
	switch {
	case devType != "" && model != "" && devType == model:
		return devType
	case devType != "" && model != "":
		return fmt.Sprintf("%s / %s", devType, model)
	case devType != "":
		return devType
	case model != "":
		return model
	default:
		return pdfEmptyValuePlaceholder
	}
}

func summarizeDeviceCoreMetrics(device InspectionDeviceData) string {
	parts := make([]string, 0, 3)
	seen := make(map[string]bool, 3)
	for _, item := range device.CheckResults {
		label := matchCoreMetricLabel(item)
		if label == "" || seen[label] {
			continue
		}
		status := normalizeCheckStatus(item.Status)
		if status == checkStatusSkipped || status == checkStatusNotApplicable {
			continue
		}
		actual := strings.TrimSpace(item.ActualValue)
		if actual == "" {
			continue
		}
		seen[label] = true
		parts = append(parts, formatCoreMetricPart(label, actual))
	}
	if len(parts) == 0 {
		return pdfEmptyValuePlaceholder
	}
	return strings.Join(parts, " · ")
}

func matchCoreMetricLabel(item InspectionCheckResult) string {
	if item.Threshold != nil {
		switch strings.ToLower(strings.TrimSpace(item.Threshold.Metric)) {
		case "cpu":
			return "CPU"
		case "memory":
			return "内存"
		case "temperature":
			return "温度"
		}
	}
	name := strings.ToLower(strings.TrimSpace(item.CheckItemName))
	switch {
	case strings.Contains(name, "cpu"):
		return "CPU"
	case strings.Contains(name, "内存") || strings.Contains(name, "memory"):
		return "内存"
	case strings.Contains(name, "温度") || strings.Contains(name, "temperature"):
		return "温度"
	default:
		return ""
	}
}

func formatCoreMetricPart(label, actual string) string {
	if strings.Contains(strings.ToLower(actual), strings.ToLower(label)) {
		return actual
	}
	return label + " " + actual
}

// writeInspectionDeviceProfileAndChecks 渲染单设备 6×4 档案矩阵与 6 列检查结果总表。
func writeInspectionDeviceProfileAndChecks(pdf *gofpdf.Fpdf, device InspectionDeviceData) {
	deviceRows := [][]string{
		{"设备名称", fallbackPDFValue(device.DeviceName), "IP地址", fallbackPDFValue(device.IPAddress)},
		{"设备类型", fallbackPDFValue(localizeDeviceType(device.DeviceType)), "厂商", fallbackPDFValue(localizeVendor(device.Vendor))},
		{"设备型号", fallbackPDFValue(device.Model), "序列号(ESN)", fallbackPDFValue(device.SerialNumber)},
		{"软件版本", fallbackPDFValue(device.SoftwareVersion), "补丁版本", fallbackPDFValue(resolveDevicePatchVersion(device))},
		{"安装位置", fallbackPDFValue(device.Location), "运行时长", fallbackPDFValue(device.Uptime)},
		{"巡检状态", fallbackPDFValue(localizeStatusWord(device.InspectionStatus)), "通过率 / 问题", fmt.Sprintf("%s / %d 项", formatPercent(device.PassRate, 1), device.IssueCount)},
	}
	deviceStyle := defaultPDFTableStyle(pdfHeaderStyleLight)
	deviceStyle.TableAlign = "L"
	deviceStyle.BodyAlign = "L"
	deviceStyle.BodyHeight = 6.5
	deviceStyle.WrapColumns = []int{1, 3}
	pdfkit.GridTable(pdf, []string{"属性", "值", "属性", "值"}, deviceRows, []float64{26, 61, 26, 61}, deviceStyle)

	if len(device.CheckResults) == 0 {
		return
	}
	pdf.Ln(5)
	resultRows := make([][]string, 0, len(device.CheckResults))
	for idx, result := range device.CheckResults {
		if idx >= pdfMaxDeviceCheckRows {
			resultRows = append(resultRows, []string{"已截断", "-", "-", "-", "-", fmt.Sprintf("仅展示前%d条检查结果", pdfMaxDeviceCheckRows)})
			break
		}
		includeMsg := normalizeCheckStatus(result.Status) != checkStatusPass || strings.TrimSpace(result.ActualValue) == ""
		resultRows = append(resultRows, []string{
			fallbackPDFValue(result.CheckItemName),
			checkDomainOf(result),
			fallbackPDFValue(localizeProtocolTerm(result.CheckItemType)),
			fallbackPDFValue(localizeStatusWord(result.Status)),
			fallbackPDFValue(result.ExpectedValue),
			formatCheckResultActualWithMessage(result, includeMsg),
		})
	}
	resultStyle := defaultPDFTableStyle(pdfHeaderStyleBlue)
	resultStyle.BodyAlign = "L"
	resultStyle.WrapColumns = []int{0, 4, 5}
	resultStyle.RowFills, resultStyle.RowAccents = checkResultRowTints(resultRows, 3)
	pdfkit.GridTable(
		pdf,
		[]string{"检查项", "维度分类", "协议", "状态", "参考标准", "实测结果与诊断说明"},
		resultRows,
		[]float64{34, 24, 14, 14, 34, 54},
		resultStyle,
	)

	for _, result := range device.CheckResults {
		writeCheckDetailTables(pdf, result)
	}
}

// writeComponentStatusPDFTable 为「风扇 / 电源 / 单板状态」输出逐部件明细表。
func writeComponentStatusPDFTable(pdf *gofpdf.Fpdf, result InspectionCheckResult) {
	detail := result.ComponentStatus
	if detail == nil || len(detail.Components) == 0 {
		return
	}
	label := firstNonEmptyString(detail.Label, "部件")
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
		rows = append(rows, []string{
			fallbackPDFValue(component.Index), fallbackPDFValue(component.Name),
			localizeStatusWord(component.Verdict), fallbackPDFValue(component.StatusLabel), state,
		})
	}
	style := defaultPDFTableStyle(pdfHeaderStyleBlue)
	style.BodyAlign = "L"
	style.WrapColumns = []int{0, 1, 3}
	style.RowFills, style.RowAccents = checkResultRowTints(rows, 2)
	pdfkit.GridTable(pdf, []string{"编号", "名称", "判定", "状态描述", "原始状态码"}, rows, []float64{26, 46, 18, 52, 24}, style)
	writePDFRightAligned(pdf, fmt.Sprintf("判定依据：正常状态码 %s，异常状态码 %s，其余不作判定",
		formatStateCodeSet(detail.NormalStates), formatStateCodeSet(detail.AbnormalStates)))
}
