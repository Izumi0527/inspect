package reports

import (
	"fmt"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
)

type excelReportStyles struct {
	Title       int
	Section     int
	TableHeader int
	Success     int
	Warning     int
	Error       int
}

func newExcelReportStyles(file *excelize.File) (excelReportStyles, error) {
	title, err := file.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Size: 16},
		Alignment: &excelize.Alignment{Horizontal: "center"},
	})
	if err != nil {
		return excelReportStyles{}, err
	}
	section, err := file.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true, Size: 12},
	})
	if err != nil {
		return excelReportStyles{}, err
	}
	tableHeader, err := file.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Color: "FFFFFF"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"4472C4"}, Pattern: 1},
		Alignment: &excelize.Alignment{Horizontal: "center"},
	})
	if err != nil {
		return excelReportStyles{}, err
	}
	success, err := file.NewStyle(&excelize.Style{
		Fill: excelize.Fill{Type: "pattern", Color: []string{"90EE90"}, Pattern: 1},
	})
	if err != nil {
		return excelReportStyles{}, err
	}
	warning, err := file.NewStyle(&excelize.Style{
		Fill: excelize.Fill{Type: "pattern", Color: []string{"FFD700"}, Pattern: 1},
	})
	if err != nil {
		return excelReportStyles{}, err
	}
	errorStyle, err := file.NewStyle(&excelize.Style{
		Fill: excelize.Fill{Type: "pattern", Color: []string{"FFB6C1"}, Pattern: 1},
	})
	if err != nil {
		return excelReportStyles{}, err
	}
	return excelReportStyles{
		Title:       title,
		Section:     section,
		TableHeader: tableHeader,
		Success:     success,
		Warning:     warning,
		Error:       errorStyle,
	}, nil
}

func writeInspectionExcel(path string, data InspectionReportData) error {
	file := excelize.NewFile()
	summarySheet := "巡检汇总"
	file.SetSheetName("Sheet1", summarySheet)

	deviceSheet := "设备详情"
	resultSheet := "检查结果详情"
	chartSheet := "图表分析"

	if _, err := file.NewSheet(deviceSheet); err != nil {
		return err
	}
	if _, err := file.NewSheet(resultSheet); err != nil {
		return err
	}
	if _, err := file.NewSheet(chartSheet); err != nil {
		return err
	}

	styles, err := newExcelReportStyles(file)
	if err != nil {
		return err
	}

	if err := writeInspectionSummarySheet(file, summarySheet, data, styles); err != nil {
		return err
	}
	if err := writeInspectionDeviceDetailSheet(file, deviceSheet, data, styles); err != nil {
		return err
	}
	if err := writeInspectionResultSheet(file, resultSheet, data, styles); err != nil {
		return err
	}
	if err := writeInspectionChartSheet(file, chartSheet, data, styles); err != nil {
		return err
	}

	if index, err := file.GetSheetIndex(summarySheet); err == nil {
		file.SetActiveSheet(index)
	}
	return file.SaveAs(path)
}

func writeInspectionSummarySheet(file *excelize.File, sheet string, data InspectionReportData, styles excelReportStyles) error {
	inspectionName := normalizeReportTitle(data.InspectionName, "巡检报告")
	inspectionTime := strings.TrimSpace(data.InspectionTime)
	if inspectionTime == "" {
		inspectionTime = strings.TrimSpace(data.GeneratedTimestamp)
	}
	if inspectionTime == "" {
		inspectionTime = time.Now().Format("2006-01-02 15:04:05")
	}

	if err := setCell(file, sheet, "A1", fmt.Sprintf("网络设备巡检报告 - %s", inspectionName)); err != nil {
		return err
	}
	if err := file.MergeCell(sheet, "A1", "F1"); err == nil {
		_ = file.SetCellStyle(sheet, "A1", "F1", styles.Title)
	}
	if err := setCell(file, sheet, "A3", "巡检ID:"); err != nil {
		return err
	}
	_ = file.SetCellStyle(sheet, "A3", "A7", styles.Section)
	if err := setCell(file, sheet, "B3", data.InspectionID); err != nil {
		return err
	}
	if err := setCell(file, sheet, "A4", "巡检时间:"); err != nil {
		return err
	}
	if err := setCell(file, sheet, "B4", inspectionTime); err != nil {
		return err
	}
	if err := setCell(file, sheet, "A5", "设备总数:"); err != nil {
		return err
	}
	if err := setCell(file, sheet, "B5", fmt.Sprintf("%d", len(data.Devices))); err != nil {
		return err
	}
	if err := setCell(file, sheet, "A6", "巡检状态:"); err != nil {
		return err
	}
	if err := setCell(file, sheet, "B6", data.Status); err != nil {
		return err
	}
	if err := setCell(file, sheet, "A7", "执行时长:"); err != nil {
		return err
	}
	if err := setCell(file, sheet, "B7", formatDurationSeconds(data.ExecutionDuration)); err != nil {
		return err
	}

	if err := setCell(file, sheet, "A10", "检查统计摘要"); err != nil {
		return err
	}
	_ = file.SetCellStyle(sheet, "A10", "A10", styles.Section)
	if err := setCell(file, sheet, "A11", "总检查项数:"); err != nil {
		return err
	}
	_ = file.SetCellStyle(sheet, "A11", "A16", styles.Section)
	if err := setCell(file, sheet, "B11", fmt.Sprintf("%d", data.SummaryStats.TotalChecks)); err != nil {
		return err
	}
	if err := setCell(file, sheet, "A12", "通过检查项:"); err != nil {
		return err
	}
	if err := setCell(file, sheet, "B12", fmt.Sprintf("%d", data.SummaryStats.PassedChecks)); err != nil {
		return err
	}
	if err := setCell(file, sheet, "A13", "失败检查项:"); err != nil {
		return err
	}
	if err := setCell(file, sheet, "B13", fmt.Sprintf("%d", data.SummaryStats.FailedChecks)); err != nil {
		return err
	}
	if err := setCell(file, sheet, "A14", "警告检查项:"); err != nil {
		return err
	}
	if err := setCell(file, sheet, "B14", fmt.Sprintf("%d", data.SummaryStats.WarningChecks)); err != nil {
		return err
	}
	if err := setCell(file, sheet, "A15", "错误检查项:"); err != nil {
		return err
	}
	if err := setCell(file, sheet, "B15", fmt.Sprintf("%d", data.SummaryStats.ErrorChecks)); err != nil {
		return err
	}
	if err := setCell(file, sheet, "A16", "通过率:"); err != nil {
		return err
	}
	if err := setCell(file, sheet, "B16", formatPercent(data.SummaryStats.PassRate, 1)); err != nil {
		return err
	}

	if err := setCell(file, sheet, "A19", "设备状态汇总"); err != nil {
		return err
	}
	_ = file.SetCellStyle(sheet, "A19", "A19", styles.Section)
	headers := []string{"设备名称", "设备IP", "设备类型", "巡检状态", "通过率", "问题数量"}
	for idx, header := range headers {
		cell, _ := excelize.CoordinatesToCellName(1+idx, 20)
		if err := setCell(file, sheet, cell, header); err != nil {
			return err
		}
	}
	_ = file.SetCellStyle(sheet, "A20", "F20", styles.TableHeader)

	row := 21
	for _, device := range data.Devices {
		values := []interface{}{
			device.DeviceName,
			device.IPAddress,
			device.DeviceType,
			device.InspectionStatus,
			formatPercent(device.PassRate, 1),
			device.IssueCount,
		}
		for idx, value := range values {
			cell, _ := excelize.CoordinatesToCellName(1+idx, row)
			if err := setCell(file, sheet, cell, value); err != nil {
				return err
			}
			if idx == 3 {
				switch statusClass(device.InspectionStatus) {
				case "status-online":
					_ = file.SetCellStyle(sheet, cell, cell, styles.Success)
				case "status-warning":
					_ = file.SetCellStyle(sheet, cell, cell, styles.Warning)
				case "status-error":
					_ = file.SetCellStyle(sheet, cell, cell, styles.Error)
				}
			}
		}
		row++
	}

	_ = file.SetColWidth(sheet, "A", "A", 15)
	_ = file.SetColWidth(sheet, "B", "B", 15)
	_ = file.SetColWidth(sheet, "C", "C", 12)
	_ = file.SetColWidth(sheet, "D", "D", 12)
	_ = file.SetColWidth(sheet, "E", "E", 10)
	_ = file.SetColWidth(sheet, "F", "F", 10)
	return nil
}

func writeInspectionDeviceDetailSheet(file *excelize.File, sheet string, data InspectionReportData, styles excelReportStyles) error {
	if err := setCell(file, sheet, "A1", "设备详细信息"); err != nil {
		return err
	}
	if err := file.MergeCell(sheet, "A1", "H1"); err == nil {
		_ = file.SetCellStyle(sheet, "A1", "H1", styles.Title)
	}

	startRow := 3
	for index, device := range data.Devices {
		row := startRow + index*16
		if err := setCell(file, sheet, fmt.Sprintf("A%d", row), fmt.Sprintf("设备: %s", device.DeviceName)); err != nil {
			return err
		}
		_ = file.SetCellStyle(sheet, fmt.Sprintf("A%d", row), fmt.Sprintf("A%d", row), styles.Section)
		if err := setCell(file, sheet, fmt.Sprintf("A%d", row+1), "IP地址:"); err != nil {
			return err
		}
		_ = file.SetCellStyle(sheet, fmt.Sprintf("A%d", row+1), fmt.Sprintf("A%d", row+7), styles.Section)
		if err := setCell(file, sheet, fmt.Sprintf("B%d", row+1), device.IPAddress); err != nil {
			return err
		}
		if err := setCell(file, sheet, fmt.Sprintf("A%d", row+2), "设备类型:"); err != nil {
			return err
		}
		if err := setCell(file, sheet, fmt.Sprintf("B%d", row+2), device.DeviceType); err != nil {
			return err
		}
		if err := setCell(file, sheet, fmt.Sprintf("A%d", row+3), "厂商:"); err != nil {
			return err
		}
		if err := setCell(file, sheet, fmt.Sprintf("B%d", row+3), device.Vendor); err != nil {
			return err
		}
		if err := setCell(file, sheet, fmt.Sprintf("A%d", row+4), "型号:"); err != nil {
			return err
		}
		if err := setCell(file, sheet, fmt.Sprintf("B%d", row+4), device.Model); err != nil {
			return err
		}
		if err := setCell(file, sheet, fmt.Sprintf("A%d", row+5), "系统版本:"); err != nil {
			return err
		}
		if err := setCell(file, sheet, fmt.Sprintf("B%d", row+5), device.SoftwareVersion); err != nil {
			return err
		}
		if err := setCell(file, sheet, fmt.Sprintf("A%d", row+6), "运行时间:"); err != nil {
			return err
		}
		if err := setCell(file, sheet, fmt.Sprintf("B%d", row+6), device.Uptime); err != nil {
			return err
		}
		if err := setCell(file, sheet, fmt.Sprintf("A%d", row+7), "最后巡检时间:"); err != nil {
			return err
		}
		if err := setCell(file, sheet, fmt.Sprintf("B%d", row+7), device.LastInspectionTime); err != nil {
			return err
		}
		if err := setCell(file, sheet, fmt.Sprintf("A%d", row+9), "性能指标"); err != nil {
			return err
		}
		_ = file.SetCellStyle(sheet, fmt.Sprintf("A%d", row+9), fmt.Sprintf("A%d", row+9), styles.Section)
		if err := setCell(file, sheet, fmt.Sprintf("A%d", row+10), "CPU使用率:"); err != nil {
			return err
		}
		_ = file.SetCellStyle(sheet, fmt.Sprintf("A%d", row+10), fmt.Sprintf("A%d", row+13), styles.Section)
		if err := setCell(file, sheet, fmt.Sprintf("B%d", row+10), formatPercent(device.Performance.CPUUsage, 1)); err != nil {
			return err
		}
		if err := setCell(file, sheet, fmt.Sprintf("A%d", row+11), "内存使用率:"); err != nil {
			return err
		}
		if err := setCell(file, sheet, fmt.Sprintf("B%d", row+11), formatPercent(device.Performance.MemoryUsage, 1)); err != nil {
			return err
		}
		if err := setCell(file, sheet, fmt.Sprintf("A%d", row+12), "活跃接口数:"); err != nil {
			return err
		}
		if err := setCell(file, sheet, fmt.Sprintf("B%d", row+12), fmt.Sprintf("%d", device.Performance.ActiveInterfaces)); err != nil {
			return err
		}
		if err := setCell(file, sheet, fmt.Sprintf("A%d", row+13), "接口总数:"); err != nil {
			return err
		}
		if err := setCell(file, sheet, fmt.Sprintf("B%d", row+13), fmt.Sprintf("%d", device.Performance.TotalInterfaces)); err != nil {
			return err
		}
	}
	_ = file.SetColWidth(sheet, "A", "A", 20)
	_ = file.SetColWidth(sheet, "B", "B", 25)
	return nil
}

func writeInspectionResultSheet(file *excelize.File, sheet string, data InspectionReportData, styles excelReportStyles) error {
	if err := setCell(file, sheet, "A1", "检查结果详情"); err != nil {
		return err
	}
	if err := file.MergeCell(sheet, "A1", "G1"); err == nil {
		_ = file.SetCellStyle(sheet, "A1", "G1", styles.Title)
	}

	headers := []string{"设备名称", "检查项", "检查类型", "状态", "期望值", "实际值", "执行时间(ms)"}
	for idx, header := range headers {
		cell, _ := excelize.CoordinatesToCellName(1+idx, 3)
		if err := setCell(file, sheet, cell, header); err != nil {
			return err
		}
	}
	_ = file.SetCellStyle(sheet, "A3", "G3", styles.TableHeader)

	row := 4
	for _, device := range data.Devices {
		for _, result := range device.CheckResults {
			values := []interface{}{
				device.DeviceName,
				result.CheckItemName,
				result.CheckItemType,
				result.Status,
				result.ExpectedValue,
				result.ActualValue,
				result.ExecutionTime,
			}
			for idx, value := range values {
				cell, _ := excelize.CoordinatesToCellName(1+idx, row)
				if err := setCell(file, sheet, cell, value); err != nil {
					return err
				}
				if idx == 3 {
					status := strings.ToLower(strings.TrimSpace(result.Status))
					switch status {
					case "pass", "success", "completed":
						_ = file.SetCellStyle(sheet, cell, cell, styles.Success)
					case "warning":
						_ = file.SetCellStyle(sheet, cell, cell, styles.Warning)
					case "fail", "error":
						_ = file.SetCellStyle(sheet, cell, cell, styles.Error)
					}
				}
			}
			row++
		}
	}
	_ = file.SetColWidth(sheet, "A", "A", 15)
	_ = file.SetColWidth(sheet, "B", "B", 20)
	_ = file.SetColWidth(sheet, "C", "C", 12)
	_ = file.SetColWidth(sheet, "D", "D", 10)
	_ = file.SetColWidth(sheet, "E", "E", 15)
	_ = file.SetColWidth(sheet, "F", "F", 15)
	_ = file.SetColWidth(sheet, "G", "G", 12)
	return nil
}

func writeInspectionChartSheet(file *excelize.File, sheet string, data InspectionReportData, styles excelReportStyles) error {
	if err := setCell(file, sheet, "A1", "巡检结果图表分析"); err != nil {
		return err
	}
	if err := file.MergeCell(sheet, "A1", "F1"); err == nil {
		_ = file.SetCellStyle(sheet, "A1", "F1", styles.Title)
	}
	if err := setCell(file, sheet, "A3", "检查结果状态分布"); err != nil {
		return err
	}
	_ = file.SetCellStyle(sheet, "A3", "A3", styles.Section)
	if err := setCell(file, sheet, "A4", "状态"); err != nil {
		return err
	}
	if err := setCell(file, sheet, "B4", "数量"); err != nil {
		return err
	}
	_ = file.SetCellStyle(sheet, "A4", "B4", styles.TableHeader)
	if err := setCell(file, sheet, "A5", "通过"); err != nil {
		return err
	}
	if err := setCell(file, sheet, "B5", data.SummaryStats.PassedChecks); err != nil {
		return err
	}
	if err := setCell(file, sheet, "A6", "失败"); err != nil {
		return err
	}
	if err := setCell(file, sheet, "B6", data.SummaryStats.FailedChecks); err != nil {
		return err
	}
	if err := setCell(file, sheet, "A7", "警告"); err != nil {
		return err
	}
	if err := setCell(file, sheet, "B7", data.SummaryStats.WarningChecks); err != nil {
		return err
	}
	if err := setCell(file, sheet, "A8", "错误"); err != nil {
		return err
	}
	if err := setCell(file, sheet, "B8", data.SummaryStats.ErrorChecks); err != nil {
		return err
	}
	chart := excelize.Chart{
		Type: excelize.Col,
		Series: []excelize.ChartSeries{
			{
				Name:       fmt.Sprintf("%s!$B$4", sheet),
				Categories: fmt.Sprintf("%s!$A$5:$A$8", sheet),
				Values:     fmt.Sprintf("%s!$B$5:$B$8", sheet),
			},
		},
		Title:  []excelize.RichTextRun{{Text: "检查结果状态分布"}},
		Legend: excelize.ChartLegend{Position: "none"},
	}
	_ = file.AddChart(sheet, "D4", &chart)
	return nil
}

func writeStatisticsExcel(path string, data StatisticsReportData) error {
	file := excelize.NewFile()
	overviewSheet := "统计概览"
	file.SetSheetName("Sheet1", overviewSheet)

	distributionSheet := "设备分布"
	performanceSheet := "性能统计"
	topSheet := "TOP设备"
	chartSheet := "数据图表"

	if _, err := file.NewSheet(distributionSheet); err != nil {
		return err
	}
	if _, err := file.NewSheet(performanceSheet); err != nil {
		return err
	}
	if _, err := file.NewSheet(topSheet); err != nil {
		return err
	}
	if _, err := file.NewSheet(chartSheet); err != nil {
		return err
	}

	styles, err := newExcelReportStyles(file)
	if err != nil {
		return err
	}

	if err := writeStatisticsOverviewSheet(file, overviewSheet, data, styles); err != nil {
		return err
	}
	if err := writeStatisticsDistributionSheet(file, distributionSheet, data, styles); err != nil {
		return err
	}
	if err := writeStatisticsPerformanceSheet(file, performanceSheet, data, styles); err != nil {
		return err
	}
	if err := writeStatisticsTopSheet(file, topSheet, data, styles); err != nil {
		return err
	}
	if err := writeStatisticsChartSheet(file, chartSheet, data, styles); err != nil {
		return err
	}

	if index, err := file.GetSheetIndex(overviewSheet); err == nil {
		file.SetActiveSheet(index)
	}
	return file.SaveAs(path)
}

func writeStatisticsOverviewSheet(file *excelize.File, sheet string, data StatisticsReportData, styles excelReportStyles) error {
	title := normalizeReportTitle(data.Title, "统计报表")
	if err := setCell(file, sheet, "A1", title); err != nil {
		return err
	}
	if err := file.MergeCell(sheet, "A1", "D1"); err == nil {
		_ = file.SetCellStyle(sheet, "A1", "D1", styles.Title)
	}
	if err := setCell(file, sheet, "A3", "基本统计"); err != nil {
		return err
	}
	_ = file.SetCellStyle(sheet, "A3", "A3", styles.Section)

	rows := []struct {
		Label string
		Value interface{}
	}{
		{"设备总数", fmt.Sprintf("%d", data.Overview.TotalDevices)},
		{"在线设备", fmt.Sprintf("%d", data.Overview.ActiveDevices)},
		{"离线设备", fmt.Sprintf("%d", data.Overview.OfflineDevices)},
		{"告警设备", fmt.Sprintf("%d", data.Overview.WarningDevices)},
		{"故障设备", fmt.Sprintf("%d", data.Overview.ErrorDevices)},
		{"平均正常运行时间", formatHours(data.Overview.AvgUptimeHours)},
		{"总巡检次数", fmt.Sprintf("%d", data.Overview.TotalExecutions)},
		{"平均健康评分", formatFloat(data.Overview.AvgScore, 1)},
	}

	for idx, row := range rows {
		rowIndex := 4 + idx
		if err := setCell(file, sheet, fmt.Sprintf("A%d", rowIndex), row.Label); err != nil {
			return err
		}
		_ = file.SetCellStyle(sheet, fmt.Sprintf("A%d", rowIndex), fmt.Sprintf("A%d", rowIndex), styles.Section)
		if err := setCell(file, sheet, fmt.Sprintf("B%d", rowIndex), row.Value); err != nil {
			return err
		}
	}

	_ = file.SetColWidth(sheet, "A", "A", 25)
	_ = file.SetColWidth(sheet, "B", "B", 20)
	return nil
}

func writeStatisticsDistributionSheet(file *excelize.File, sheet string, data StatisticsReportData, styles excelReportStyles) error {
	if err := setCell(file, sheet, "A1", "设备分布统计"); err != nil {
		return err
	}
	if err := file.MergeCell(sheet, "A1", "C1"); err == nil {
		_ = file.SetCellStyle(sheet, "A1", "C1", styles.Title)
	}
	if err := setCell(file, sheet, "A3", "按类型分布"); err != nil {
		return err
	}
	_ = file.SetCellStyle(sheet, "A3", "A3", styles.Section)

	typeHeaders := []string{"设备类型", "数量", "占比"}
	for idx, header := range typeHeaders {
		cell, _ := excelize.CoordinatesToCellName(1+idx, 4)
		if err := setCell(file, sheet, cell, header); err != nil {
			return err
		}
	}
	_ = file.SetCellStyle(sheet, "A4", "C4", styles.TableHeader)

	byType := data.Distribution.ByType
	if byType == nil {
		byType = map[string]int{}
	}
	keys := orderedKeysByPreference(byType, []string{"switch", "router", "firewall", "server"})
	total := 0
	for _, key := range keys {
		total += byType[key]
	}
	row := 5
	for _, key := range keys {
		count := byType[key]
		values := []interface{}{key, count, formatPercentByTotal(count, total)}
		for idx, value := range values {
			cell, _ := excelize.CoordinatesToCellName(1+idx, row)
			if err := setCell(file, sheet, cell, value); err != nil {
				return err
			}
		}
		row++
	}

	if err := setCell(file, sheet, "A11", "按位置分布"); err != nil {
		return err
	}
	_ = file.SetCellStyle(sheet, "A11", "A11", styles.Section)
	locationHeaders := []string{"设备类型", "数量", "占比"}
	for idx, header := range locationHeaders {
		cell, _ := excelize.CoordinatesToCellName(1+idx, 12)
		if err := setCell(file, sheet, cell, header); err != nil {
			return err
		}
	}
	_ = file.SetCellStyle(sheet, "A12", "C12", styles.TableHeader)

	byLocation := data.Distribution.ByLocation
	if byLocation == nil {
		byLocation = map[string]int{}
	}
	locationKeys := orderedKeysByPreference(byLocation, []string{"数据中心", "总部", "分支机构"})
	locationTotal := 0
	for _, key := range locationKeys {
		locationTotal += byLocation[key]
	}
	row = 13
	for _, key := range locationKeys {
		count := byLocation[key]
		values := []interface{}{key, count, formatPercentByTotal(count, locationTotal)}
		for idx, value := range values {
			cell, _ := excelize.CoordinatesToCellName(1+idx, row)
			if err := setCell(file, sheet, cell, value); err != nil {
				return err
			}
		}
		row++
	}
	_ = file.SetColWidth(sheet, "A", "A", 20)
	_ = file.SetColWidth(sheet, "B", "B", 15)
	_ = file.SetColWidth(sheet, "C", "C", 15)
	return nil
}

func writeStatisticsPerformanceSheet(file *excelize.File, sheet string, data StatisticsReportData, styles excelReportStyles) error {
	if err := setCell(file, sheet, "A1", "设备性能统计"); err != nil {
		return err
	}
	if err := file.MergeCell(sheet, "A1", "E1"); err == nil {
		_ = file.SetCellStyle(sheet, "A1", "E1", styles.Title)
	}
	headers := []string{"设备名称", "CPU使用率", "内存使用率", "可用性", "健康评分"}
	for idx, header := range headers {
		cell, _ := excelize.CoordinatesToCellName(1+idx, 3)
		if err := setCell(file, sheet, cell, header); err != nil {
			return err
		}
	}
	_ = file.SetCellStyle(sheet, "A3", "E3", styles.TableHeader)

	row := 4
	for _, item := range data.Performance.ByDevice {
		values := []interface{}{
			item.DeviceName,
			formatPercent(item.Metrics.CPUUsage, 1),
			formatPercent(item.Metrics.MemoryUsage, 1),
			formatPercent(item.Metrics.Availability, 1),
			formatFloat(item.Metrics.HealthScore, 1),
		}
		for idx, value := range values {
			cell, _ := excelize.CoordinatesToCellName(1+idx, row)
			if err := setCell(file, sheet, cell, value); err != nil {
				return err
			}
		}
		row++
	}
	for col := 'A'; col <= 'E'; col++ {
		_ = file.SetColWidth(sheet, string(col), string(col), 18)
	}
	return nil
}

func writeStatisticsTopSheet(file *excelize.File, sheet string, data StatisticsReportData, styles excelReportStyles) error {
	if err := setCell(file, sheet, "A1", "TOP 10 性能设备"); err != nil {
		return err
	}
	if err := file.MergeCell(sheet, "A1", "D1"); err == nil {
		_ = file.SetCellStyle(sheet, "A1", "D1", styles.Title)
	}
	headers := []string{"排名", "设备名称", "设备类型", "性能评分"}
	for idx, header := range headers {
		cell, _ := excelize.CoordinatesToCellName(1+idx, 3)
		if err := setCell(file, sheet, cell, header); err != nil {
			return err
		}
	}
	_ = file.SetCellStyle(sheet, "A3", "D3", styles.TableHeader)

	row := 4
	for idx, item := range data.TopDevices {
		values := []interface{}{idx + 1, item.DeviceName, item.DeviceType, formatFloat(item.Score, 2)}
		for col, value := range values {
			cell, _ := excelize.CoordinatesToCellName(1+col, row)
			if err := setCell(file, sheet, cell, value); err != nil {
				return err
			}
		}
		row++
	}
	_ = file.SetColWidth(sheet, "A", "A", 10)
	_ = file.SetColWidth(sheet, "B", "B", 25)
	_ = file.SetColWidth(sheet, "C", "C", 15)
	_ = file.SetColWidth(sheet, "D", "D", 15)
	return nil
}

func writeStatisticsChartSheet(file *excelize.File, sheet string, data StatisticsReportData, styles excelReportStyles) error {
	if err := setCell(file, sheet, "A1", "统计图表"); err != nil {
		return err
	}
	if err := file.MergeCell(sheet, "A1", "F1"); err == nil {
		_ = file.SetCellStyle(sheet, "A1", "F1", styles.Title)
	}
	if err := setCell(file, sheet, "A3", "设备类型分布"); err != nil {
		return err
	}
	_ = file.SetCellStyle(sheet, "A3", "A3", styles.Section)
	if err := setCell(file, sheet, "A4", "类型"); err != nil {
		return err
	}
	if err := setCell(file, sheet, "B4", "数量"); err != nil {
		return err
	}
	_ = file.SetCellStyle(sheet, "A4", "B4", styles.TableHeader)

	byType := data.Distribution.ByType
	if byType == nil {
		byType = map[string]int{}
	}
	keys := orderedKeysByPreference(byType, []string{"switch", "router", "firewall", "server"})
	row := 5
	for _, key := range keys {
		values := []interface{}{key, byType[key]}
		for idx, value := range values {
			cell, _ := excelize.CoordinatesToCellName(1+idx, row)
			if err := setCell(file, sheet, cell, value); err != nil {
				return err
			}
		}
		row++
	}
	if len(keys) > 0 {
		endRow := 4 + len(keys)
		chart := excelize.Chart{
			Type: excelize.Col,
			Series: []excelize.ChartSeries{
				{
					Name:       fmt.Sprintf("%s!$B$4", sheet),
					Categories: fmt.Sprintf("%s!$A$5:$A$%d", sheet, endRow),
					Values:     fmt.Sprintf("%s!$B$5:$B$%d", sheet, endRow),
				},
			},
			Title:  []excelize.RichTextRun{{Text: "设备类型分布"}},
			Legend: excelize.ChartLegend{Position: "none"},
		}
		_ = file.AddChart(sheet, "D4", &chart)
	}
	return nil
}

func writeDeviceSummaryExcel(path string, data DeviceSummaryData) error {
	file := excelize.NewFile()
	sheet := "设备汇总"
	file.SetSheetName("Sheet1", sheet)

	styles, err := newExcelReportStyles(file)
	if err != nil {
		return err
	}

	now := time.Now().Format("2006-01-02 15:04:05")
	if strings.TrimSpace(data.GeneratedTimestamp) != "" {
		now = strings.TrimSpace(data.GeneratedTimestamp)
	}

	if err := setCell(file, sheet, "A1", "设备汇总报表"); err != nil {
		return err
	}
	_ = file.SetCellStyle(sheet, "A1", "A1", styles.Title)
	if err := setCell(file, sheet, "A2", fmt.Sprintf("生成时间: %s", now)); err != nil {
		return err
	}
	if err := setCell(file, sheet, "A4", "设备概览统计"); err != nil {
		return err
	}
	_ = file.SetCellStyle(sheet, "A4", "A4", styles.Section)

	headers := []string{"统计项", "数值", "占比"}
	for idx, header := range headers {
		cell, _ := excelize.CoordinatesToCellName(1+idx, 5)
		if err := setCell(file, sheet, cell, header); err != nil {
			return err
		}
	}
	_ = file.SetCellStyle(sheet, "A5", "C5", styles.TableHeader)

	rows := []struct {
		Label string
		Value int
	}{
		{"设备总数", data.Total},
		{"在线设备", data.Online},
		{"离线设备", data.Offline},
		{"告警设备", data.Warning},
	}

	row := 6
	for _, item := range rows {
		if err := setCell(file, sheet, fmt.Sprintf("A%d", row), item.Label); err != nil {
			return err
		}
		if err := setCell(file, sheet, fmt.Sprintf("B%d", row), item.Value); err != nil {
			return err
		}
		percent := "0%"
		if data.Total > 0 {
			percent = "100%"
		}
		if item.Label != "设备总数" {
			percent = formatPercentByTotal(item.Value, data.Total)
		}
		if err := setCell(file, sheet, fmt.Sprintf("C%d", row), percent); err != nil {
			return err
		}
		row++
	}

	if err := setCell(file, sheet, "A10", "设备详情列表"); err != nil {
		return err
	}
	_ = file.SetCellStyle(sheet, "A10", "A10", styles.Section)
	deviceHeaders := []string{"设备名称", "IP地址", "设备类型", "状态", "位置"}
	for idx, header := range deviceHeaders {
		cell, _ := excelize.CoordinatesToCellName(1+idx, 11)
		if err := setCell(file, sheet, cell, header); err != nil {
			return err
		}
	}
	_ = file.SetCellStyle(sheet, "A11", "E11", styles.TableHeader)

	row = 12
	for _, device := range data.Devices {
		values := []interface{}{device.Name, device.IP, device.DeviceType, device.Status, device.Location}
		for idx, value := range values {
			cell, _ := excelize.CoordinatesToCellName(1+idx, row)
			if err := setCell(file, sheet, cell, value); err != nil {
				return err
			}
		}
		row++
	}

	if index, err := file.GetSheetIndex(sheet); err == nil {
		file.SetActiveSheet(index)
	}
	_ = file.SetColWidth(sheet, "A", "A", 20)
	_ = file.SetColWidth(sheet, "B", "B", 15)
	_ = file.SetColWidth(sheet, "C", "C", 15)
	_ = file.SetColWidth(sheet, "D", "D", 12)
	_ = file.SetColWidth(sheet, "E", "E", 20)
	return file.SaveAs(path)
}

func writeGenericExcel(path string, data GenericReportData) error {
	file := excelize.NewFile()
	sheet := "报表"
	file.SetSheetName("Sheet1", sheet)

	styles, err := newExcelReportStyles(file)
	if err != nil {
		return err
	}

	now := time.Now().Format("2006-01-02 15:04:05")
	if strings.TrimSpace(data.GeneratedTimestamp) != "" {
		now = strings.TrimSpace(data.GeneratedTimestamp)
	}
	title := resolveGenericReportTitle(data.ReportType, data.ReportTitle, data.ReportName)
	reportName := normalizeReportTitle(data.ReportName, title)
	if err := setCell(file, sheet, "A1", title); err != nil {
		return err
	}
	_ = file.SetCellStyle(sheet, "A1", "A1", styles.Title)
	if err := setCell(file, sheet, "A2", fmt.Sprintf("生成时间: %s", now)); err != nil {
		return err
	}

	row := 4
	entries := [][]string{
		{"report_name", reportName},
		{"range", data.Range},
		{"generated_by", data.GeneratedBy},
		{"summary", formatSummaryValue(data.Summary)},
	}
	if data.Notes != "" {
		entries = append(entries, []string{"notes", data.Notes})
	}

	sortedExtra := sortedKeys(data.Extra)
	for _, key := range sortedExtra {
		entries = append(entries, []string{key, formatValueForReport(data.Extra[key])})
	}

	for _, entry := range entries {
		if err := setCell(file, sheet, fmt.Sprintf("A%d", row), entry[0]); err != nil {
			return err
		}
		if err := setCell(file, sheet, fmt.Sprintf("B%d", row), entry[1]); err != nil {
			return err
		}
		row++
	}

	if index, err := file.GetSheetIndex(sheet); err == nil {
		file.SetActiveSheet(index)
	}
	return file.SaveAs(path)
}

func setCell(file *excelize.File, sheet string, cell string, value interface{}) error {
	return file.SetCellValue(sheet, cell, value)
}
