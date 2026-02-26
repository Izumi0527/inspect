package reports

import (
	"bytes"
	"fmt"
	"html/template"
	"os"
	"strings"
	"time"
)

func writeInspectionReport(path string, format string, data InspectionReportData) (string, error) {
	switch format {
	case "excel":
		return path, writeInspectionExcel(path, data)
	case "html":
		return path, writeInspectionHTML(path, data)
	case "word":
		return path, writeInspectionWord(path, data)
	case "pdf":
		fallthrough
	default:
		return path, writeInspectionPDF(path, data)
	}
}

func writeStatisticsReport(path string, format string, data StatisticsReportData) (string, error) {
	switch format {
	case "excel":
		return path, writeStatisticsExcel(path, data)
	case "html":
		return path, writeStatisticsHTML(path, data)
	case "word":
		return path, writeStatisticsWord(path, data)
	case "pdf":
		fallthrough
	default:
		return path, writeStatisticsPDF(path, data)
	}
}

func writeDeviceSummaryReport(path string, format string, data DeviceSummaryData) (string, error) {
	switch format {
	case "excel":
		return path, writeDeviceSummaryExcel(path, data)
	case "html":
		return path, writeDeviceSummaryHTML(path, data)
	case "word":
		return path, writeDeviceSummaryWord(path, data)
	case "pdf":
		fallthrough
	default:
		return path, writeDeviceSummaryPDF(path, data)
	}
}

func writeGenericReport(path string, format string, data GenericReportData) (string, error) {
	switch format {
	case "excel":
		return path, writeGenericExcel(path, data)
	case "html":
		return path, writeGenericHTML(path, data)
	case "word":
		return path, writeGenericWord(path, data)
	case "pdf":
		fallthrough
	default:
		return path, writeGenericPDF(path, data)
	}
}

type inspectionHTMLView struct {
	InspectionName    string
	InspectionID      string
	InspectionTime    string
	DeviceCount       int
	ExecutionDuration int
	SummaryStats      InspectionSummaryStats
	PassRateColor     string
	Devices           []inspectionHTMLDevice
	GeneratedAt       string
}

type inspectionHTMLDevice struct {
	DeviceName  string
	IPAddress   string
	DeviceType  string
	Status      string
	StatusClass string
	PassRate    float64
	IssueCount  int
}

type statisticsHTMLView struct {
	Title       string
	Overview    StatisticsOverview
	Rows        []statisticsHTMLRow
	GeneratedAt string
}

type statisticsHTMLRow struct {
	DeviceType string
	Count      int
	Percent    string
}

var inspectionHTMLTpl = template.Must(template.New("inspection").Parse(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>巡检报告 - {{.InspectionName}}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Microsoft YaHei', Arial, sans-serif;
            background: #f5f7fa;
            padding: 20px;
            line-height: 1.6;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2c3e50;
            text-align: center;
            padding-bottom: 10px;
            border-bottom: 3px solid #3498db;
            margin-bottom: 30px;
        }
        h2 {
            color: #34495e;
            margin: 30px 0 15px 0;
            padding-bottom: 8px;
            border-bottom: 2px solid #ecf0f1;
        }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
            margin-bottom: 25px;
        }
        .info-item {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #3498db;
        }
        .info-label {
            font-weight: bold;
            color: #7f8c8d;
            font-size: 0.9em;
            margin-bottom: 5px;
        }
        .info-value {
            color: #2c3e50;
            font-size: 1.1em;
        }
        .stats-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        .stat-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .stat-card.success { background: linear-gradient(135deg, #4caf50 0%, #45a049 100%); }
        .stat-card.warning { background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%); }
        .stat-card.error { background: linear-gradient(135deg, #f44336 0%, #e53935 100%); }
        .stat-card .value {
            font-size: 2.5em;
            font-weight: bold;
            margin: 10px 0;
        }
        .stat-card .label {
            font-size: 0.9em;
            opacity: 0.9;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ecf0f1;
        }
        th {
            background: #3498db;
            color: white;
            font-weight: 600;
        }
        tr:hover {
            background: #f8f9fa;
        }
        .status-badge {
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.85em;
            font-weight: 600;
        }
        .status-online { background: #d4edda; color: #155724; }
        .status-warning { background: #fff3cd; color: #856404; }
        .status-error { background: #f8d7da; color: #721c24; }
        .status-offline { background: #e2e3e5; color: #383d41; }
        .progress-bar {
            width: 100%;
            height: 24px;
            background: #ecf0f1;
            border-radius: 12px;
            overflow: hidden;
            margin: 10px 0;
        }
        .progress-fill {
            height: 100%;
            background: {{.PassRateColor}};
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 0.9em;
            transition: width 0.3s ease;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ecf0f1;
            color: #7f8c8d;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 网络设备巡检报告</h1>
        <p style="text-align: center; color: #7f8c8d; margin-bottom: 30px;">
            {{.InspectionName}}
        </p>
        <h2>📋 基本信息</h2>
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">巡检ID</div>
                <div class="info-value">{{.InspectionID}}</div>
            </div>
            <div class="info-item">
                <div class="info-label">巡检时间</div>
                <div class="info-value">{{.InspectionTime}}</div>
            </div>
            <div class="info-item">
                <div class="info-label">设备总数</div>
                <div class="info-value">{{.DeviceCount}}</div>
            </div>
            <div class="info-item">
                <div class="info-label">执行时长</div>
                <div class="info-value">{{.ExecutionDuration}} 秒</div>
            </div>
        </div>
        <h2>📊 统计摘要</h2>
        <div class="stats-cards">
            <div class="stat-card">
                <div class="label">总检查项</div>
                <div class="value">{{.SummaryStats.TotalChecks}}</div>
            </div>
            <div class="stat-card success">
                <div class="label">通过</div>
                <div class="value">{{.SummaryStats.PassedChecks}}</div>
            </div>
            <div class="stat-card warning">
                <div class="label">警告</div>
                <div class="value">{{.SummaryStats.WarningChecks}}</div>
            </div>
            <div class="stat-card error">
                <div class="label">失败</div>
                <div class="value">{{.SummaryStats.FailedChecks}}</div>
            </div>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: {{printf "%.1f" .SummaryStats.PassRate}}%;">
                通过率: {{printf "%.1f" .SummaryStats.PassRate}}%
            </div>
        </div>
        <h2>🖥️ 设备详情</h2>
        <table>
            <thead>
                <tr>
                    <th>设备名称</th>
                    <th>IP地址</th>
                    <th>设备类型</th>
                    <th>状态</th>
                    <th>通过率</th>
                    <th>问题数量</th>
                </tr>
            </thead>
            <tbody>
                {{range .Devices}}
                <tr>
                    <td><strong>{{.DeviceName}}</strong></td>
                    <td>{{.IPAddress}}</td>
                    <td>{{.DeviceType}}</td>
                    <td><span class="status-badge {{.StatusClass}}">{{.Status}}</span></td>
                    <td>{{printf "%.1f" .PassRate}}%</td>
                    <td>{{.IssueCount}}</td>
                </tr>
                {{end}}
            </tbody>
        </table>
        <div class="footer">
            <p>此报告由网络设备巡检系统自动生成</p>
            <p>生成时间: {{.GeneratedAt}}</p>
        </div>
    </div>
</body>
</html>`))

var statisticsHTMLTpl = template.Must(template.New("statistics").Parse(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{.Title}}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Microsoft YaHei', Arial, sans-serif;
            background: #f5f7fa;
            padding: 20px;
            line-height: 1.6;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2c3e50;
            text-align: center;
            padding-bottom: 10px;
            border-bottom: 3px solid #3498db;
            margin-bottom: 30px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }
        .stat-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
        }
        .stat-card .value {
            font-size: 2em;
            font-weight: bold;
            margin: 10px 0;
        }
        .stat-card .label {
            font-size: 0.9em;
            opacity: 0.9;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ecf0f1;
        }
        th {
            background: #3498db;
            color: white;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            color: #7f8c8d;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>{{.Title}}</h1>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="label">设备总数</div>
                <div class="value">{{.Overview.TotalDevices}}</div>
            </div>
            <div class="stat-card">
                <div class="label">在线设备</div>
                <div class="value">{{.Overview.ActiveDevices}}</div>
            </div>
            <div class="stat-card">
                <div class="label">离线设备</div>
                <div class="value">{{.Overview.OfflineDevices}}</div>
            </div>
            <div class="stat-card">
                <div class="label">平均评分</div>
                <div class="value">{{printf "%.1f" .Overview.AvgScore}}</div>
            </div>
        </div>

        <h2>设备类型分布</h2>
        <table>
            <thead>
                <tr>
                    <th>设备类型</th>
                    <th>数量</th>
                    <th>占比</th>
                </tr>
            </thead>
            <tbody>
                {{range .Rows}}
                <tr>
                    <td>{{.DeviceType}}</td>
                    <td>{{.Count}}</td>
                    <td>{{.Percent}}</td>
                </tr>
                {{end}}
            </tbody>
        </table>

        <div class="footer">
            <p>此报告由网络设备巡检系统自动生成</p>
            <p>生成时间: {{.GeneratedAt}}</p>
        </div>
    </div>
</body>
</html>`))

func writeInspectionHTML(path string, data InspectionReportData) error {
	view := buildInspectionHTMLView(data)
	buf := &bytes.Buffer{}
	if err := inspectionHTMLTpl.Execute(buf, view); err != nil {
		return err
	}
	return os.WriteFile(path, buf.Bytes(), 0o644)
}

func writeStatisticsHTML(path string, data StatisticsReportData) error {
	view := buildStatisticsHTMLView(data)
	buf := &bytes.Buffer{}
	if err := statisticsHTMLTpl.Execute(buf, view); err != nil {
		return err
	}
	return os.WriteFile(path, buf.Bytes(), 0o644)
}

func writeDeviceSummaryHTML(path string, data DeviceSummaryData) error {
	rows := make([]string, 0, len(data.Devices))
	for _, device := range data.Devices {
		rows = append(rows, fmt.Sprintf("<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>",
			escapeHTML(device.Name), escapeHTML(device.IP), escapeHTML(device.DeviceType), escapeHTML(device.Status), escapeHTML(device.Location)))
	}
	content := fmt.Sprintf(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>设备汇总报表</title></head><body><h1>设备汇总报表</h1><p>设备总数: %d</p><p>在线设备: %d</p><p>离线设备: %d</p><p>告警设备: %d</p><table border="1" cellpadding="4" cellspacing="0"><tr><th>设备名称</th><th>IP地址</th><th>设备类型</th><th>状态</th><th>位置</th></tr>%s</table></body></html>`,
		data.Total, data.Online, data.Offline, data.Warning, strings.Join(rows, ""))
	return os.WriteFile(path, []byte(content), 0o644)
}

func writeGenericHTML(path string, data GenericReportData) error {
	rows := make([]string, 0, len(data.Extra)+4)
	rows = append(rows, htmlRow("report_name", data.ReportName))
	rows = append(rows, htmlRow("range", data.Range))
	rows = append(rows, htmlRow("generated_by", data.GeneratedBy))
	rows = append(rows, htmlRow("summary", formatSummaryValue(data.Summary)))
	if data.Notes != "" {
		rows = append(rows, htmlRow("notes", data.Notes))
	}
	keys := sortedKeys(data.Extra)
	for _, key := range keys {
		rows = append(rows, htmlRow(key, formatValueForReport(data.Extra[key])))
	}
	title := resolveGenericReportTitle(data.ReportType, data.ReportTitle, data.ReportName)
	content := fmt.Sprintf("<!DOCTYPE html><html lang=\"zh-CN\"><head><meta charset=\"UTF-8\"><title>%s</title></head><body><h1>%s</h1><table border=\"1\" cellpadding=\"4\" cellspacing=\"0\">%s</table></body></html>",
		escapeHTML(title), escapeHTML(title), strings.Join(rows, ""))
	return os.WriteFile(path, []byte(content), 0o644)
}

func buildInspectionHTMLView(data InspectionReportData) inspectionHTMLView {
	devices := make([]inspectionHTMLDevice, 0, len(data.Devices))
	for _, device := range data.Devices {
		devices = append(devices, inspectionHTMLDevice{
			DeviceName:  device.DeviceName,
			IPAddress:   device.IPAddress,
			DeviceType:  device.DeviceType,
			Status:      device.InspectionStatus,
			StatusClass: statusClass(device.InspectionStatus),
			PassRate:    device.PassRate,
			IssueCount:  device.IssueCount,
		})
	}
	generatedAt := data.GeneratedTimestamp
	if generatedAt == "" {
		generatedAt = data.InspectionTime
	}
	if generatedAt == "" {
		generatedAt = time.Now().Format("2006-01-02 15:04:05")
	}
	return inspectionHTMLView{
		InspectionName:    data.InspectionName,
		InspectionID:      data.InspectionID,
		InspectionTime:    data.InspectionTime,
		DeviceCount:       len(data.Devices),
		ExecutionDuration: data.ExecutionDuration,
		SummaryStats:      data.SummaryStats,
		PassRateColor:     passRateColor(data.SummaryStats.PassRate),
		Devices:           devices,
		GeneratedAt:       generatedAt,
	}
}

func buildStatisticsHTMLView(data StatisticsReportData) statisticsHTMLView {
	total := 0
	for _, count := range data.Distribution.ByType {
		total += count
	}
	rows := make([]statisticsHTMLRow, 0, len(data.Distribution.ByType))
	keys := orderedKeysByPreference(data.Distribution.ByType, []string{"switch", "router", "firewall", "server"})
	for _, deviceType := range keys {
		count := data.Distribution.ByType[deviceType]
		percent := 0.0
		if total > 0 {
			percent = float64(count) / float64(total) * 100
		}
		rows = append(rows, statisticsHTMLRow{
			DeviceType: deviceType,
			Count:      count,
			Percent:    fmt.Sprintf("%.1f%%", percent),
		})
	}
	generatedAt := data.GeneratedTimestamp
	if generatedAt == "" {
		generatedAt = time.Now().Format("2006-01-02 15:04:05")
	}
	return statisticsHTMLView{
		Title:       data.Title,
		Overview:    data.Overview,
		Rows:        rows,
		GeneratedAt: generatedAt,
	}
}

func statusClass(status string) string {
	status = strings.ToLower(strings.TrimSpace(status))
	switch {
	case strings.Contains(status, "completed") || strings.Contains(status, "success"):
		return "status-online"
	case strings.Contains(status, "warning"):
		return "status-warning"
	case strings.Contains(status, "fail") || strings.Contains(status, "error"):
		return "status-error"
	case strings.Contains(status, "offline"):
		return "status-offline"
	default:
		return "status-offline"
	}
}

func passRateColor(rate float64) string {
	switch {
	case rate >= 90:
		return "#4caf50"
	case rate >= 70:
		return "#ff9800"
	default:
		return "#f44336"
	}
}

func escapeHTML(value string) string {
	replacer := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;")
	return replacer.Replace(value)
}

func htmlRow(key string, value string) string {
	return fmt.Sprintf("<tr><td>%s</td><td>%s</td></tr>", escapeHTML(key), escapeHTML(value))
}
