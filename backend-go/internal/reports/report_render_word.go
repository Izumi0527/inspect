package reports

import (
	"archive/zip"
	"bytes"
	"fmt"
	"os"
	"strings"
	"time"
)

func writeInspectionWord(path string, data InspectionReportData) error {
	inspectionName := strings.TrimSpace(data.InspectionName)
	inspectionTime := strings.TrimSpace(data.InspectionTime)
	if inspectionTime == "" {
		inspectionTime = strings.TrimSpace(data.GeneratedTimestamp)
	}
	if inspectionTime == "" {
		inspectionTime = time.Now().Format("2006-01-02 15:04:05")
	}
	generatedAt := data.GeneratedTimestamp
	if strings.TrimSpace(generatedAt) == "" {
		generatedAt = inspectionTime
	}

	elements := []string{docxParagraph("网络设备巡检报告", "center")}
	if inspectionName != "" {
		elements = append(elements, docxParagraph(inspectionName, "center"))
	}
	elements = append(elements, docxParagraph("", ""))
	elements = append(elements, docxParagraph("基本信息", ""))

	infoRows := [][]string{
		{"巡检ID", data.InspectionID},
		{"巡检时间", inspectionTime},
		{"设备总数", fmt.Sprintf("%d", len(data.Devices))},
		{"巡检状态", data.Status},
		{"执行时长", formatDurationSeconds(data.ExecutionDuration)},
	}
	elements = append(elements, docxTable(infoRows, false))

	elements = append(elements, docxParagraph("统计摘要", ""))
	summaryRows := [][]string{
		{"总检查项数", fmt.Sprintf("%d", data.SummaryStats.TotalChecks)},
		{"通过检查项", fmt.Sprintf("%d", data.SummaryStats.PassedChecks)},
		{"失败检查项", fmt.Sprintf("%d", data.SummaryStats.FailedChecks)},
		{"警告检查项", fmt.Sprintf("%d", data.SummaryStats.WarningChecks)},
		{"错误检查项", fmt.Sprintf("%d", data.SummaryStats.ErrorChecks)},
		{"通过率", formatPercent(data.SummaryStats.PassRate, 1)},
	}
	elements = append(elements, docxTable(summaryRows, false))

	elements = append(elements, docxParagraph("设备巡检详情", ""))
	deviceRows := [][]string{{"设备名称", "IP地址", "设备类型", "巡检状态", "通过率", "问题数"}}
	for _, device := range data.Devices {
		deviceRows = append(deviceRows, []string{
			device.DeviceName,
			device.IPAddress,
			device.DeviceType,
			device.InspectionStatus,
			formatPercent(device.PassRate, 1),
			fmt.Sprintf("%d", device.IssueCount),
		})
	}
	elements = append(elements, docxTable(deviceRows, true))

	elements = append(elements, docxParagraph("此报告由网络设备巡检系统自动生成", ""))
	elements = append(elements, docxParagraph(fmt.Sprintf("生成时间: %s", generatedAt), ""))

	return writeDocx(path, docxDocument(elements))
}

func writeStatisticsWord(path string, data StatisticsReportData) error {
	title := normalizeReportTitle(data.Title, "统计报表")
	elements := []string{docxParagraph(title, "center")}

	elements = append(elements, docxParagraph("统计概览", ""))
	overviewRows := [][]string{
		{"设备总数", fmt.Sprintf("%d", data.Overview.TotalDevices)},
		{"在线设备", fmt.Sprintf("%d", data.Overview.ActiveDevices)},
		{"离线设备", fmt.Sprintf("%d", data.Overview.OfflineDevices)},
		{"平均健康评分", formatFloat(data.Overview.AvgScore, 1)},
		{"总巡检次数", fmt.Sprintf("%d", data.Overview.TotalExecutions)},
	}
	elements = append(elements, docxTable(overviewRows, false))

	elements = append(elements, docxParagraph("设备分布", ""))
	byType := data.Distribution.ByType
	if byType == nil {
		byType = map[string]int{}
	}
	keys := orderedKeysByPreference(byType, []string{"switch", "router", "firewall", "server"})
	distRows := [][]string{{"设备类型", "数量"}}
	for _, key := range keys {
		distRows = append(distRows, []string{key, fmt.Sprintf("%d", byType[key])})
	}
	elements = append(elements, docxTable(distRows, true))

	elements = append(elements, docxParagraph("此报告由网络设备巡检系统自动生成", ""))

	return writeDocx(path, docxDocument(elements))
}

func writeDeviceSummaryWord(path string, data DeviceSummaryData) error {
	now := time.Now().Format("2006-01-02 15:04:05")
	if strings.TrimSpace(data.GeneratedTimestamp) != "" {
		now = strings.TrimSpace(data.GeneratedTimestamp)
	}
	elements := []string{
		docxParagraph("设备汇总报表", "center"),
		docxParagraph(fmt.Sprintf("生成时间: %s", now), ""),
		docxParagraph(strings.Repeat("_", 50), ""),
		docxParagraph("设备概览统计", ""),
	}

	totalPercent := "0%"
	if data.Total > 0 {
		totalPercent = "100%"
	}
	summaryRows := [][]string{
		{"统计项", "数值", "占比"},
		{"设备总数", fmt.Sprintf("%d", data.Total), totalPercent},
		{"在线设备", fmt.Sprintf("%d", data.Online), formatPercentByTotal(data.Online, data.Total)},
		{"离线设备", fmt.Sprintf("%d", data.Offline), formatPercentByTotal(data.Offline, data.Total)},
		{"告警设备", fmt.Sprintf("%d", data.Warning), formatPercentByTotal(data.Warning, data.Total)},
	}
	elements = append(elements, docxTable(summaryRows, true))

	elements = append(elements, docxParagraph("设备详情列表", ""))
	deviceRows := [][]string{{"设备名称", "IP地址", "设备类型", "状态", "位置"}}
	for _, device := range data.Devices {
		deviceRows = append(deviceRows, []string{
			device.Name,
			device.IP,
			device.DeviceType,
			device.Status,
			device.Location,
		})
	}
	elements = append(elements, docxTable(deviceRows, true))

	return writeDocx(path, docxDocument(elements))
}

func writeGenericWord(path string, data GenericReportData) error {
	now := time.Now().Format("2006-01-02 15:04:05")
	if strings.TrimSpace(data.GeneratedTimestamp) != "" {
		now = strings.TrimSpace(data.GeneratedTimestamp)
	}
	title := resolveGenericReportTitle(data.ReportType, data.ReportTitle, data.ReportName)
	reportName := normalizeReportTitle(data.ReportName, title)
	elements := []string{
		docxParagraph(title, "center"),
		docxParagraph(fmt.Sprintf("生成时间: %s", now), ""),
		docxParagraph(strings.Repeat("_", 50), ""),
		docxParagraph(fmt.Sprintf("report_name: %s", reportName), ""),
		docxParagraph(fmt.Sprintf("range: %s", data.Range), ""),
		docxParagraph(fmt.Sprintf("generated_by: %s", data.GeneratedBy), ""),
		docxParagraph(fmt.Sprintf("summary: %s", formatSummaryValue(data.Summary)), ""),
	}
	if data.Notes != "" {
		elements = append(elements, docxParagraph(fmt.Sprintf("notes: %s", data.Notes), ""))
	}

	keys := sortedKeys(data.Extra)
	for _, key := range keys {
		elements = append(elements, docxParagraph(fmt.Sprintf("%s: %s", key, formatValueForReport(data.Extra[key])), ""))
	}

	return writeDocx(path, docxDocument(elements))
}

func docxDocument(elements []string) string {
	var buf strings.Builder
	buf.WriteString("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>")
	buf.WriteString("<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">")
	buf.WriteString("<w:body>")
	for _, element := range elements {
		buf.WriteString(element)
	}
	buf.WriteString("<w:sectPr/>")
	buf.WriteString("</w:body></w:document>")
	return buf.String()
}

func docxParagraph(text string, align string) string {
	if text == "" {
		return "<w:p/>"
	}
	var buf strings.Builder
	buf.WriteString("<w:p>")
	if align != "" {
		buf.WriteString("<w:pPr><w:jc w:val=\"")
		buf.WriteString(escapeXML(align))
		buf.WriteString("\"/></w:pPr>")
	}
	buf.WriteString("<w:r><w:t>")
	buf.WriteString(escapeXML(text))
	buf.WriteString("</w:t></w:r></w:p>")
	return buf.String()
}

func docxTable(rows [][]string, boldHeader bool) string {
	var buf strings.Builder
	buf.WriteString("<w:tbl>")
	for rowIndex, row := range rows {
		buf.WriteString("<w:tr>")
		for _, cell := range row {
			buf.WriteString(docxTableCell(cell, boldHeader && rowIndex == 0))
		}
		buf.WriteString("</w:tr>")
	}
	buf.WriteString("</w:tbl>")
	return buf.String()
}

func docxTableCell(text string, bold bool) string {
	var buf strings.Builder
	buf.WriteString("<w:tc><w:p><w:r>")
	if bold {
		buf.WriteString("<w:rPr><w:b/></w:rPr>")
	}
	buf.WriteString("<w:t>")
	buf.WriteString(escapeXML(text))
	buf.WriteString("</w:t></w:r></w:p></w:tc>")
	return buf.String()
}

func escapeXML(text string) string {
	replacer := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		"\"", "&quot;",
	)
	return replacer.Replace(text)
}

func writeDocx(path string, documentXML string) error {
	var buf bytes.Buffer
	zipWriter := zip.NewWriter(&buf)

	if err := writeZipEntry(zipWriter, "[Content_Types].xml", docxContentTypes); err != nil {
		_ = zipWriter.Close()
		return err
	}
	if err := writeZipEntry(zipWriter, "_rels/.rels", docxRels); err != nil {
		_ = zipWriter.Close()
		return err
	}
	if err := writeZipEntry(zipWriter, "word/document.xml", documentXML); err != nil {
		_ = zipWriter.Close()
		return err
	}
	if err := writeZipEntry(zipWriter, "word/_rels/document.xml.rels", docxDocumentRels); err != nil {
		_ = zipWriter.Close()
		return err
	}
	if err := zipWriter.Close(); err != nil {
		return err
	}

	return os.WriteFile(path, buf.Bytes(), 0o644)
}

func writeZipEntry(writer *zip.Writer, name string, content string) error {
	entry, err := writer.Create(name)
	if err != nil {
		return err
	}
	_, err = entry.Write([]byte(content))
	return err
}

const docxContentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

const docxRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

const docxDocumentRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`
