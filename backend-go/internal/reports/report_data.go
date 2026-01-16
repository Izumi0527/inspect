package reports

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
)

type InspectionReportData struct {
	InspectionName     string
	InspectionID       string
	InspectionTime     string
	Status             string
	ExecutionDuration  int
	SummaryStats       InspectionSummaryStats
	Devices            []InspectionDeviceData
	GeneratedTimestamp string
}

type InspectionSummaryStats struct {
	TotalChecks   int
	PassedChecks  int
	FailedChecks  int
	WarningChecks int
	ErrorChecks   int
	PassRate      float64
}

type InspectionDeviceData struct {
	DeviceName         string
	IPAddress          string
	DeviceType         string
	Vendor             string
	Model              string
	SoftwareVersion    string
	Uptime             string
	LastInspectionTime string
	InspectionStatus   string
	PassRate           float64
	IssueCount         int
	Performance        InspectionPerformanceMetrics
	CheckResults       []InspectionCheckResult
}

type InspectionPerformanceMetrics struct {
	CPUUsage         float64
	MemoryUsage      float64
	ActiveInterfaces int
	TotalInterfaces  int
}

type InspectionCheckResult struct {
	CheckItemName string
	CheckItemType string
	Status        string
	ExpectedValue string
	ActualValue   string
	ExecutionTime int
}

type StatisticsReportData struct {
	Title              string
	GeneratedTimestamp string
	Overview           StatisticsOverview
	Distribution       DeviceDistribution
	Performance        PerformanceStats
	TopDevices         []TopDevice
}

type StatisticsOverview struct {
	TotalDevices    int
	ActiveDevices   int
	OfflineDevices  int
	WarningDevices  int
	ErrorDevices    int
	AvgUptimeHours  float64
	TotalExecutions int
	AvgScore        float64
}

type DeviceDistribution struct {
	ByType     map[string]int
	ByLocation map[string]int
}

type PerformanceStats struct {
	ByDevice []PerformanceDeviceStats
}

type PerformanceDeviceStats struct {
	DeviceName string
	Metrics    PerformanceDeviceMetrics
}

type PerformanceDeviceMetrics struct {
	CPUUsage     float64
	MemoryUsage  float64
	Availability float64
	HealthScore  float64
}

type TopDevice struct {
	DeviceName string
	DeviceType string
	Score      float64
}

type DeviceSummaryData struct {
	Total              int
	Online             int
	Offline            int
	Warning            int
	Devices            []DeviceSummaryItem
	GeneratedTimestamp string
}

type DeviceSummaryItem struct {
	Name       string
	IP         string
	DeviceType string
	Status     string
	Location   string
}

type GenericReportData struct {
	ReportType         string
	ReportTitle        string
	ReportName         string
	Range              string
	GeneratedBy        string
	GeneratedTimestamp string
	Summary            map[string]interface{}
	Notes              string
	Extra              map[string]interface{}
}

func buildInspectionReportData(ctx context.Context, db *gorm.DB, report Report, params map[string]interface{}) (InspectionReportData, error) {
	payload := findPayload(params, "inspection_data", "report_data")
	if len(payload) > 0 {
		return parseInspectionReportPayload(payload), nil
	}
	return buildInspectionReportDataFromDB(ctx, db, report, params)
}

func buildStatisticsReportData(ctx context.Context, db *gorm.DB, report Report, params map[string]interface{}) (StatisticsReportData, error) {
	payload := findPayload(params, "statistics_data", "report_data")
	if len(payload) > 0 {
		return parseStatisticsReportPayload(payload, report.Title), nil
	}
	return buildStatisticsReportDataFromDB(ctx, db, report, params)
}

func buildDeviceSummaryData(ctx context.Context, db *gorm.DB, report Report, params map[string]interface{}) (DeviceSummaryData, error) {
	payload := findPayload(params, "device_summary", "summary_data", "report_data")
	if len(payload) > 0 {
		data := parseDeviceSummaryPayload(payload)
		if strings.TrimSpace(data.GeneratedTimestamp) == "" {
			data.GeneratedTimestamp = reportGeneratedTimestamp(report)
		}
		return data, nil
	}
	data, err := buildDeviceSummaryFromDB(ctx, db, params)
	if err != nil {
		return data, err
	}
	if strings.TrimSpace(data.GeneratedTimestamp) == "" {
		data.GeneratedTimestamp = reportGeneratedTimestamp(report)
	}
	return data, nil
}

func buildGenericReportData(report Report, params map[string]interface{}) GenericReportData {
	payload := findPayload(params, "generic_data", "report_data")
	if len(payload) == 0 {
		data := defaultGenericReportData(report)
		if strings.TrimSpace(data.GeneratedTimestamp) == "" {
			data.GeneratedTimestamp = reportGeneratedTimestamp(report)
		}
		return data
	}
	data := parseGenericReportPayload(payload, report)
	data.ReportTitle = resolveGenericReportTitle(report.ReportType, report.Title, data.ReportName)
	if strings.TrimSpace(data.GeneratedTimestamp) == "" {
		data.GeneratedTimestamp = reportGeneratedTimestamp(report)
	}
	return data
}

func parseInspectionReportPayload(payload map[string]interface{}) InspectionReportData {
	data := InspectionReportData{
		InspectionName: toString(payload["inspection_name"]),
		InspectionID:   toString(payload["inspection_id"]),
		InspectionTime: toString(payload["inspection_time"]),
		Status:         toString(payload["status"]),
	}
	data.ExecutionDuration = toInt(payload["execution_duration"])
	data.GeneratedTimestamp = toString(payload["generated_at"])

	stats := toMap(payload["summary_stats"])
	data.SummaryStats = InspectionSummaryStats{
		TotalChecks:   toInt(stats["total_checks"]),
		PassedChecks:  toInt(stats["passed_checks"]),
		FailedChecks:  toInt(stats["failed_checks"]),
		WarningChecks: toInt(stats["warning_checks"]),
		ErrorChecks:   toInt(stats["error_checks"]),
		PassRate:      toFloat(stats["pass_rate"]),
	}
	if data.SummaryStats.PassRate == 0 && data.SummaryStats.TotalChecks > 0 {
		data.SummaryStats.PassRate = float64(data.SummaryStats.PassedChecks) / float64(data.SummaryStats.TotalChecks) * 100
	}

	devicesRaw := toSlice(payload["devices"])
	devices := make([]InspectionDeviceData, 0, len(devicesRaw))
	for _, raw := range devicesRaw {
		deviceMap := toMap(raw)
		perf := toMap(deviceMap["performance_metrics"])
		device := InspectionDeviceData{
			DeviceName:         toString(deviceMap["device_name"]),
			IPAddress:          toString(deviceMap["ip_address"]),
			DeviceType:         toString(deviceMap["device_type"]),
			Vendor:             toString(deviceMap["vendor"]),
			Model:              toString(deviceMap["model"]),
			SoftwareVersion:    toString(deviceMap["software_version"]),
			Uptime:             toString(deviceMap["uptime"]),
			LastInspectionTime: toString(deviceMap["last_inspection"]),
			InspectionStatus:   toString(deviceMap["inspection_status"]),
			PassRate:           toFloat(deviceMap["pass_rate"]),
			IssueCount:         toInt(deviceMap["issue_count"]),
			Performance: InspectionPerformanceMetrics{
				CPUUsage:         toFloat(perf["cpu_usage"]),
				MemoryUsage:      toFloat(perf["memory_usage"]),
				ActiveInterfaces: toInt(perf["active_interfaces"]),
				TotalInterfaces:  toInt(perf["total_interfaces"]),
			},
		}

		checkResultsRaw := toSlice(deviceMap["check_results"])
		for _, item := range checkResultsRaw {
			resultMap := toMap(item)
			device.CheckResults = append(device.CheckResults, InspectionCheckResult{
				CheckItemName: toString(resultMap["check_item_name"]),
				CheckItemType: toString(resultMap["check_item_type"]),
				Status:        toString(resultMap["status"]),
				ExpectedValue: toString(resultMap["expected_value"]),
				ActualValue:   toString(resultMap["actual_value"]),
				ExecutionTime: toInt(resultMap["execution_time"]),
			})
		}

		if device.IssueCount == 0 && len(device.CheckResults) > 0 {
			issueCount := 0
			for _, result := range device.CheckResults {
				if !strings.EqualFold(result.Status, "pass") {
					issueCount++
				}
			}
			device.IssueCount = issueCount
		}
		if device.PassRate == 0 && len(device.CheckResults) > 0 {
			passed := 0
			for _, result := range device.CheckResults {
				if strings.EqualFold(result.Status, "pass") {
					passed++
				}
			}
			device.PassRate = float64(passed) / float64(len(device.CheckResults)) * 100
		}
		devices = append(devices, device)
	}
	data.Devices = devices
	return data
}

func parseStatisticsReportPayload(payload map[string]interface{}, fallbackTitle string) StatisticsReportData {
	title := toString(payload["title"])
	if title == "" {
		title = toString(payload["report_title"])
	}
	if title == "" {
		title = fallbackTitle
	}
	data := StatisticsReportData{
		Title:              title,
		GeneratedTimestamp: toString(payload["generated_at"]),
	}

	overview := toMap(payload["overview"])
	data.Overview = StatisticsOverview{
		TotalDevices:    toInt(overview["total_devices"]),
		ActiveDevices:   toInt(overview["active_devices"]),
		OfflineDevices:  toInt(overview["offline_devices"]),
		WarningDevices:  toInt(overview["warning_devices"]),
		ErrorDevices:    toInt(overview["error_devices"]),
		AvgUptimeHours:  toFloat(overview["avg_uptime"]),
		TotalExecutions: toInt(overview["total_executions"]),
		AvgScore:        toFloat(overview["avg_score"]),
	}

	distribution := toMap(payload["device_distribution"])
	data.Distribution = DeviceDistribution{
		ByType:     toIntMap(distribution["by_type"]),
		ByLocation: toIntMap(distribution["by_location"]),
	}

	performance := toMap(payload["performance_stats"])
	byDeviceRaw := toSlice(performance["by_device"])
	byDevice := make([]PerformanceDeviceStats, 0, len(byDeviceRaw))
	for _, item := range byDeviceRaw {
		itemMap := toMap(item)
		metrics := toMap(itemMap["metrics"])
		byDevice = append(byDevice, PerformanceDeviceStats{
			DeviceName: toString(itemMap["device_name"]),
			Metrics: PerformanceDeviceMetrics{
				CPUUsage:     toFloat(metrics["cpu_usage"]),
				MemoryUsage:  toFloat(metrics["memory_usage"]),
				Availability: toFloat(metrics["availability"]),
				HealthScore:  toFloat(metrics["health_score"]),
			},
		})
	}
	data.Performance = PerformanceStats{ByDevice: byDevice}

	topRaw := toSlice(toMap(payload["top_devices"])["by_performance"])
	topDevices := make([]TopDevice, 0, len(topRaw))
	for _, item := range topRaw {
		itemMap := toMap(item)
		topDevices = append(topDevices, TopDevice{
			DeviceName: toString(itemMap["device_name"]),
			DeviceType: toString(itemMap["device_type"]),
			Score:      toFloat(itemMap["score"]),
		})
	}
	data.TopDevices = topDevices
	return data
}

func parseDeviceSummaryPayload(payload map[string]interface{}) DeviceSummaryData {
	generatedAt := toString(payload["generated_at"])
	if generatedAt == "" {
		generatedAt = toString(payload["generatedAt"])
	}
	data := DeviceSummaryData{
		Total:              toInt(payload["total"]),
		Online:             toInt(payload["online"]),
		Offline:            toInt(payload["offline"]),
		Warning:            toInt(payload["warning"]),
		GeneratedTimestamp: generatedAt,
	}
	devicesRaw := toSlice(payload["devices"])
	devices := make([]DeviceSummaryItem, 0, len(devicesRaw))
	for _, item := range devicesRaw {
		itemMap := toMap(item)
		devices = append(devices, DeviceSummaryItem{
			Name:       toString(itemMap["name"]),
			IP:         toString(itemMap["ip"]),
			DeviceType: toString(itemMap["device_type"]),
			Status:     toString(itemMap["status"]),
			Location:   toString(itemMap["location"]),
		})
	}
	data.Devices = devices
	return data
}

func parseGenericReportPayload(payload map[string]interface{}, report Report) GenericReportData {
	generatedAt := toString(payload["generated_at"])
	if generatedAt == "" {
		generatedAt = toString(payload["generatedAt"])
	}
	data := GenericReportData{
		ReportType:         report.ReportType,
		ReportName:         toString(payload["report_name"]),
		Range:              toString(payload["range"]),
		GeneratedBy:        toString(payload["generated_by"]),
		GeneratedTimestamp: generatedAt,
		Notes:              toString(payload["notes"]),
	}
	if data.ReportName == "" {
		data.ReportName = report.Title
	}
	if data.GeneratedBy == "" && report.GeneratedBy != nil {
		data.GeneratedBy = *report.GeneratedBy
	}
	data.ReportTitle = resolveGenericReportTitle(report.ReportType, report.Title, data.ReportName)
	data.Summary = toMap(payload["summary"])
	data.Extra = map[string]interface{}{}
	for key, value := range payload {
		switch key {
		case "report_name", "range", "generated_by", "generated_at", "generatedAt", "summary", "notes":
			continue
		default:
			data.Extra[key] = value
		}
	}
	return data
}

func buildInspectionReportDataFromDB(ctx context.Context, db *gorm.DB, report Report, params map[string]interface{}) (InspectionReportData, error) {
	result := defaultInspectionReportData(report)
	if db == nil {
		return result, fmt.Errorf("database not initialized")
	}

	start, end := resolveReportRange(report, params)
	if start.IsZero() || end.IsZero() {
		now := time.Now().UTC()
		start = now.Add(-24 * time.Hour)
		end = now
	}

	deviceIDs := parseIDList(params["device_ids"])
	if len(deviceIDs) == 0 {
		deviceIDs = parseIDList(params["devices"])
	}

	type inspectionRow struct {
		ID            int        `gorm:"column:id"`
		DeviceID      int        `gorm:"column:device_id"`
		Name          *string    `gorm:"column:name"`
		Status        *string    `gorm:"column:status"`
		Duration      *int       `gorm:"column:duration"`
		CompletedAt   *time.Time `gorm:"column:completed_at"`
		CreatedAt     *time.Time `gorm:"column:created_at"`
		TotalChecks   *int       `gorm:"column:total_checks"`
		PassedChecks  *int       `gorm:"column:passed_checks"`
		FailedChecks  *int       `gorm:"column:failed_checks"`
		WarningChecks *int       `gorm:"column:warning_checks"`
		DeviceName    *string    `gorm:"column:device_name"`
		IPAddress     *string    `gorm:"column:ip_address"`
		DeviceType    *string    `gorm:"column:device_type"`
		Vendor        *string    `gorm:"column:vendor"`
		Model         *string    `gorm:"column:model"`
		Version       *string    `gorm:"column:firmware_version"`
		Uptime        *int       `gorm:"column:uptime"`
		CPUUsage      *float64   `gorm:"column:cpu_usage"`
		MemoryUsage   *float64   `gorm:"column:memory_usage"`
	}

	query := db.WithContext(ctx).
		Table("inspections AS i").
		Select(`i.id, i.device_id, i.name, i.status, i.duration, i.completed_at, i.created_at,
		        i.total_checks, i.passed_checks, i.failed_checks, i.warning_checks,
		        d.name AS device_name, d.ip_address, d.device_type, d.vendor, d.model,
		        d.firmware_version, d.uptime, d.cpu_usage, d.memory_usage`).
		Joins("LEFT JOIN devices d ON d.id = i.device_id").
		Where("(i.completed_at BETWEEN ? AND ?) OR (i.created_at BETWEEN ? AND ?)", start, end, start, end)

	if len(deviceIDs) > 0 {
		query = query.Where("i.device_id IN ?", deviceIDs)
	}

	rows := make([]inspectionRow, 0)
	if err := query.Order("COALESCE(i.completed_at, i.created_at) DESC").Find(&rows).Error; err != nil {
		return result, err
	}
	if len(rows) == 0 {
		result.InspectionTime = end.Format("2006-01-02 15:04:05")
		result.GeneratedTimestamp = result.InspectionTime
		return result, nil
	}

	inspectionIDs := make([]int, 0, len(rows))
	for _, row := range rows {
		inspectionIDs = append(inspectionIDs, row.ID)
	}

	type ifaceRow struct {
		DeviceID int `gorm:"column:device_id"`
		Active   int `gorm:"column:active"`
		Total    int `gorm:"column:total"`
	}
	ifaceStats := map[int]ifaceRow{}
	if len(deviceIDs) > 0 {
		ifaceRows := make([]ifaceRow, 0)
		if err := db.WithContext(ctx).
			Table("device_interfaces").
			Select("device_id, SUM(CASE WHEN is_up THEN 1 ELSE 0 END) AS active, COUNT(*) AS total").
			Where("device_id IN ?", deviceIDs).
			Group("device_id").
			Scan(&ifaceRows).Error; err == nil {
			for _, row := range ifaceRows {
				ifaceStats[row.DeviceID] = row
			}
		}
	}

	type resultRow struct {
		InspectionID int     `gorm:"column:inspection_id"`
		Name         string  `gorm:"column:check_item_name"`
		Type         string  `gorm:"column:check_item_type"`
		Status       string  `gorm:"column:status"`
		Expected     *string `gorm:"column:expected_value"`
		Actual       *string `gorm:"column:actual_value"`
		Execution    *int    `gorm:"column:execution_time"`
	}
	results := make([]resultRow, 0)
	_ = db.WithContext(ctx).
		Table("inspection_results").
		Select("inspection_id, check_item_name, check_item_type, status, expected_value, actual_value, execution_time").
		Where("inspection_id IN ?", inspectionIDs).
		Order("inspection_id, id").
		Scan(&results).Error

	resultsByInspection := make(map[int][]InspectionCheckResult)
	for _, row := range results {
		result := InspectionCheckResult{
			CheckItemName: row.Name,
			CheckItemType: row.Type,
			Status:        row.Status,
			ExpectedValue: defaultStringPtr(row.Expected),
			ActualValue:   defaultStringPtr(row.Actual),
			ExecutionTime: defaultIntPtr(row.Execution),
		}
		resultsByInspection[row.InspectionID] = append(resultsByInspection[row.InspectionID], result)
	}

	latestByDevice := map[int]inspectionRow{}
	latestTimeByDevice := map[int]time.Time{}
	for _, row := range rows {
		inspectedAt := coalesceTime(row.CompletedAt, row.CreatedAt)
		if inspectedAt.IsZero() {
			inspectedAt = start
		}
		if prev, ok := latestTimeByDevice[row.DeviceID]; !ok || inspectedAt.After(prev) {
			latestByDevice[row.DeviceID] = row
			latestTimeByDevice[row.DeviceID] = inspectedAt
		}
	}

	deviceIDsUnique := make([]int, 0, len(latestByDevice))
	for deviceID := range latestByDevice {
		deviceIDsUnique = append(deviceIDsUnique, deviceID)
	}
	sort.Ints(deviceIDsUnique)

	summary := InspectionSummaryStats{}
	errorChecks := 0
	for _, row := range rows {
		summary.TotalChecks += defaultIntPtr(row.TotalChecks)
		summary.PassedChecks += defaultIntPtr(row.PassedChecks)
		summary.FailedChecks += defaultIntPtr(row.FailedChecks)
		summary.WarningChecks += defaultIntPtr(row.WarningChecks)
	}
	for _, items := range resultsByInspection {
		for _, item := range items {
			if strings.EqualFold(item.Status, "error") {
				errorChecks++
			}
		}
	}
	summary.ErrorChecks = errorChecks
	if summary.TotalChecks > 0 {
		summary.PassRate = float64(summary.PassedChecks) / float64(summary.TotalChecks) * 100
	}
	result.SummaryStats = summary

	devices := make([]InspectionDeviceData, 0, len(latestByDevice))
	for _, deviceID := range deviceIDsUnique {
		row := latestByDevice[deviceID]
		inspectedAt := latestTimeByDevice[deviceID]
		checks := resultsByInspection[row.ID]
		issueCount := 0
		for _, item := range checks {
			if !strings.EqualFold(item.Status, "pass") {
				issueCount++
			}
		}
		totalChecks := defaultIntPtr(row.TotalChecks)
		passRate := 0.0
		if totalChecks > 0 {
			passRate = float64(defaultIntPtr(row.PassedChecks)) / float64(totalChecks) * 100
		} else if len(checks) > 0 {
			passed := 0
			for _, item := range checks {
				if strings.EqualFold(item.Status, "pass") {
					passed++
				}
			}
			passRate = float64(passed) / float64(len(checks)) * 100
		}

		iface := ifaceStats[deviceID]
		devices = append(devices, InspectionDeviceData{
			DeviceName:         defaultStringPtr(row.DeviceName),
			IPAddress:          defaultStringPtr(row.IPAddress),
			DeviceType:         defaultStringPtr(row.DeviceType),
			Vendor:             defaultStringPtr(row.Vendor),
			Model:              defaultStringPtr(row.Model),
			SoftwareVersion:    defaultStringPtr(row.Version),
			Uptime:             formatUptimeSeconds(row.Uptime),
			LastInspectionTime: inspectedAt.Format("2006-01-02 15:04:05"),
			InspectionStatus:   defaultStringPtr(row.Status),
			PassRate:           passRate,
			IssueCount:         issueCount,
			Performance: InspectionPerformanceMetrics{
				CPUUsage:         defaultFloatPtr(row.CPUUsage),
				MemoryUsage:      defaultFloatPtr(row.MemoryUsage),
				ActiveInterfaces: iface.Active,
				TotalInterfaces:  iface.Total,
			},
			CheckResults: checks,
		})
	}
	result.Devices = devices

	latestInspection := rows[0]
	inspectionName := report.Title
	if inspectionName == "" {
		inspectionName = defaultStringPtr(latestInspection.Name)
	}
	result.InspectionName = inspectionName
	result.InspectionID = fmt.Sprintf("INSP-%d", latestInspection.ID)
	inspectionTime := coalesceTime(latestInspection.CompletedAt, latestInspection.CreatedAt)
	if !inspectionTime.IsZero() {
		result.InspectionTime = inspectionTime.Format("2006-01-02 15:04:05")
	}
	result.Status = defaultStringPtr(latestInspection.Status)
	result.ExecutionDuration = defaultIntPtr(latestInspection.Duration)
	result.GeneratedTimestamp = result.InspectionTime
	return result, nil
}

func buildStatisticsReportDataFromDB(ctx context.Context, db *gorm.DB, report Report, params map[string]interface{}) (StatisticsReportData, error) {
	data := StatisticsReportData{
		Title: report.Title,
	}
	if db == nil {
		return data, fmt.Errorf("database not initialized")
	}
	start, end := resolveReportRange(report, params)
	if start.IsZero() || end.IsZero() {
		now := time.Now().UTC()
		start = now.AddDate(0, 0, -7)
		end = now
	}

	var totalDevices int64
	if err := db.WithContext(ctx).Table("devices").Count(&totalDevices).Error; err != nil {
		return data, err
	}

	type statusRow struct {
		Status string `gorm:"column:status"`
		Count  int    `gorm:"column:count"`
	}
	statusRows := make([]statusRow, 0)
	_ = db.WithContext(ctx).Table("devices").
		Select("status, COUNT(*) AS count").
		Group("status").
		Scan(&statusRows).Error

	statusCounts := map[string]int{}
	for _, row := range statusRows {
		statusCounts[row.Status] = row.Count
	}

	var avgUptime float64
	_ = db.WithContext(ctx).Table("devices").Select("AVG(uptime) AS avg_uptime").Scan(&avgUptime).Error

	var totalExecutions int64
	_ = db.WithContext(ctx).Table("inspections").Where("created_at BETWEEN ? AND ?", start, end).Count(&totalExecutions).Error

	var avgScore float64
	_ = db.WithContext(ctx).Table("inspections").Select("AVG(score) AS avg_score").Scan(&avgScore).Error

	overview := StatisticsOverview{
		TotalDevices:    int(totalDevices),
		ActiveDevices:   statusCounts["online"],
		OfflineDevices:  statusCounts["offline"],
		WarningDevices:  statusCounts["warning"],
		ErrorDevices:    statusCounts["error"],
		AvgUptimeHours:  avgUptime / 3600,
		TotalExecutions: int(totalExecutions),
		AvgScore:        avgScore,
	}

	type typeRow struct {
		DeviceType string `gorm:"column:device_type"`
		Count      int    `gorm:"column:count"`
	}
	typeRows := make([]typeRow, 0)
	_ = db.WithContext(ctx).Table("devices").
		Select("device_type, COUNT(*) AS count").
		Group("device_type").
		Scan(&typeRows).Error

	byType := map[string]int{}
	for _, row := range typeRows {
		if row.DeviceType != "" {
			byType[row.DeviceType] = row.Count
		}
	}

	type locationRow struct {
		Location string `gorm:"column:location"`
		Count    int    `gorm:"column:count"`
	}
	locationRows := make([]locationRow, 0)
	_ = db.WithContext(ctx).Table("devices").
		Select("location, COUNT(*) AS count").
		Where("location IS NOT NULL AND location <> ''").
		Group("location").
		Scan(&locationRows).Error

	byLocation := map[string]int{}
	for _, row := range locationRows {
		if row.Location != "" {
			byLocation[row.Location] = row.Count
		}
	}

	type perfRow struct {
		Name        string   `gorm:"column:name"`
		DeviceType  string   `gorm:"column:device_type"`
		Status      string   `gorm:"column:status"`
		CPUUsage    *float64 `gorm:"column:cpu_usage"`
		MemoryUsage *float64 `gorm:"column:memory_usage"`
	}
	perfRows := make([]perfRow, 0)
	_ = db.WithContext(ctx).Table("devices").
		Select("name, device_type, status, cpu_usage, memory_usage").
		Where("cpu_usage IS NOT NULL OR memory_usage IS NOT NULL").
		Limit(50).
		Scan(&perfRows).Error

	perfStats := make([]PerformanceDeviceStats, 0, len(perfRows))
	topCandidates := make([]TopDevice, 0, len(perfRows))
	for _, row := range perfRows {
		cpu := defaultFloatPtr(row.CPUUsage)
		mem := defaultFloatPtr(row.MemoryUsage)
		availability := availabilityFromStatus(row.Status)
		health := healthScoreFromUsage(cpu, mem)
		perfStats = append(perfStats, PerformanceDeviceStats{
			DeviceName: row.Name,
			Metrics: PerformanceDeviceMetrics{
				CPUUsage:     cpu,
				MemoryUsage:  mem,
				Availability: availability,
				HealthScore:  health,
			},
		})
		if health > 0 {
			topCandidates = append(topCandidates, TopDevice{
				DeviceName: row.Name,
				DeviceType: row.DeviceType,
				Score:      health,
			})
		}
	}

	sort.Slice(topCandidates, func(i, j int) bool {
		return topCandidates[i].Score > topCandidates[j].Score
	})
	if len(topCandidates) > 10 {
		topCandidates = topCandidates[:10]
	}

	data.Overview = overview
	data.Distribution = DeviceDistribution{
		ByType:     byType,
		ByLocation: byLocation,
	}
	data.Performance = PerformanceStats{ByDevice: perfStats}
	data.TopDevices = topCandidates
	data.GeneratedTimestamp = end.Format("2006-01-02 15:04:05")
	if data.Title == "" {
		data.Title = "统计报表"
	}
	return data, nil
}

func buildDeviceSummaryFromDB(ctx context.Context, db *gorm.DB, params map[string]interface{}) (DeviceSummaryData, error) {
	data := DeviceSummaryData{}
	if db == nil {
		return data, fmt.Errorf("database not initialized")
	}
	deviceIDs := parseIDList(params["device_ids"])
	if len(deviceIDs) == 0 {
		deviceIDs = parseIDList(params["devices"])
	}

	type deviceRow struct {
		Name       string  `gorm:"column:name"`
		IPAddress  string  `gorm:"column:ip_address"`
		DeviceType string  `gorm:"column:device_type"`
		Status     string  `gorm:"column:status"`
		Location   *string `gorm:"column:location"`
	}

	query := db.WithContext(ctx).Table("devices").Select("name, ip_address, device_type, status, location")
	if len(deviceIDs) > 0 {
		query = query.Where("id IN ?", deviceIDs)
	}
	rows := make([]deviceRow, 0)
	if err := query.Order("id").Scan(&rows).Error; err != nil {
		return data, err
	}

	for _, row := range rows {
		data.Total++
		switch strings.ToLower(strings.TrimSpace(row.Status)) {
		case "online":
			data.Online++
		case "warning":
			data.Warning++
		case "offline":
			data.Offline++
		default:
		}
		data.Devices = append(data.Devices, DeviceSummaryItem{
			Name:       row.Name,
			IP:         row.IPAddress,
			DeviceType: row.DeviceType,
			Status:     row.Status,
			Location:   defaultStringPtr(row.Location),
		})
	}

	return data, nil
}

func defaultInspectionReportData(report Report) InspectionReportData {
	now := time.Now().UTC()
	title := report.Title
	if title == "" {
		title = "巡检报告"
	}
	inspectionTime := now.Format("2006-01-02 15:04:05")
	if !report.EndDate.IsZero() {
		inspectionTime = report.EndDate.Format("2006-01-02 15:04:05")
	}
	return InspectionReportData{
		InspectionName:     title,
		InspectionTime:     inspectionTime,
		Status:             report.Status,
		GeneratedTimestamp: inspectionTime,
		SummaryStats:       InspectionSummaryStats{},
		Devices:            []InspectionDeviceData{},
	}
}

func defaultGenericReportData(report Report) GenericReportData {
	name := strings.TrimSpace(report.Title)
	if name == "" {
		name = report.ReportType
	}
	rangeValue := formatRange(report.StartDate, report.EndDate)
	generatedBy := ""
	if report.GeneratedBy != nil {
		generatedBy = *report.GeneratedBy
	}
	title := resolveGenericReportTitle(report.ReportType, report.Title, name)
	return GenericReportData{
		ReportType:         report.ReportType,
		ReportTitle:        title,
		ReportName:         name,
		Range:              rangeValue,
		GeneratedBy:        generatedBy,
		GeneratedTimestamp: reportGeneratedTimestamp(report),
		Summary:            map[string]interface{}{},
		Notes:              "",
		Extra:              map[string]interface{}{},
	}
}

func resolveGenericReportTitle(reportType string, reportTitle string, reportName string) string {
	if strings.TrimSpace(reportTitle) != "" {
		return strings.TrimSpace(reportTitle)
	}
	normalized := strings.ToLower(strings.TrimSpace(reportType))
	switch normalized {
	case "inspection_report":
		return "巡检结果报表"
	case "alert_report", "alert", "alert_summary":
		return "告警统计报表"
	case "performance_report", "performance":
		return "性能分析报表"
	case "device_summary", "availability", "device_status":
		return "设备汇总报表"
	}
	if strings.TrimSpace(reportName) != "" {
		return strings.TrimSpace(reportName)
	}
	if normalized != "" {
		return reportType
	}
	return "报表"
}

func reportGeneratedTimestamp(report Report) string {
	if report.GeneratedAt != nil && !report.GeneratedAt.IsZero() {
		return report.GeneratedAt.UTC().Format("2006-01-02 15:04:05")
	}
	if !report.EndDate.IsZero() {
		return report.EndDate.Format("2006-01-02 15:04:05")
	}
	if !report.StartDate.IsZero() {
		return report.StartDate.Format("2006-01-02 15:04:05")
	}
	if report.UpdatedAt != nil && !report.UpdatedAt.IsZero() {
		return report.UpdatedAt.UTC().Format("2006-01-02 15:04:05")
	}
	if report.CreatedAt != nil && !report.CreatedAt.IsZero() {
		return report.CreatedAt.UTC().Format("2006-01-02 15:04:05")
	}
	return ""
}

func findPayload(params map[string]interface{}, keys ...string) map[string]interface{} {
	for _, key := range keys {
		if value := toMap(params[key]); len(value) > 0 {
			return value
		}
	}
	custom := toMap(params["custom_config"])
	for _, key := range keys {
		if value := toMap(custom[key]); len(value) > 0 {
			return value
		}
	}
	return map[string]interface{}{}
}

func resolveReportRange(report Report, params map[string]interface{}) (time.Time, time.Time) {
	start := report.StartDate
	end := report.EndDate
	if start.IsZero() || end.IsZero() {
		rangeMap := toMap(params["dateRange"])
		if len(rangeMap) == 0 {
			rangeMap = toMap(params["date_range"])
		}
		if len(rangeMap) > 0 {
			if parsed := parseTime(toString(rangeMap["startDate"])); !parsed.IsZero() {
				start = parsed
			}
			if parsed := parseTime(toString(rangeMap["start_date"])); !parsed.IsZero() {
				start = parsed
			}
			if parsed := parseTime(toString(rangeMap["endDate"])); !parsed.IsZero() {
				end = parsed
			}
			if parsed := parseTime(toString(rangeMap["end_date"])); !parsed.IsZero() {
				end = parsed
			}
		}
	}
	return start, end
}

func parseTime(value string) time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed
	}
	if parsed, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return parsed
	}
	if parsed, err := time.Parse("2006-01-02 15:04:05", value); err == nil {
		return parsed
	}
	if parsed, err := time.Parse("2006-01-02", value); err == nil {
		return parsed
	}
	return time.Time{}
}

func parseIDList(value interface{}) []int {
	raw := toSlice(value)
	ids := make([]int, 0, len(raw))
	for _, item := range raw {
		switch v := item.(type) {
		case int:
			ids = append(ids, v)
		case int64:
			ids = append(ids, int(v))
		case float64:
			ids = append(ids, int(v))
		case string:
			if parsed := toInt(v); parsed > 0 {
				ids = append(ids, parsed)
			}
		}
	}
	return ids
}

func availabilityFromStatus(status string) float64 {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "online":
		return 99.9
	case "warning":
		return 95
	case "offline":
		return 0
	case "error":
		return 80
	default:
		return 0
	}
}

func healthScoreFromUsage(cpu float64, mem float64) float64 {
	if cpu <= 0 && mem <= 0 {
		return 0
	}
	value := 100 - (cpu+mem)/2
	if value < 0 {
		return 0
	}
	if value > 100 {
		return 100
	}
	return value
}

func formatRange(start time.Time, end time.Time) string {
	if start.IsZero() || end.IsZero() {
		return ""
	}
	return fmt.Sprintf("%s ~ %s", start.Format("2006-01-02"), end.Format("2006-01-02"))
}

func formatUptimeSeconds(value *int) string {
	if value == nil || *value <= 0 {
		return ""
	}
	seconds := *value
	days := seconds / 86400
	hours := (seconds % 86400) / 3600
	if days > 0 {
		return fmt.Sprintf("%d days", days)
	}
	if hours > 0 {
		return fmt.Sprintf("%d hours", hours)
	}
	return fmt.Sprintf("%d seconds", seconds)
}

func coalesceTime(times ...*time.Time) time.Time {
	for _, item := range times {
		if item != nil && !item.IsZero() {
			return item.UTC()
		}
	}
	return time.Time{}
}

func toMap(value interface{}) map[string]interface{} {
	if value == nil {
		return map[string]interface{}{}
	}
	if result, ok := value.(map[string]interface{}); ok {
		return result
	}
	return map[string]interface{}{}
}

func toSlice(value interface{}) []interface{} {
	if value == nil {
		return []interface{}{}
	}
	if result, ok := value.([]interface{}); ok {
		return result
	}
	return []interface{}{}
}

func toString(value interface{}) string {
	if value == nil {
		return ""
	}
	switch v := value.(type) {
	case string:
		return v
	case []byte:
		return string(v)
	case fmt.Stringer:
		return v.String()
	case float64:
		return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.2f", v), "0"), ".")
	case int:
		return fmt.Sprintf("%d", v)
	case int64:
		return fmt.Sprintf("%d", v)
	case bool:
		if v {
			return "true"
		}
		return "false"
	default:
		return fmt.Sprintf("%v", v)
	}
}

func toInt(value interface{}) int {
	if value == nil {
		return 0
	}
	switch v := value.(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	case string:
		parsed, _ := strconv.Atoi(strings.TrimSpace(v))
		return parsed
	}
	return 0
}

func toFloat(value interface{}) float64 {
	if value == nil {
		return 0
	}
	switch v := value.(type) {
	case float64:
		return v
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case string:
		parsed, _ := strconv.ParseFloat(strings.TrimSpace(v), 64)
		return parsed
	}
	return 0
}

func toIntMap(value interface{}) map[string]int {
	raw := toMap(value)
	result := map[string]int{}
	for key, item := range raw {
		result[key] = toInt(item)
	}
	return result
}

func defaultStringPtr(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func defaultIntPtr(value *int) int {
	if value == nil {
		return 0
	}
	return *value
}

func defaultFloatPtr(value *float64) float64 {
	if value == nil {
		return 0
	}
	return *value
}
