package reports

import (
	"fmt"
	"strings"

	"github.com/phpdave11/gofpdf"

	"github.com/your-org/inspect-system/backend-go/internal/reports/pdfkit"
)

func formatInterfaceWithAlias(name, alias string) string {
	n, a := strings.TrimSpace(name), strings.TrimSpace(alias)
	if a != "" && a != n {
		if n == "" {
			return a
		}
		return fmt.Sprintf("%s (%s)", n, a)
	}
	return fallbackPDFValue(n)
}

// writeOpticalPowerPDFTable 为「光模块光功率」输出逐模块明细表（含端口名、SN 与温度）。
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
			unit := firstNonEmptyString(module.RxPowerUnit, "dBm")
			tempUnit := thresholdUnitLabel(firstNonEmptyString(module.TemperatureUnit, "C"))
			rows = append(rows, []string{
				fallbackPDFValue(firstNonEmptyString(module.Name, module.Index)),
				fallbackPDFValue(module.VendorSN),
				localizeStatusWord(module.Verdict),
				formatFloat(module.RxPower, 1) + unit,
				formatOptionalFloat(module.TxPower, module.TxPowerUnit, 1),
				formatOptionalFloat(module.Temperature, tempUnit, 1),
				formatOptionalFloat(module.Voltage, module.VoltageUnit, 2),
				formatOptionalFloat(module.BiasCurrent, module.BiasCurrentUnit, 1),
			})
		}
		style := defaultPDFTableStyle(pdfHeaderStyleBlue)
		style.BodyAlign = "L"
		style.WrapColumns = []int{0, 1}
		style.RowFills, style.RowAccents = checkResultRowTints(rows, 2)
		pdfkit.GridTable(pdf, []string{"端口/模块", "SN", "判定", "收光", "发光", "温度", "电压", "偏置电流"},
			rows, []float64{32, 26, 14, 21, 21, 18, 20, 22}, style)
	}
	writeDetailSkippedPDFTable(pdf, "未评估模块", detail.Skipped)
}

// writeStackStatusPDFTable 输出堆叠概要、成员角色表与堆叠端口状态表。
func writeStackStatusPDFTable(pdf *gofpdf.Fpdf, result InspectionCheckResult) {
	detail := result.StackStatus
	if detail == nil {
		return
	}

	modeLabel := stackModeLabel(detail)
	pdf.Ln(4)
	ensurePDFSpace(pdf, 40)
	writePDFSubSectionTitle(pdf, fmt.Sprintf("%s - 堆叠状态明细（%s，拓扑：%s，堆叠口 Up %d / Down %d）",
		result.CheckItemName, modeLabel, fallbackPDFValue(detail.Topology), detail.PortUpCount, detail.PortDownCount))

	summaryRows := [][]string{{
		modeLabel,
		fallbackPDFValue(detail.Topology),
		fmt.Sprintf("%d", detail.MemberCount),
		fmt.Sprintf("%d / %d", detail.PortUpCount, detail.PortDownCount),
	}}
	summaryStyle := defaultPDFTableStyle(pdfHeaderStyleLight)
	summaryStyle.BodyAlign = "C"
	pdfkit.GridTable(pdf, []string{"运行模式", "堆叠拓扑", "成员数量", "堆叠端口 (Up / Down)"}, summaryRows, []float64{42, 42, 38, 52}, summaryStyle)

	writeStackMembersPDFTable(pdf, detail.Members)
	writeStackPortsPDFTable(pdf, detail.Ports)
}

func stackModeLabel(detail *StackStatusReport) string {
	switch {
	case !detail.Enabled:
		return "未启用"
	case detail.Standalone:
		return "单机模式"
	default:
		return fmt.Sprintf("%d 台成员", detail.MemberCount)
	}
}

func writeStackMembersPDFTable(pdf *gofpdf.Fpdf, members []StackMemberReport) {
	if len(members) == 0 {
		return
	}
	pdf.Ln(3)
	ensurePDFSpace(pdf, 28)
	rows := make([][]string, 0, len(members))
	for _, member := range members {
		priority := pdfEmptyValuePlaceholder
		if member.Priority != nil {
			priority = fmt.Sprintf("%d", *member.Priority)
		}
		rows = append(rows, []string{
			fallbackPDFValue(member.ID),
			fallbackPDFValue(member.Role),
			priority,
			fallbackPDFValue(member.MAC),
			localizeStatusWord(member.Verdict),
		})
	}
	style := defaultPDFTableStyle(pdfHeaderStyleBlue)
	style.BodyAlign = "L"
	style.WrapColumns = []int{3}
	style.RowFills, style.RowAccents = checkResultRowTints(rows, 4)
	pdfkit.GridTable(pdf, []string{"成员 ID", "角色", "优先级", "MAC 地址", "判定"}, rows, []float64{26, 32, 24, 60, 32}, style)
}

func writeStackPortsPDFTable(pdf *gofpdf.Fpdf, ports []StackPortReport) {
	if len(ports) == 0 {
		return
	}
	pdf.Ln(3)
	ensurePDFSpace(pdf, 28)
	rows := make([][]string, 0, len(ports))
	for _, port := range ports {
		rows = append(rows, []string{
			fallbackPDFValue(port.Name),
			fallbackPDFValue(port.Status),
			localizeStatusWord(port.Verdict),
		})
	}
	style := defaultPDFTableStyle(pdfHeaderStyleBlue)
	style.BodyAlign = "L"
	style.WrapColumns = []int{0}
	style.RowFills, style.RowAccents = checkResultRowTints(rows, 2)
	pdfkit.GridTable(pdf, []string{"堆叠端口", "链路状态", "判定"}, rows, []float64{80, 50, 44}, style)
}

// writeInterfaceStatusDetailPDFTable 输出接口状态一致性或双工模式异常明细表。
func writeInterfaceStatusDetailPDFTable(pdf *gofpdf.Fpdf, result InspectionCheckResult) {
	detail := result.InterfaceStatusDetail
	if detail == nil || (len(detail.Entries) == 0 && detail.TotalEvaluated == 0) {
		return
	}

	pdf.Ln(4)
	ensurePDFSpace(pdf, 36)
	isDuplex := detail.SubKind == "duplex"
	writePDFSubSectionTitle(pdf, buildInterfaceStatusDetailTitle(result.CheckItemName, detail, isDuplex))

	if len(detail.Entries) == 0 {
		writePDFRightAlignedColored(pdf, "所有已评估接口均正常，无异常明细。", pdfColorMuted)
		return
	}

	rows := make([][]string, 0, len(detail.Entries))
	for _, entry := range detail.Entries {
		speed := pdfEmptyValuePlaceholder
		if entry.SpeedMbps != nil {
			speed = fmt.Sprintf("%d Mbps", *entry.SpeedMbps)
		}
		if isDuplex {
			rows = append(rows, []string{
				formatInterfaceWithAlias(entry.Name, entry.Alias),
				speed,
				fallbackPDFValue(entry.StatusLabel),
				fallbackPDFValue(entry.DuplexLabel),
				localizeStatusWord(entry.Verdict),
				fallbackPDFValue(entry.Reason),
			})
		} else {
			rows = append(rows, []string{
				formatInterfaceWithAlias(entry.Name, entry.Alias),
				speed,
				fallbackPDFValue(entry.StatusLabel),
				localizeStatusWord(entry.Verdict),
				fallbackPDFValue(entry.Reason),
			})
		}
	}

	style := defaultPDFTableStyle(pdfHeaderStyleBlue)
	style.BodyAlign = "L"
	if isDuplex {
		style.WrapColumns = []int{0, 5}
		style.RowFills, style.RowAccents = checkResultRowTints(rows, 4)
		pdfkit.GridTable(pdf, []string{"接口", "速率", "状态", "双工模式", "判定", "说明"}, rows, []float64{42, 22, 18, 22, 16, 54}, style)
		return
	}
	style.WrapColumns = []int{0, 4}
	style.RowFills, style.RowAccents = checkResultRowTints(rows, 3)
	pdfkit.GridTable(pdf, []string{"接口", "速率", "状态", "判定", "说明"}, rows, []float64{46, 24, 24, 18, 62}, style)
}

func buildInterfaceStatusDetailTitle(checkName string, detail *InterfaceStatusDetailReport, isDuplex bool) string {
	parts := []string{
		fmt.Sprintf("已评估 %d 个", detail.TotalEvaluated),
		fmt.Sprintf("%s %d 个", map[bool]string{true: "半双工异常", false: "异常"}[isDuplex], detail.AbnormalCount),
	}
	if detail.AdminDownCount != nil {
		parts = append(parts, fmt.Sprintf("管理关闭 %d 个", *detail.AdminDownCount))
	}
	if detail.IdleCount != nil {
		parts = append(parts, fmt.Sprintf("空闲 %d 个", *detail.IdleCount))
	}
	prefix := "接口状态一致性明细"
	if isDuplex {
		prefix = "接口双工模式明细"
	}
	return fmt.Sprintf("%s - %s（%s）", checkName, prefix, strings.Join(parts, "，"))
}

// writeFlashUsagePDFTable 输出设备 Flash 分区使用率与可用容量明细表。
func writeFlashUsagePDFTable(pdf *gofpdf.Fpdf, result InspectionCheckResult) {
	detail := result.FlashUsage
	if detail == nil || (len(detail.Partitions) == 0 && len(detail.Skipped) == 0) {
		return
	}

	pdf.Ln(4)
	ensurePDFSpace(pdf, 40)
	writePDFSubSectionTitle(pdf, fmt.Sprintf("%s - Flash 存储明细（已评估 %d/%d，警告线 %s，故障线 %s）",
		result.CheckItemName, detail.Evaluated, detail.Total,
		formatDetailPercent(detail.WarningThreshold), formatDetailPercent(detail.CriticalThreshold)))

	if len(detail.Partitions) > 0 {
		rows := make([][]string, 0, len(detail.Partitions))
		for _, part := range detail.Partitions {
			rows = append(rows, []string{
				fallbackPDFValue(part.Name),
				localizeStatusWord(part.Verdict),
				formatDetailPercent(part.Percent),
				formatDetailBytes(part.UsedBytes),
				formatDetailBytes(part.FreeBytes),
				formatDetailBytes(part.TotalBytes),
			})
		}
		style := defaultPDFTableStyle(pdfHeaderStyleBlue)
		style.BodyAlign = "L"
		style.WrapColumns = []int{0}
		style.RowFills, style.RowAccents = checkResultRowTints(rows, 1)
		pdfkit.GridTable(
			pdf,
			[]string{"分区", "判定", "使用率", "已用", "可用容量", "总容量"},
			rows,
			[]float64{56, 18, 22, 26, 26, 26},
			style,
		)
	}
	writeDetailSkippedPDFTable(pdf, "未评估分区", detail.Skipped)
}
