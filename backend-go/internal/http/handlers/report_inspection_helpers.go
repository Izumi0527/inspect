package handlers

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"
)

type inspectionReportFilters struct {
	Start       time.Time
	End         time.Time
	DeviceIDs   []int
	StrategyIDs []int
	GroupBy     string
}

type inspectionRow struct {
	ID           int             `gorm:"column:id"`
	DeviceID     int             `gorm:"column:device_id"`
	Status       string          `gorm:"column:status"`
	Duration     sql.NullInt64   `gorm:"column:duration"`
	TotalChecks  sql.NullInt64   `gorm:"column:total_checks"`
	PassedChecks sql.NullInt64   `gorm:"column:passed_checks"`
	FailedChecks sql.NullInt64   `gorm:"column:failed_checks"`
	WarningChecks sql.NullInt64  `gorm:"column:warning_checks"`
	StartedAt    *time.Time      `gorm:"column:started_at"`
	CompletedAt  *time.Time      `gorm:"column:completed_at"`
	CreatedAt    *time.Time      `gorm:"column:created_at"`
}

type inspectionResultRow struct {
	ID             int            `gorm:"column:id"`
	InspectionID   int            `gorm:"column:inspection_id"`
	CheckItemName  string         `gorm:"column:check_item_name"`
	CheckItemType  string         `gorm:"column:check_item_type"`
	Status         string         `gorm:"column:status"`
	Message        sql.NullString `gorm:"column:message"`
	ExpectedValue  sql.NullString `gorm:"column:expected_value"`
	ActualValue    sql.NullString `gorm:"column:actual_value"`
	CreatedAt      time.Time      `gorm:"column:created_at"`
}

type inspectionSummary struct {
	TotalDevices    int
	TotalExecutions int64
	TotalChecks     int64
	PassedChecks    int64
	FailedChecks    int64
	WarningChecks   int64
}

type inspectionDeviceInfo struct {
	ID           int             `gorm:"column:id"`
	Name         string          `gorm:"column:name"`
	DeviceType   string          `gorm:"column:device_type"`
	GroupName    sql.NullString  `gorm:"column:group_name"`
	Status       string          `gorm:"column:status"`
	Uptime       sql.NullInt64   `gorm:"column:uptime"`
	ResponseTime sql.NullFloat64 `gorm:"column:response_time"`
	CPUUsage     sql.NullFloat64 `gorm:"column:cpu_usage"`
	MemoryUsage  sql.NullFloat64 `gorm:"column:memory_usage"`
}

type metricSummary struct {
	Avg   float64
	Max   float64
	Count int64
}

type inspectionDeviceAggregate struct {
	DeviceID      int            `gorm:"column:device_id"`
	Executions    int64          `gorm:"column:executions"`
	TotalChecks   int64          `gorm:"column:total_checks"`
	PassedChecks  int64          `gorm:"column:passed_checks"`
	FailedChecks  int64          `gorm:"column:failed_checks"`
	WarningChecks int64          `gorm:"column:warning_checks"`
	AvgDuration   sql.NullFloat64 `gorm:"column:avg_duration"`
}

func parseInspectionReportFilters(payload map[string]interface{}) inspectionReportFilters {
	start, end := resolveDateRangeFromPayload(payload)
	if start.IsZero() || end.IsZero() {
		now := time.Now().UTC()
		end = now
		start = now.AddDate(0, 0, -30)
	}
	if start.After(end) {
		start, end = end, start
	}

	deviceIDs := parseIntSlice(payload["device_ids"])
	if len(deviceIDs) == 0 {
		deviceIDs = parseIntSlice(payload["devices"])
	}
	if len(deviceIDs) == 0 {
		deviceIDs = parseIntSlice(payload["deviceIds"])
	}

	strategyIDs := parseIntSlice(payload["strategy_ids"])
	if len(strategyIDs) == 0 {
		strategyIDs = parseIntSlice(payload["strategies"])
	}

	groupBy := normalizeGranularity(readString(payload, "group_by", "groupBy"))
	if strings.TrimSpace(groupBy) == "" {
		groupBy = "day"
	}

	return inspectionReportFilters{
		Start:       start,
		End:         end,
		DeviceIDs:   uniqueIntSlice(deviceIDs),
		StrategyIDs: uniqueIntSlice(strategyIDs),
		GroupBy:     groupBy,
	}
}

func loadInspectionRows(ctx context.Context, db *gorm.DB, filters inspectionReportFilters) ([]inspectionRow, error) {
	timeExpr := "COALESCE(completed_at, started_at, created_at)"
	query := db.WithContext(ctx).
		Table("inspections").
		Select(`id, device_id, status, duration, total_checks, passed_checks, failed_checks, warning_checks,
            started_at, completed_at, created_at`).
		Where(timeExpr+" >= ? AND "+timeExpr+" <= ?", filters.Start, filters.End)

	if len(filters.DeviceIDs) > 0 {
		query = query.Where("device_id IN ?", filters.DeviceIDs)
	}
	if len(filters.StrategyIDs) > 0 {
		query = query.Where("schedule_id IN ?", filters.StrategyIDs)
	}

	rows := make([]inspectionRow, 0)
	if err := query.Order(timeExpr + " DESC").Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func summarizeInspectionRows(rows []inspectionRow) (inspectionSummary, map[int]inspectionRow, map[int]time.Time) {
	summary := inspectionSummary{
		TotalExecutions: int64(len(rows)),
	}
	deviceSet := map[int]struct{}{}
	latestByDevice := map[int]inspectionRow{}
	latestTime := map[int]time.Time{}

	for _, row := range rows {
		deviceSet[row.DeviceID] = struct{}{}
		summary.TotalChecks += int64(row.TotalChecks.Int64)
		summary.PassedChecks += int64(row.PassedChecks.Int64)
		summary.FailedChecks += int64(row.FailedChecks.Int64)
		summary.WarningChecks += int64(row.WarningChecks.Int64)

		inspectedAt := inspectionRowTime(row)
		if prev, ok := latestTime[row.DeviceID]; !ok || inspectedAt.After(prev) {
			latestByDevice[row.DeviceID] = row
			latestTime[row.DeviceID] = inspectedAt
		}
	}

	summary.TotalDevices = len(deviceSet)
	return summary, latestByDevice, latestTime
}

func inspectionRowTime(row inspectionRow) time.Time {
	if row.CompletedAt != nil && !row.CompletedAt.IsZero() {
		return row.CompletedAt.UTC()
	}
	if row.StartedAt != nil && !row.StartedAt.IsZero() {
		return row.StartedAt.UTC()
	}
	if row.CreatedAt != nil {
		return row.CreatedAt.UTC()
	}
	return time.Time{}
}

func loadInspectionResults(ctx context.Context, db *gorm.DB, inspectionIDs []int) (map[int][]inspectionResultRow, error) {
	resultsByInspection := map[int][]inspectionResultRow{}
	if len(inspectionIDs) == 0 {
		return resultsByInspection, nil
	}

	rows := make([]inspectionResultRow, 0)
	if err := db.WithContext(ctx).
		Table("inspection_results").
		Select(`id, inspection_id, check_item_name, check_item_type, status,
            message, expected_value, actual_value, created_at`).
		Where("inspection_id IN ?", inspectionIDs).
		Order("inspection_id, id").
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	for _, row := range rows {
		resultsByInspection[row.InspectionID] = append(resultsByInspection[row.InspectionID], row)
	}
	return resultsByInspection, nil
}

func loadInspectionDeviceInfo(ctx context.Context, db *gorm.DB, deviceIDs []int) (map[int]inspectionDeviceInfo, error) {
	result := map[int]inspectionDeviceInfo{}
	if len(deviceIDs) == 0 {
		return result, nil
	}

	rows := make([]inspectionDeviceInfo, 0)
	if err := db.WithContext(ctx).
		Table("devices AS d").
		Select(`d.id, d.name, d.device_type, d.status, d.uptime, d.response_time,
            d.cpu_usage, d.memory_usage, g.name AS group_name`).
		Joins("LEFT JOIN device_groups g ON g.id = d.group_id").
		Where("d.id IN ?", deviceIDs).
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	for _, row := range rows {
		result[row.ID] = row
	}
	return result, nil
}

func queryMetricSummary(ctx context.Context, db *gorm.DB, metricName string, start time.Time, end time.Time, deviceIDs []int) (map[int]metricSummary, error) {
	result := map[int]metricSummary{}
	if len(deviceIDs) == 0 {
		return result, nil
	}

	type row struct {
		DeviceID int             `gorm:"column:device_id"`
		AvgValue sql.NullFloat64 `gorm:"column:avg_value"`
		MaxValue sql.NullFloat64 `gorm:"column:max_value"`
		Count    int64           `gorm:"column:sample_count"`
	}
	rows := make([]row, 0)
	if err := db.WithContext(ctx).
		Table("device_metrics").
		Select("device_id, AVG(metric_value) AS avg_value, MAX(metric_value) AS max_value, COUNT(*) AS sample_count").
		Where("metric_name = ?", metricName).
		Where("collected_at >= ? AND collected_at <= ?", start, end).
		Where("device_id IN ?", deviceIDs).
		Group("device_id").
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	for _, row := range rows {
		avg := 0.0
		if row.AvgValue.Valid {
			avg = row.AvgValue.Float64
		}
		max := 0.0
		if row.MaxValue.Valid {
			max = row.MaxValue.Float64
		}
		result[row.DeviceID] = metricSummary{Avg: avg, Max: max, Count: row.Count}
	}
	return result, nil
}

func queryMetricSummaryFallback(ctx context.Context, db *gorm.DB, metricNames []string, start time.Time, end time.Time, deviceIDs []int) (map[int]metricSummary, error) {
	result := map[int]metricSummary{}
	for _, name := range metricNames {
		summary, err := queryMetricSummary(ctx, db, name, start, end, deviceIDs)
		if err != nil {
			return nil, err
		}
		for deviceID, item := range summary {
			if item.Count == 0 {
				continue
			}
			if existing, ok := result[deviceID]; !ok || existing.Count == 0 {
				result[deviceID] = item
			}
		}
	}
	return result, nil
}

func queryInspectionAverageScore(ctx context.Context, db *gorm.DB, filters inspectionReportFilters) (float64, error) {
	type row struct {
		AvgScore sql.NullFloat64 `gorm:"column:avg_score"`
	}
	var result row
	timeExpr := "COALESCE(i.completed_at, i.started_at, i.created_at)"
	query := db.WithContext(ctx).
		Table("inspection_results AS r").
		Select("AVG(r.score) AS avg_score").
		Joins("JOIN inspections i ON i.id = r.inspection_id").
		Where("r.score IS NOT NULL").
		Where(timeExpr+" >= ? AND "+timeExpr+" <= ?", filters.Start, filters.End)
	if len(filters.DeviceIDs) > 0 {
		query = query.Where("i.device_id IN ?", filters.DeviceIDs)
	}
	if len(filters.StrategyIDs) > 0 {
		query = query.Where("i.schedule_id IN ?", filters.StrategyIDs)
	}
	if err := query.Scan(&result).Error; err != nil {
		return 0, err
	}
	if result.AvgScore.Valid {
		return result.AvgScore.Float64, nil
	}
	return 0, nil
}

func buildExecutionTrends(ctx context.Context, db *gorm.DB, filters inspectionReportFilters) ([]map[string]interface{}, error) {
	rows := make([]struct {
		Bucket       time.Time       `gorm:"column:bucket"`
		Total        int64           `gorm:"column:total"`
		Completed    int64           `gorm:"column:completed"`
		Failed       int64           `gorm:"column:failed"`
		AvgDuration  sql.NullFloat64 `gorm:"column:avg_duration"`
		DeviceCount  int64           `gorm:"column:device_count"`
		TotalChecks  int64           `gorm:"column:total_checks"`
		PassedChecks int64           `gorm:"column:passed_checks"`
	}, 0)

	timeExpr := bucketExpression(filters.GroupBy, "COALESCE(started_at, created_at)")
	selectExpr := fmt.Sprintf(`%s AS bucket,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
        AVG(duration) AS avg_duration,
        COUNT(DISTINCT device_id) AS device_count,
        COALESCE(SUM(total_checks),0) AS total_checks,
        COALESCE(SUM(passed_checks),0) AS passed_checks`, timeExpr)

	query := db.WithContext(ctx).
		Table("inspections").
		Select(selectExpr).
		Where("COALESCE(started_at, created_at) >= ? AND COALESCE(started_at, created_at) <= ?", filters.Start, filters.End)
	if len(filters.DeviceIDs) > 0 {
		query = query.Where("device_id IN ?", filters.DeviceIDs)
	}
	if len(filters.StrategyIDs) > 0 {
		query = query.Where("schedule_id IN ?", filters.StrategyIDs)
	}
	if err := query.Group("bucket").Order("bucket").Scan(&rows).Error; err != nil {
		return nil, err
	}

	trends := make([]map[string]interface{}, 0, len(rows))
	for _, row := range rows {
		avgDuration := 0.0
		if row.AvgDuration.Valid {
			avgDuration = row.AvgDuration.Float64
		}
		avgScore := 0.0
		if row.TotalChecks > 0 {
			avgScore = float64(row.PassedChecks) / float64(row.TotalChecks) * 100
		}
		trends = append(trends, map[string]interface{}{
			"date":                 row.Bucket.Format(time.RFC3339),
			"total_executions":     row.Total,
			"successful_executions": row.Completed,
			"failed_executions":    row.Failed,
			"avg_score":            roundFloat(avgScore, 2),
			"avg_duration":         roundFloat(avgDuration, 2),
			"device_count":         row.DeviceCount,
		})
	}
	return trends, nil
}

func buildProblemAnalysis(ctx context.Context, db *gorm.DB, filters inspectionReportFilters) ([]map[string]interface{}, error) {
	categoryCounts, err := queryIssueCounts(ctx, db, filters, filters.Start, filters.End)
	if err != nil {
		return nil, err
	}

	prevStart := filters.Start.Add(-filters.End.Sub(filters.Start))
	prevEnd := filters.Start
	prevCounts, err := queryIssueCounts(ctx, db, filters, prevStart, prevEnd)
	if err != nil {
		return nil, err
	}

	affectedDevices, err := queryAffectedDevices(ctx, db, filters)
	if err != nil {
		return nil, err
	}

	totalIssues := 0
	for _, count := range categoryCounts {
		totalIssues += count
	}

	type pair struct {
		Category string
		Count    int
	}
	pairs := make([]pair, 0, len(categoryCounts))
	for category, count := range categoryCounts {
		pairs = append(pairs, pair{Category: category, Count: count})
	}
	sort.Slice(pairs, func(i, j int) bool {
		return pairs[i].Count > pairs[j].Count
	})

	result := make([]map[string]interface{}, 0, len(pairs))
	for _, item := range pairs {
		percentage := 0.0
		if totalIssues > 0 {
			percentage = float64(item.Count) / float64(totalIssues) * 100
		}
		prev := prevCounts[item.Category]
		trend := "stable"
		if item.Count > prev {
			trend = "increasing"
		} else if item.Count < prev {
			trend = "decreasing"
		}

		result = append(result, map[string]interface{}{
			"category":         normalizeIssueCategory(item.Category),
			"count":            item.Count,
			"percentage":       roundFloat(percentage, 2),
			"severity":         issueSeverityFromCount(item.Count, totalIssues),
			"trend":            trend,
			"affected_devices": affectedDevices[item.Category],
			"description":      fmt.Sprintf("检查类别%s相关异常", normalizeIssueCategory(item.Category)),
		})
	}
	return result, nil
}

func queryIssueCounts(ctx context.Context, db *gorm.DB, filters inspectionReportFilters, start time.Time, end time.Time) (map[string]int, error) {
	type row struct {
		Category string `gorm:"column:category"`
		Count    int    `gorm:"column:count"`
	}
	rows := make([]row, 0)
	query := db.WithContext(ctx).
		Table("inspection_results AS r").
		Select("COALESCE(NULLIF(r.check_item_category, ''), NULLIF(r.check_item_type, ''), '其他') AS category, COUNT(*) AS count").
		Joins("JOIN inspections i ON i.id = r.inspection_id").
		Where("r.status IN ?", []string{"fail", "warning"}).
		Where("COALESCE(i.completed_at, i.started_at, i.created_at) >= ? AND COALESCE(i.completed_at, i.started_at, i.created_at) <= ?", start, end)
	if len(filters.DeviceIDs) > 0 {
		query = query.Where("i.device_id IN ?", filters.DeviceIDs)
	}
	if len(filters.StrategyIDs) > 0 {
		query = query.Where("i.schedule_id IN ?", filters.StrategyIDs)
	}
	if err := query.Group("category").Scan(&rows).Error; err != nil {
		return nil, err
	}

	result := map[string]int{}
	for _, row := range rows {
		result[row.Category] = row.Count
	}
	return result, nil
}

func queryAffectedDevices(ctx context.Context, db *gorm.DB, filters inspectionReportFilters) (map[string][]string, error) {
	type row struct {
		Category   string `gorm:"column:category"`
		DeviceName string `gorm:"column:device_name"`
	}
	rows := make([]row, 0)
	query := db.WithContext(ctx).
		Table("inspection_results AS r").
		Select("COALESCE(NULLIF(r.check_item_category, ''), NULLIF(r.check_item_type, ''), '其他') AS category, d.name AS device_name").
		Joins("JOIN inspections i ON i.id = r.inspection_id").
		Joins("JOIN devices d ON d.id = i.device_id").
		Where("r.status IN ?", []string{"fail", "warning"}).
		Where("COALESCE(i.completed_at, i.started_at, i.created_at) >= ? AND COALESCE(i.completed_at, i.started_at, i.created_at) <= ?", filters.Start, filters.End)
	if len(filters.DeviceIDs) > 0 {
		query = query.Where("i.device_id IN ?", filters.DeviceIDs)
	}
	if len(filters.StrategyIDs) > 0 {
		query = query.Where("i.schedule_id IN ?", filters.StrategyIDs)
	}
	if err := query.Scan(&rows).Error; err != nil {
		return nil, err
	}

	result := map[string][]string{}
	seen := map[string]map[string]struct{}{}
	for _, row := range rows {
		category := row.Category
		if _, ok := seen[category]; !ok {
			seen[category] = map[string]struct{}{}
		}
		if _, ok := seen[category][row.DeviceName]; ok {
			continue
		}
		if len(result[category]) >= 5 {
			continue
		}
		seen[category][row.DeviceName] = struct{}{}
		result[category] = append(result[category], row.DeviceName)
	}
	return result, nil
}

func issueSeverityFromCount(count int, total int) string {
	if total == 0 {
		return "low"
	}
	ratio := float64(count) / float64(total)
	switch {
	case ratio >= 0.5:
		return "high"
	case ratio >= 0.2:
		return "medium"
	default:
		return "low"
	}
}

func normalizeIssueCategory(category string) string {
	switch strings.ToLower(strings.TrimSpace(category)) {
	case "connectivity", "ping":
		return "网络连通性"
	case "cpu_usage":
		return "CPU使用率"
	case "memory_usage":
		return "内存使用率"
	case "disk_usage":
		return "磁盘空间"
	case "interface_status":
		return "端口状态"
	case "temperature":
		return "温度告警"
	case "snmp":
		return "SNMP检查"
	case "ssh":
		return "SSH检查"
	case "http":
		return "HTTP检查"
	case "script":
		return "脚本检查"
	default:
		if strings.TrimSpace(category) == "" {
			return "其他"
		}
		return category
	}
}

func mapIssueType(checkType string) string {
	switch strings.ToLower(strings.TrimSpace(checkType)) {
	case "ping", "snmp", "ssh", "http", "interface_status", "connectivity":
		return "connectivity"
	case "cpu_usage", "memory_usage", "disk_usage", "response_time", "latency", "performance":
		return "performance"
	case "security", "auth", "password", "permission":
		return "security"
	default:
		return "configuration"
	}
}

func mapIssueSeverity(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "fail", "failed", "error":
		return "high"
	case "warning":
		return "medium"
	default:
		return "low"
	}
}

func buildInspectionIssues(results []inspectionResultRow) []map[string]interface{} {
	issues := make([]map[string]interface{}, 0)
	for idx, result := range results {
		if strings.EqualFold(result.Status, "pass") {
			continue
		}
		description := strings.TrimSpace(result.Message.String)
		if description == "" {
			expected := strings.TrimSpace(result.ExpectedValue.String)
			actual := strings.TrimSpace(result.ActualValue.String)
			if expected != "" || actual != "" {
				description = fmt.Sprintf("期望: %s 实际: %s", expected, actual)
			}
		}
		timestamp := result.CreatedAt.UTC().Format(time.RFC3339)
		issues = append(issues, map[string]interface{}{
			"id":               fmt.Sprintf("issue-%d-%d", result.InspectionID, idx),
			"type":             mapIssueType(result.CheckItemType),
			"severity":         mapIssueSeverity(result.Status),
			"title":            result.CheckItemName,
			"description":      description,
			"first_detected":   timestamp,
			"last_detected":    timestamp,
			"occurrence_count": 1,
			"status":           "active",
		})
	}
	return issues
}

func buildInspectionComparisonData(
	ctx context.Context,
	db *gorm.DB,
	filters inspectionReportFilters,
) ([]map[string]interface{}, []map[string]interface{}, error) {
	if len(filters.DeviceIDs) == 0 {
		return []map[string]interface{}{}, []map[string]interface{}{}, nil
	}

	timeExpr := "COALESCE(completed_at, started_at, created_at)"
	rows := make([]inspectionDeviceAggregate, 0)
	query := db.WithContext(ctx).
		Table("inspections").
		Select(`device_id,
            COUNT(*) AS executions,
            COALESCE(SUM(total_checks),0) AS total_checks,
            COALESCE(SUM(passed_checks),0) AS passed_checks,
            COALESCE(SUM(failed_checks),0) AS failed_checks,
            COALESCE(SUM(warning_checks),0) AS warning_checks,
            AVG(duration) AS avg_duration`).
		Where(timeExpr+" >= ? AND "+timeExpr+" <= ?", filters.Start, filters.End).
		Where("device_id IN ?", filters.DeviceIDs)
	if len(filters.StrategyIDs) > 0 {
		query = query.Where("schedule_id IN ?", filters.StrategyIDs)
	}
	if err := query.Group("device_id").Scan(&rows).Error; err != nil {
		return nil, nil, err
	}

	deviceInfo, err := loadInspectionDeviceInfo(ctx, db, filters.DeviceIDs)
	if err != nil {
		return nil, nil, err
	}
	availabilityMap, _ := queryDeviceAvailability(ctx, db, filters.Start, filters.End, filters.DeviceIDs)
	responseStats, _ := queryMetricSummary(ctx, db, "response_time", filters.Start, filters.End, filters.DeviceIDs)

	scoreMap, err := queryAverageScoreByDevice(ctx, db, filters)
	if err != nil {
		return nil, nil, err
	}

	devices := make([]map[string]interface{}, 0, len(filters.DeviceIDs))
	for _, deviceID := range filters.DeviceIDs {
		info := deviceInfo[deviceID]
		agg := inspectionDeviceAggregate{}
		for _, row := range rows {
			if row.DeviceID == deviceID {
				agg = row
				break
			}
		}
		passRate := 0.0
		if agg.TotalChecks > 0 {
			passRate = float64(agg.PassedChecks) / float64(agg.TotalChecks) * 100
		}

		availability := availabilityMap[deviceID]
		if availability == 0 {
			availability = fallbackAvailability(info.Status)
		}

		avgResponse := responseStats[deviceID].Avg
		if avgResponse == 0 && info.ResponseTime.Valid {
			avgResponse = info.ResponseTime.Float64
		}

		avgScore := scoreMap[deviceID]

		avgDuration := 0.0
		if agg.AvgDuration.Valid {
			avgDuration = agg.AvgDuration.Float64
		}

		devices = append(devices, map[string]interface{}{
			"device_id":   deviceID,
			"device_name": info.Name,
			"device_type": info.DeviceType,
			"status":      info.Status,
			"metrics": map[string]interface{}{
				"total_executions": agg.Executions,
				"total_checks":     agg.TotalChecks,
				"passed_checks":    agg.PassedChecks,
				"failed_checks":    agg.FailedChecks,
				"warning_checks":   agg.WarningChecks,
				"pass_rate":        roundFloat(passRate, 2),
				"avg_score":        roundFloat(avgScore, 2),
				"avg_duration":     roundFloat(avgDuration, 2),
				"availability":     roundFloat(availability, 2),
				"avg_response_time": roundFloat(avgResponse, 2),
			},
		})
	}

	comparisons := buildDeviceComparisons(devices)
	return devices, comparisons, nil
}

func queryAverageScoreByDevice(ctx context.Context, db *gorm.DB, filters inspectionReportFilters) (map[int]float64, error) {
	result := map[int]float64{}
	type row struct {
		DeviceID int             `gorm:"column:device_id"`
		AvgScore sql.NullFloat64 `gorm:"column:avg_score"`
	}
	rows := make([]row, 0)
	timeExpr := "COALESCE(i.completed_at, i.started_at, i.created_at)"
	query := db.WithContext(ctx).
		Table("inspection_results AS r").
		Select("i.device_id, AVG(r.score) AS avg_score").
		Joins("JOIN inspections i ON i.id = r.inspection_id").
		Where("r.score IS NOT NULL").
		Where(timeExpr+" >= ? AND "+timeExpr+" <= ?", filters.Start, filters.End)
	if len(filters.DeviceIDs) > 0 {
		query = query.Where("i.device_id IN ?", filters.DeviceIDs)
	}
	if len(filters.StrategyIDs) > 0 {
		query = query.Where("i.schedule_id IN ?", filters.StrategyIDs)
	}
	if err := query.Group("i.device_id").Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		if row.AvgScore.Valid {
			result[row.DeviceID] = row.AvgScore.Float64
		}
	}
	return result, nil
}

func buildDeviceComparisons(devices []map[string]interface{}) []map[string]interface{} {
	if len(devices) <= 1 {
		return []map[string]interface{}{}
	}
	base := devices[0]
	baseMetrics, _ := base["metrics"].(map[string]interface{})
	baseID := base["device_id"]

	comparisons := make([]map[string]interface{}, 0, len(devices)-1)
	for i := 1; i < len(devices); i++ {
		target := devices[i]
		targetMetrics, _ := target["metrics"].(map[string]interface{})
		diff := map[string]interface{}{
			"pass_rate":        diffFloat(targetMetrics["pass_rate"], baseMetrics["pass_rate"]),
			"avg_score":        diffFloat(targetMetrics["avg_score"], baseMetrics["avg_score"]),
			"availability":     diffFloat(targetMetrics["availability"], baseMetrics["availability"]),
			"avg_response_time": diffFloat(targetMetrics["avg_response_time"], baseMetrics["avg_response_time"]),
			"failed_checks":    diffFloat(targetMetrics["failed_checks"], baseMetrics["failed_checks"]),
		}
		comparisons = append(comparisons, map[string]interface{}{
			"base_device_id":    baseID,
			"compare_device_id": target["device_id"],
			"diff":              diff,
		})
	}
	return comparisons
}

func diffFloat(current interface{}, base interface{}) float64 {
	return readFloatValue(current) - readFloatValue(base)
}

func uniqueIntSlice(values []int) []int {
	seen := map[int]struct{}{}
	result := make([]int, 0, len(values))
	for _, value := range values {
		if value <= 0 {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func valueOrFallback(value sql.NullFloat64, fallback float64) float64 {
	if value.Valid {
		return value.Float64
	}
	return fallback
}

func normalizeDeviceStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "online", "offline", "warning", "error":
		return strings.ToLower(strings.TrimSpace(status))
	default:
		return "offline"
	}
}
