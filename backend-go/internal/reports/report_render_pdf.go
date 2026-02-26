package reports

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/phpdave11/gofpdf"
)

const (
	pdfFontName    = "report"
	pdfTitleSize   = 18
	pdfHeadingSize = 14
	pdfBodySize    = 11
	pdfSmallSize   = 10
	pdfMarginMM    = 25.4
	pdfBottomMM    = 6.35
	pdfTopOffsetMM = 1.6
	pdfTableLineMM = 0.14
)

func writeInspectionPDF(path string, data InspectionReportData) error {
	pdf, err := newReportPDF()
	if err != nil {
		return err
	}

	writePDFTitle(pdf, "网络设备巡检报告")
	if strings.TrimSpace(data.InspectionName) != "" {
		writePDFSubtitle(pdf, data.InspectionName)
	}
	pdf.Ln(20)

	writePDFSectionTitle(pdf, "巡检基本信息")
	inspectionTime := strings.TrimSpace(data.InspectionTime)
	if inspectionTime == "" {
		inspectionTime = strings.TrimSpace(data.GeneratedTimestamp)
	}
	inspectionTime = normalizeReportTime(inspectionTime, time.Time{})
	basicRows := [][]string{
		{"巡检ID", data.InspectionID},
		{"巡检时间", inspectionTime},
		{"设备总数", fmt.Sprintf("%d", len(data.Devices))},
		{"巡检状态", data.Status},
		{"执行时长", fmt.Sprintf("%s", formatDurationSeconds(data.ExecutionDuration))},
	}
	basicStyle := defaultPDFTableStyle(pdfHeaderStyleGrey)
	basicStyle.BodyFillColor = pdfColorBeige
	basicStyle.BodyAlign = "L"
	basicStyle.HeaderHeight = 9.5
	basicStyle.BodyHeight = 6.5
	writePDFTable(pdf, []string{"项目", "值"}, basicRows, []float64{50.8, 76.2}, basicStyle)
	pdf.Ln(11)

	writePDFSectionTitle(pdf, "检查统计摘要")
	summaryRows := [][]string{
		{"总检查项数", fmt.Sprintf("%d", data.SummaryStats.TotalChecks)},
		{"通过检查项", fmt.Sprintf("%d", data.SummaryStats.PassedChecks)},
		{"失败检查项", fmt.Sprintf("%d", data.SummaryStats.FailedChecks)},
		{"警告检查项", fmt.Sprintf("%d", data.SummaryStats.WarningChecks)},
		{"错误检查项", fmt.Sprintf("%d", data.SummaryStats.ErrorChecks)},
		{"通过率", formatPercent(data.SummaryStats.PassRate, 1)},
	}
	summaryStyle := defaultPDFTableStyle(pdfHeaderStyleGrey)
	summaryStyle.BodyFillColor = pdfColorBeige
	summaryStyle.BodyAlign = "L"
	summaryStyle.HeaderHeight = 9.5
	summaryStyle.BodyHeight = 6.5
	writePDFTable(pdf, []string{"统计项", "数量"}, summaryRows, []float64{50.8, 50.8}, summaryStyle)

	addPDFPage(pdf)
	pdf.Ln(1)
	writePDFSectionTitle(pdf, "设备巡检详情")
	for _, device := range data.Devices {
		writePDFSubSectionTitle(pdf, fmt.Sprintf("设备: %s", device.DeviceName))
		deviceRows := [][]string{
			{"IP地址", device.IPAddress},
			{"设备类型", device.DeviceType},
			{"厂商", device.Vendor},
			{"巡检状态", device.InspectionStatus},
			{"通过率", formatPercent(device.PassRate, 1)},
		}
		deviceStyle := defaultPDFTableStyle(pdfHeaderStyleLight)
		writePDFTable(pdf, []string{"属性", "值"}, deviceRows, []float64{50.8, 76.2}, deviceStyle)
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
	writePDFTitle(pdf, title)
	pdf.Ln(16)

	overview := [][]string{
		{"设备总数", fmt.Sprintf("%d", data.Overview.TotalDevices)},
		{"在线设备", fmt.Sprintf("%d", data.Overview.ActiveDevices)},
		{"离线设备", fmt.Sprintf("%d", data.Overview.OfflineDevices)},
		{"平均健康评分", formatFloat(data.Overview.AvgScore, 1)},
	}
	overviewStyle := defaultPDFTableStyle(pdfHeaderStyleGrey)
	overviewStyle.BodyFillColor = pdfColorBeige
	overviewStyle.BodyAlign = "L"
	overviewStyle.HeaderHeight = 9.5
	overviewStyle.BodyHeight = 6.5
	writePDFTable(pdf, []string{"统计项", "数值"}, overview, []float64{76.2, 50.8}, overviewStyle)

	addPDFPage(pdf)
	writePDFSectionTitle(pdf, "设备分布统计")
	byType := data.Distribution.ByType
	if byType == nil {
		byType = map[string]int{}
	}
	keys := orderedKeysByPreference(byType, []string{"switch", "router", "firewall", "server"})
	rows := make([][]string, 0, len(keys))
	for _, key := range keys {
		rows = append(rows, []string{key, fmt.Sprintf("%d", byType[key])})
	}
	distributionStyle := defaultPDFTableStyle(pdfHeaderStyleLight)
	distributionStyle.BodyAlign = "L"
	writePDFTable(pdf, []string{"设备类型", "数量"}, rows, []float64{76.2, 50.8}, distributionStyle)

	return pdf.OutputFileAndClose(path)
}

func writeDeviceSummaryPDF(path string, data DeviceSummaryData) error {
	pdf, err := newReportPDF()
	if err != nil {
		return err
	}

	writePDFTitleColored(pdf, "设备汇总报表", pdfColorBlue)
	pdf.Ln(10)
	generatedAt := normalizeReportTime(strings.TrimSpace(data.GeneratedTimestamp), time.Time{})
	if generatedAt == "" {
		generatedAt = time.Now().Format("2006-01-02 15:04:05")
	}
	writePDFRightAlignedColored(pdf, fmt.Sprintf("生成时间: %s", generatedAt), pdfColorGrey)
	pdf.Ln(7)

	writePDFSectionTitle(pdf, "设备概览统计")
	totalPercent := "0%"
	if data.Total > 0 {
		totalPercent = "100%"
	}
	summaryRows := [][]string{
		{"设备总数", fmt.Sprintf("%d", data.Total), totalPercent},
		{"在线设备", fmt.Sprintf("%d", data.Online), formatPercentByTotal(data.Online, data.Total)},
		{"离线设备", fmt.Sprintf("%d", data.Offline), formatPercentByTotal(data.Offline, data.Total)},
		{"告警设备", fmt.Sprintf("%d", data.Warning), formatPercentByTotal(data.Warning, data.Total)},
	}
	summaryStyle := defaultPDFTableStyle(pdfHeaderStyleGreyLarge)
	summaryStyle.BodyAlign = "C"
	summaryStyle.BodyFillColor = pdfColorBeige
	summaryStyle.HeaderHeight = 9.5
	summaryStyle.BodyHeight = 6.5
	writePDFTable(pdf, []string{"统计项", "数值", "占比"}, summaryRows, []float64{50.8, 25.4, 25.4}, summaryStyle)
	pdf.Ln(9)

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
	writePDFTitleColored(pdf, title, pdfColorBlue)
	pdf.Ln(10)
	generatedAt := normalizeReportTime(strings.TrimSpace(data.GeneratedTimestamp), time.Time{})
	if generatedAt == "" {
		generatedAt = time.Now().Format("2006-01-02 15:04:05")
	}
	writePDFRightAlignedColored(pdf, fmt.Sprintf("生成时间: %s", generatedAt), pdfColorGrey)
	pdf.Ln(8)

	entries := [][]string{
		{"report_name", reportName},
		{"range", data.Range},
		{"generated_by", data.GeneratedBy},
		{"summary", formatSummaryValue(data.Summary)},
	}
	if data.Notes != "" {
		entries = append(entries, []string{"notes", data.Notes})
	}
	keys := sortedKeys(data.Extra)
	for _, key := range keys {
		entries = append(entries, []string{key, formatValueForReport(data.Extra[key])})
	}

	for _, entry := range entries {
		pdf.SetFont(pdfFontName, "", pdfBodySize)
		pdf.MultiCell(0, 6, fmt.Sprintf("%s: %s", entry[0], entry[1]), "", "L", false)
		pdf.Ln(3)
	}

	return pdf.OutputFileAndClose(path)
}

type pdfHeaderStyle struct {
	FillColor [3]int
	TextColor [3]int
	FontStyle string
	FontSize  float64
	Align     string
}

type pdfTableStyle struct {
	Header        pdfHeaderStyle
	BodyAlign     string
	BodyFillColor [3]int
	BodyFontSize  float64
	HeaderHeight  float64
	BodyHeight    float64
	TableAlign    string
}

var (
	pdfColorBeige      = [3]int{245, 245, 220}
	pdfColorBlue       = [3]int{37, 99, 235}
	pdfColorGrey       = [3]int{107, 114, 128}
	pdfHeaderStyleGrey = pdfHeaderStyle{
		FillColor: [3]int{128, 128, 128},
		TextColor: [3]int{255, 255, 255},
		FontStyle: "B",
		FontSize:  12,
		Align:     "L",
	}
	pdfHeaderStyleGreyLarge = pdfHeaderStyle{
		FillColor: [3]int{128, 128, 128},
		TextColor: [3]int{255, 255, 255},
		FontStyle: "B",
		FontSize:  14,
		Align:     "C",
	}
	pdfHeaderStyleLight = pdfHeaderStyle{
		FillColor: [3]int{211, 211, 211},
		TextColor: [3]int{0, 0, 0},
		FontStyle: "B",
		FontSize:  10,
		Align:     "L",
	}
	pdfHeaderStyleBlue = pdfHeaderStyle{
		FillColor: [3]int{37, 99, 235},
		TextColor: [3]int{255, 255, 255},
		FontStyle: "B",
		FontSize:  8,
		Align:     "C",
	}
)

func newReportPDF() (*gofpdf.Fpdf, error) {
	fontPath, err := resolvePDFUnicodeFont()
	if err != nil {
		return nil, err
	}
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(pdfMarginMM, pdfMarginMM, pdfMarginMM)
	pdf.SetAutoPageBreak(true, pdfBottomMM)
	pdf.AddUTF8Font(pdfFontName, "", fontPath)
	pdf.AddUTF8Font(pdfFontName, "B", fontPath)
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

func resolvePDFUnicodeFont() (string, error) {
	if env := strings.TrimSpace(os.Getenv("REPORT_PDF_FONT_PATH")); env != "" {
		if _, err := os.Stat(env); err == nil {
			return env, nil
		}
	}
	candidates := []string{
		`C:\Windows\Fonts\simhei.ttf`,
		`C:\Windows\Fonts\simfang.ttf`,
		`C:\Windows\Fonts\simkai.ttf`,
		`C:\Windows\Fonts\simsunb.ttf`,
		`/usr/share/fonts/truetype/wqy/wqy-microhei.ttf`,
		`/usr/share/fonts/truetype/wqy/wqy-zenhei.ttf`,
		`/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc`,
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("未找到可用的PDF中文字体，请设置 REPORT_PDF_FONT_PATH")
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
	pdf.CellFormat(0, 8, title, "", 1, "L", false, 0, "")
	pdf.SetFont(pdfFontName, "", pdfBodySize)
	pdf.Ln(2)
}

func writePDFSubSectionTitle(pdf *gofpdf.Fpdf, title string) {
	pdf.SetFont(pdfFontName, "B", pdfBodySize)
	pdf.CellFormat(0, 7, title, "", 1, "L", false, 0, "")
	pdf.SetFont(pdfFontName, "", pdfBodySize)
	pdf.Ln(4)
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
		Header:        header,
		BodyAlign:     "L",
		BodyFillColor: [3]int{255, 255, 255},
		BodyFontSize:  pdfSmallSize,
		HeaderHeight:  7,
		BodyHeight:    6,
		TableAlign:    "C",
	}
}

func writePDFTable(pdf *gofpdf.Fpdf, headers []string, rows [][]string, colWidths []float64, style pdfTableStyle) {
	totalWidth := 0.0
	for _, width := range colWidths {
		totalWidth += width
	}
	startX := tableStartX(pdf, totalWidth, style.TableAlign)
	prevLineWidth := pdf.GetLineWidth()
	pdf.SetLineWidth(pdfTableLineMM)
	defer pdf.SetLineWidth(prevLineWidth)

	pdf.SetFont(pdfFontName, style.Header.FontStyle, style.Header.FontSize)
	pdf.SetFillColor(style.Header.FillColor[0], style.Header.FillColor[1], style.Header.FillColor[2])
	pdf.SetTextColor(style.Header.TextColor[0], style.Header.TextColor[1], style.Header.TextColor[2])
	pdf.SetX(startX)
	for i, header := range headers {
		pdf.CellFormat(colWidths[i], style.HeaderHeight, header, "1", 0, style.Header.Align, true, 0, "")
	}
	pdf.Ln(-1)
	pdf.SetFont(pdfFontName, "", style.BodyFontSize)
	pdf.SetTextColor(0, 0, 0)
	pdf.SetFillColor(style.BodyFillColor[0], style.BodyFillColor[1], style.BodyFillColor[2])
	for _, row := range rows {
		pdf.SetX(startX)
		for i, value := range row {
			pdf.CellFormat(colWidths[i], style.BodyHeight, value, "1", 0, style.BodyAlign, true, 0, "")
		}
		pdf.Ln(-1)
	}
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
