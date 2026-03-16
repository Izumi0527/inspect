package handlers

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

type statisticsFilters struct {
	Start         time.Time
	End           time.Time
	DeviceTypes   []string
	Locations     []string
	DeviceGroups  []int
	GroupBy       string
	IncludeTrends bool
}

type deviceSnapshot struct {
	ID           int             `gorm:"column:id"`
	Name         string          `gorm:"column:name"`
	DeviceType   string          `gorm:"column:device_type"`
	Status       string          `gorm:"column:status"`
	Uptime       sql.NullInt64   `gorm:"column:uptime"`
	ResponseTime sql.NullFloat64 `gorm:"column:response_time"`
	CPUUsage     sql.NullFloat64 `gorm:"column:cpu_usage"`
	MemoryUsage  sql.NullFloat64 `gorm:"column:memory_usage"`
	Location     sql.NullString  `gorm:"column:location"`
	GroupID      sql.NullInt64   `gorm:"column:group_id"`
}

type deviceMetricAggregate struct {
	DeviceID             int             `gorm:"column:device_id"`
	ResponseTime         sql.NullFloat64 `gorm:"column:response_time"`
	CPUUsage             sql.NullFloat64 `gorm:"column:cpu_usage"`
	MemoryUsage          sql.NullFloat64 `gorm:"column:memory_usage"`
	DiskUsage            sql.NullFloat64 `gorm:"column:disk_usage"`
	BandwidthUtilization sql.NullFloat64 `gorm:"column:bandwidth_utilization"`
}

type alertAggregate struct {
	DeviceID int   `gorm:"column:device_id"`
	Total    int64 `gorm:"column:total"`
	Severe   int64 `gorm:"column:severe"`
	Resolved int64 `gorm:"column:resolved"`
}

type inspectionAggregate struct {
	TotalExecutions     int64 `gorm:"column:total_executions"`
	CompletedExecutions int64 `gorm:"column:completed_executions"`
	FailedExecutions    int64 `gorm:"column:failed_executions"`
	TotalChecks         int64 `gorm:"column:total_checks"`
	PassedChecks        int64 `gorm:"column:passed_checks"`
	FailedChecks        int64 `gorm:"column:failed_checks"`
	WarningChecks       int64 `gorm:"column:warning_checks"`
}

type devicePerformance struct {
	DeviceID        int
	DeviceName      string
	DeviceType      string
	Availability    float64
	AvgResponseTime float64
	ErrorRate       float64
	Utilization     float64
	Ranking         float64
}

type performanceAggregates struct {
	AvgAvailability float64
	AvgResponseTime float64
	AvgErrorRate    float64
	AvgUtilization  float64
	TopPerformers   []string
	UnderPerformers []string
}

type kpiMetrics struct {
	CompletionRate float64
	Availability   float64
	AvgScore       float64
	SevereIssues   int64
}

type periodStats struct {
	Period             string
	TotalExecutions    int64
	AvgScore           float64
	AvgUptime          float64
	IssueCount         int64
	ResolvedIssueCount int64
}

type alertTotals struct {
	Total    int64
	Resolved int64
	Severe   int64
}

func parseStatisticsFilters(payload map[string]interface{}) statisticsFilters {
	start, end := parseStatisticsRange(payload)
	groupBy := readString(payload, "group_by", "groupBy")
	if strings.TrimSpace(groupBy) == "" {
		groupBy = "day"
	}
	includeTrends := true
	if value, ok := readBool(payload, "include_trends", "includeTrends"); ok {
		includeTrends = value
	}
	deviceGroups := parseIntSlice(payload["device_groups"])
	if len(deviceGroups) == 0 {
		deviceGroups = parseIntSlice(payload["deviceGroups"])
	}
	return statisticsFilters{
		Start:         start,
		End:           end,
		DeviceTypes:   readStringSlice(payload, "device_types", "deviceTypes"),
		Locations:     readStringSlice(payload, "locations", "location"),
		DeviceGroups:  deviceGroups,
		GroupBy:       groupBy,
		IncludeTrends: includeTrends,
	}
}

func parseStatisticsRange(payload map[string]interface{}) (time.Time, time.Time) {
	startStr := readString(payload, "start_date", "startDate")
	endStr := readString(payload, "end_date", "endDate")

	startValue, _ := parseTimeOptional(startStr)
	endValue, _ := parseTimeOptional(endStr)

	now := time.Now().UTC()
	if endValue == nil {
		endValue = &now
	}
	if startValue == nil {
		value := endValue.AddDate(0, 0, -30)
		startValue = &value
	}

	start := startValue.UTC()
	end := endValue.UTC()
	if start.After(end) {
		start, end = end, start
	}
	return start, end
}

func parseTrendRangeFromQuery(c echo.Context) (time.Time, time.Time, string) {
	startValue, _ := parseTimeOptional(c.QueryParam("start_date"))
	endValue, _ := parseTimeOptional(c.QueryParam("end_date"))

	now := time.Now().UTC()
	if endValue == nil {
		endValue = &now
	}
	if startValue == nil {
		value := endValue.AddDate(0, 0, -30)
		startValue = &value
	}

	start := startValue.UTC()
	end := endValue.UTC()
	if start.After(end) {
		start, end = end, start
	}

	granularity := normalizeGranularity(c.QueryParam("group_by"))
	return start, end, granularity
}

func loadDeviceSnapshots(ctx context.Context, db *gorm.DB, filters statisticsFilters) ([]deviceSnapshot, error) {
	query := db.WithContext(ctx).
		Table("devices").
		Select("id, name, device_type, status, uptime, response_time, cpu_usage, memory_usage, location, group_id")
	query = applyDeviceFilters(query, filters)

	devicesList := make([]deviceSnapshot, 0)
	if err := query.Scan(&devicesList).Error; err != nil {
		return nil, err
	}
	return devicesList, nil
}

func applyDeviceFilters(query *gorm.DB, filters statisticsFilters) *gorm.DB {
	if len(filters.DeviceTypes) > 0 {
		query = query.Where("device_type IN ?", filters.DeviceTypes)
	}
	if len(filters.Locations) > 0 {
		query = query.Where("location IN ?", filters.Locations)
	}
	if len(filters.DeviceGroups) > 0 {
		query = query.Where("group_id IN ?", filters.DeviceGroups)
	}
	return query
}

func extractDeviceIDs(devices []deviceSnapshot) []int {
	ids := make([]int, 0, len(devices))
	for _, device := range devices {
		if device.ID > 0 {
			ids = append(ids, device.ID)
		}
	}
	return ids
}

func countDeviceStatuses(devices []deviceSnapshot) map[string]int {
	counts := map[string]int{}
	for _, device := range devices {
		key := strings.ToLower(strings.TrimSpace(device.Status))
		if key == "" {
			key = "unknown"
		}
		counts[key]++
	}
	return counts
}

func computeAverageUptime(devices []deviceSnapshot) float64 {
	total := 0.0
	count := 0.0
	for _, device := range devices {
		if device.Uptime.Valid {
			total += float64(device.Uptime.Int64)
			count++
		}
	}
	if count == 0 {
		return 0
	}
	return total / count
}

func buildDeviceDistribution(ctx context.Context, db *gorm.DB, devices []deviceSnapshot) (map[string]interface{}, error) {
	byType := map[string]int{}
	byLocation := map[string]int{}
	groupCounts := map[int]int{}

	for _, device := range devices {
		deviceType := strings.TrimSpace(device.DeviceType)
		if deviceType == "" {
			deviceType = "未设置"
		}
		byType[deviceType]++

		location := "未设置"
		if device.Location.Valid && strings.TrimSpace(device.Location.String) != "" {
			location = strings.TrimSpace(device.Location.String)
		}
		byLocation[location]++

		if device.GroupID.Valid {
			groupCounts[int(device.GroupID.Int64)]++
		} else {
			groupCounts[0]++
		}
	}

	groupNames, err := loadGroupNames(ctx, db, groupCounts)
	if err != nil {
		return nil, err
	}
	byGroup := map[string]int{}
	for groupID, count := range groupCounts {
		name := groupNames[groupID]
		if name == "" {
			if groupID == 0 {
				name = "未分组"
			} else {
				name = fmt.Sprintf("分组-%d", groupID)
			}
		}
		byGroup[name] += count
	}

	return map[string]interface{}{
		"by_type":     byType,
		"by_group":    byGroup,
		"by_location": byLocation,
	}, nil
}

func loadGroupNames(ctx context.Context, db *gorm.DB, groupCounts map[int]int) (map[int]string, error) {
	ids := make([]int, 0, len(groupCounts))
	for id := range groupCounts {
		if id > 0 {
			ids = append(ids, id)
		}
	}
	result := map[int]string{}
	if len(ids) == 0 {
		return result, nil
	}

	type row struct {
		ID   int    `gorm:"column:id"`
		Name string `gorm:"column:name"`
	}
	rows := make([]row, 0)
	if err := db.WithContext(ctx).Table("device_groups").Select("id, name").Where("id IN ?", ids).Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		result[row.ID] = strings.TrimSpace(row.Name)
	}
	return result, nil
}

func queryInspectionAggregate(ctx context.Context, db *gorm.DB, start time.Time, end time.Time, deviceIDs []int) (inspectionAggregate, error) {
	var agg inspectionAggregate
	query := db.WithContext(ctx).
		Table("inspections").
		Select(`COUNT(*) AS total_executions,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_executions,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_executions,
            COALESCE(SUM(total_checks),0) AS total_checks,
            COALESCE(SUM(passed_checks),0) AS passed_checks,
            COALESCE(SUM(failed_checks),0) AS failed_checks,
            COALESCE(SUM(warning_checks),0) AS warning_checks`).
		Where("COALESCE(started_at, created_at) >= ? AND COALESCE(started_at, created_at) <= ?", start, end)
	if len(deviceIDs) > 0 {
		query = query.Where("device_id IN ?", deviceIDs)
	}
	if err := query.Scan(&agg).Error; err != nil {
		return inspectionAggregate{}, err
	}
	return agg, nil
}

func queryAverageInspectionScore(ctx context.Context, db *gorm.DB, start time.Time, end time.Time, deviceIDs []int) (float64, error) {
	type row struct {
		AvgScore sql.NullFloat64 `gorm:"column:avg_score"`
	}
	var result row
	query := db.WithContext(ctx).
		Table("inspection_results AS r").
		Select("AVG(r.score) AS avg_score").
		Joins("JOIN inspections i ON i.id = r.inspection_id").
		Where("r.score IS NOT NULL").
		Where("COALESCE(i.started_at, i.created_at) >= ? AND COALESCE(i.started_at, i.created_at) <= ?", start, end)
	if len(deviceIDs) > 0 {
		query = query.Where("i.device_id IN ?", deviceIDs)
	}
	if err := query.Scan(&result).Error; err != nil {
		return 0, err
	}
	if result.AvgScore.Valid {
		return result.AvgScore.Float64, nil
	}
	return 0, nil
}

func computeDevicePerformance(
	ctx context.Context,
	db *gorm.DB,
	devices []deviceSnapshot,
	deviceIDs []int,
	start time.Time,
	end time.Time,
	rankingType string,
) ([]devicePerformance, performanceAggregates, error) {
	metricAgg, err := queryDeviceMetricAggregates(ctx, db, start, end, deviceIDs)
	if err != nil {
		return nil, performanceAggregates{}, err
	}
	availabilityMap, err := queryDeviceAvailability(ctx, db, start, end, deviceIDs)
	if err != nil {
		return nil, performanceAggregates{}, err
	}
	alertAgg, maxAlerts, err := queryAlertAggregates(ctx, db, start, end, deviceIDs)
	if err != nil {
		return nil, performanceAggregates{}, err
	}

	perfList := make([]devicePerformance, 0, len(devices))
	for _, device := range devices {
		agg := metricAgg[device.ID]
		availability, ok := availabilityMap[device.ID]
		if !ok {
			availability = fallbackAvailability(device.Status)
		}

		responseTime := resolveMetricValue(agg.ResponseTime, device.ResponseTime)
		utilization := resolveUtilization(agg, device)

		alerts := alertAgg[device.ID]
		errorRate := 0.0
		if maxAlerts > 0 {
			errorRate = float64(alerts.Total) / float64(maxAlerts) * 100
		}

		perf := devicePerformance{
			DeviceID:        device.ID,
			DeviceName:      device.Name,
			DeviceType:      device.DeviceType,
			Availability:    clampValue(availability, 0, 100),
			AvgResponseTime: responseTime,
			ErrorRate:       clampValue(errorRate, 0, 100),
			Utilization:     clampValue(utilization, 0, 100),
		}
		perf.Ranking = computeRankingScore(perf, rankingType)
		perfList = append(perfList, perf)
	}

	aggregates := summarizePerformance(perfList)
	return perfList, aggregates, nil
}

func queryDeviceMetricAggregates(ctx context.Context, db *gorm.DB, start time.Time, end time.Time, deviceIDs []int) (map[int]deviceMetricAggregate, error) {
	result := map[int]deviceMetricAggregate{}
	if len(deviceIDs) == 0 {
		return result, nil
	}

	rows := make([]deviceMetricAggregate, 0)
	query := db.WithContext(ctx).
		Table("device_metrics").
		Select(`device_id,
            AVG(CASE WHEN metric_name = 'response_time' THEN metric_value END) AS response_time,
            AVG(CASE WHEN metric_name = 'cpu_usage' THEN metric_value END) AS cpu_usage,
            AVG(CASE WHEN metric_name = 'memory_usage' THEN metric_value END) AS memory_usage,
            AVG(CASE WHEN metric_name = 'disk_usage' THEN metric_value END) AS disk_usage,
            AVG(CASE WHEN metric_name = 'bandwidth_utilization' THEN metric_value END) AS bandwidth_utilization`).
		Where("collected_at >= ? AND collected_at <= ?", start, end).
		Where("device_id IN ?", deviceIDs).
		Group("device_id")
	if err := query.Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		result[row.DeviceID] = row
	}
	return result, nil
}

func queryDeviceAvailability(ctx context.Context, db *gorm.DB, start time.Time, end time.Time, deviceIDs []int) (map[int]float64, error) {
	result := map[int]float64{}
	if len(deviceIDs) == 0 {
		return result, nil
	}
	exists, err := tableExists(ctx, db, "device_status_history")
	if err != nil || !exists {
		return result, err
	}

	type row struct {
		DeviceID int   `gorm:"column:device_id"`
		Online   int64 `gorm:"column:online"`
		Total    int64 `gorm:"column:total"`
	}
	rows := make([]row, 0)
	query := db.WithContext(ctx).
		Table("device_status_history").
		Select("device_id, SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) AS online, COUNT(*) AS total").
		Where("collected_at >= ? AND collected_at <= ?", start, end).
		Where("device_id IN ?", deviceIDs).
		Group("device_id")
	if err := query.Scan(&rows).Error; err != nil {
		return nil, err
	}

	for _, row := range rows {
		if row.Total == 0 {
			continue
		}
		result[row.DeviceID] = float64(row.Online) / float64(row.Total) * 100
	}
	return result, nil
}

func queryAlertAggregates(ctx context.Context, db *gorm.DB, start time.Time, end time.Time, deviceIDs []int) (map[int]alertAggregate, int64, error) {
	result := map[int]alertAggregate{}
	var maxAlerts int64
	if len(deviceIDs) == 0 {
		return result, 0, nil
	}

	rows := make([]alertAggregate, 0)
	query := db.WithContext(ctx).
		Table("alerts").
		Select(`device_id,
            COUNT(*) AS total,
            SUM(CASE WHEN severity IN ('critical', 'error', 'fatal') THEN 1 ELSE 0 END) AS severe,
            SUM(CASE WHEN status IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS resolved`).
		Where("created_at >= ? AND created_at <= ?", start, end).
		Where("device_id IN ?", deviceIDs).
		Group("device_id")
	if err := query.Scan(&rows).Error; err != nil {
		return nil, 0, err
	}

	for _, row := range rows {
		result[row.DeviceID] = row
		if row.Total > maxAlerts {
			maxAlerts = row.Total
		}
	}
	return result, maxAlerts, nil
}

func resolveMetricValue(metric sql.NullFloat64, fallback sql.NullFloat64) float64 {
	if metric.Valid {
		return metric.Float64
	}
	if fallback.Valid {
		return fallback.Float64
	}
	return 0
}

func resolveUtilization(agg deviceMetricAggregate, device deviceSnapshot) float64 {
	candidates := []sql.NullFloat64{
		agg.CPUUsage,
		agg.MemoryUsage,
		agg.DiskUsage,
		agg.BandwidthUtilization,
		device.CPUUsage,
		device.MemoryUsage,
	}
	for _, candidate := range candidates {
		if candidate.Valid {
			return candidate.Float64
		}
	}
	return 0
}

func fallbackAvailability(status string) float64 {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "online":
		return 100
	case "warning":
		return 80
	case "error":
		return 60
	default:
		return 0
	}
}

func responseScore(responseTime float64) float64 {
	if responseTime <= 0 {
		return 100
	}
	score := 100 - responseTime/10
	if score < 0 {
		return 0
	}
	if score > 100 {
		return 100
	}
	return score
}

func computeRankingScore(perf devicePerformance, rankingType string) float64 {
	availability := clampValue(perf.Availability, 0, 100)
	response := responseScore(perf.AvgResponseTime)
	errorScore := 100 - clampValue(perf.ErrorRate, 0, 100)
	utilScore := 100 - clampValue(perf.Utilization, 0, 100)

	switch strings.ToLower(strings.TrimSpace(rankingType)) {
	case "reliability":
		return availability*0.7 + errorScore*0.3
	case "efficiency":
		return response*0.5 + utilScore*0.5
	case "performance":
		return availability*0.6 + response*0.4
	default:
		return availability*0.4 + response*0.3 + errorScore*0.2 + utilScore*0.1
	}
}

func summarizePerformance(list []devicePerformance) performanceAggregates {
	result := performanceAggregates{}
	if len(list) == 0 {
		return result
	}

	sumAvailability := 0.0
	sumResponse := 0.0
	sumError := 0.0
	sumUtil := 0.0
	for _, item := range list {
		sumAvailability += item.Availability
		sumResponse += item.AvgResponseTime
		sumError += item.ErrorRate
		sumUtil += item.Utilization
	}
	count := float64(len(list))
	result.AvgAvailability = sumAvailability / count
	result.AvgResponseTime = sumResponse / count
	result.AvgErrorRate = sumError / count
	result.AvgUtilization = sumUtil / count

	ranked := append([]devicePerformance{}, list...)
	sort.Slice(ranked, func(i, j int) bool {
		return ranked[i].Ranking > ranked[j].Ranking
	})

	limit := 5
	if len(ranked) < limit {
		limit = len(ranked)
	}
	for _, item := range ranked[:limit] {
		if strings.TrimSpace(item.DeviceName) != "" {
			result.TopPerformers = append(result.TopPerformers, item.DeviceName)
		}
	}
	for i := 0; i < limit; i++ {
		item := ranked[len(ranked)-1-i]
		if strings.TrimSpace(item.DeviceName) != "" {
			result.UnderPerformers = append(result.UnderPerformers, item.DeviceName)
		}
	}
	return result
}

func buildPerformancePayload(list []devicePerformance) []map[string]interface{} {
	payload := make([]map[string]interface{}, 0, len(list))
	for _, item := range list {
		payload = append(payload, map[string]interface{}{
			"device_id":   item.DeviceID,
			"device_name": item.DeviceName,
			"device_type": item.DeviceType,
			"metrics": map[string]interface{}{
				"availability":      roundFloat(item.Availability, 2),
				"avg_response_time": roundFloat(item.AvgResponseTime, 2),
				"error_rate":        roundFloat(item.ErrorRate, 2),
				"utilization":       roundFloat(item.Utilization, 2),
			},
			"ranking": roundFloat(item.Ranking, 2),
		})
	}
	return payload
}

func buildPerformanceAggregatePayload(aggregates performanceAggregates) map[string]interface{} {
	return map[string]interface{}{
		"avg_availability":  roundFloat(aggregates.AvgAvailability, 2),
		"avg_response_time": roundFloat(aggregates.AvgResponseTime, 2),
		"avg_error_rate":    roundFloat(aggregates.AvgErrorRate, 2),
		"avg_utilization":   roundFloat(aggregates.AvgUtilization, 2),
		"top_performers":    aggregates.TopPerformers,
		"under_performers":  aggregates.UnderPerformers,
	}
}

func buildComplianceStats(
	ctx context.Context,
	db *gorm.DB,
	start time.Time,
	end time.Time,
	deviceIDs []int,
	inspectionAgg inspectionAggregate,
) (map[string]interface{}, error) {
	overallCompliance := 0.0
	if inspectionAgg.TotalChecks > 0 {
		overallCompliance = float64(inspectionAgg.PassedChecks) / float64(inspectionAgg.TotalChecks) * 100
	}

	byCategory, err := queryComplianceByCategory(ctx, db, start, end, deviceIDs)
	if err != nil {
		return nil, err
	}

	failedChecks, err := queryComplianceIssues(ctx, db, start, end, deviceIDs, 20)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"overall_compliance": roundFloat(overallCompliance, 2),
		"by_category":        byCategory,
		"failed_checks":      failedChecks,
	}, nil
}

func queryComplianceByCategory(ctx context.Context, db *gorm.DB, start time.Time, end time.Time, deviceIDs []int) (map[string]int, error) {
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
		Where("COALESCE(i.started_at, i.created_at) >= ? AND COALESCE(i.started_at, i.created_at) <= ?", start, end)
	if len(deviceIDs) > 0 {
		query = query.Where("i.device_id IN ?", deviceIDs)
	}
	if err := query.Group("category").Order("count DESC").Scan(&rows).Error; err != nil {
		return nil, err
	}

	result := map[string]int{}
	for _, row := range rows {
		category := strings.TrimSpace(row.Category)
		if category == "" {
			category = "其他"
		}
		result[category] = row.Count
	}
	return result, nil
}

func queryComplianceIssues(
	ctx context.Context,
	db *gorm.DB,
	start time.Time,
	end time.Time,
	deviceIDs []int,
	limit int,
) ([]map[string]interface{}, error) {
	type row struct {
		DeviceID    int            `gorm:"column:device_id"`
		DeviceName  string         `gorm:"column:device_name"`
		CheckName   string         `gorm:"column:check_name"`
		Category    string         `gorm:"column:category"`
		Status      string         `gorm:"column:status"`
		Message     sql.NullString `gorm:"column:message"`
		Description sql.NullString `gorm:"column:description"`
		CreatedAt   time.Time      `gorm:"column:created_at"`
	}

	rows := make([]row, 0)
	query := db.WithContext(ctx).
		Table("inspection_results AS r").
		Select(`i.device_id,
            d.name AS device_name,
            r.check_item_name AS check_name,
            COALESCE(NULLIF(r.check_item_category, ''), NULLIF(r.check_item_type, ''), '其他') AS category,
            r.status,
            r.message,
            r.description,
            r.created_at`).
		Joins("JOIN inspections i ON i.id = r.inspection_id").
		Joins("JOIN devices d ON d.id = i.device_id").
		Where("r.status IN ?", []string{"fail", "warning"}).
		Where("COALESCE(i.started_at, i.created_at) >= ? AND COALESCE(i.started_at, i.created_at) <= ?", start, end)
	if len(deviceIDs) > 0 {
		query = query.Where("i.device_id IN ?", deviceIDs)
	}
	if limit <= 0 {
		limit = 20
	}
	if err := query.Order("r.created_at DESC").Limit(limit).Scan(&rows).Error; err != nil {
		return nil, err
	}

	result := make([]map[string]interface{}, 0, len(rows))
	for _, row := range rows {
		description := strings.TrimSpace(row.Message.String)
		if description == "" {
			description = strings.TrimSpace(row.Description.String)
		}
		result = append(result, map[string]interface{}{
			"device_id":      row.DeviceID,
			"device_name":    row.DeviceName,
			"check_name":     row.CheckName,
			"category":       row.Category,
			"severity":       mapComplianceSeverity(row.Status),
			"description":    description,
			"recommendation": "",
			"first_detected": row.CreatedAt.Format(time.RFC3339),
			"status":         "open",
		})
	}
	return result, nil
}

func mapComplianceSeverity(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "fail", "failed", "error":
		return "high"
	case "warning":
		return "medium"
	default:
		return "low"
	}
}

func buildHistoricalComparison(
	ctx context.Context,
	db *gorm.DB,
	filters statisticsFilters,
	deviceIDs []int,
	devices []deviceSnapshot,
) (map[string]interface{}, error) {
	current := queryPeriodStats(ctx, db, filters.Start, filters.End, deviceIDs, devices)
	prevStart := filters.Start.Add(-filters.End.Sub(filters.Start))
	prevEnd := filters.Start
	previous := queryPeriodStats(ctx, db, prevStart, prevEnd, deviceIDs, devices)

	changes := map[string]float64{
		"total_executions":     float64(current.TotalExecutions - previous.TotalExecutions),
		"avg_score":            current.AvgScore - previous.AvgScore,
		"avg_uptime":           current.AvgUptime - previous.AvgUptime,
		"issue_count":          float64(current.IssueCount - previous.IssueCount),
		"resolved_issue_count": float64(current.ResolvedIssueCount - previous.ResolvedIssueCount),
	}

	return map[string]interface{}{
		"current_period": map[string]interface{}{
			"period":               current.Period,
			"total_executions":     current.TotalExecutions,
			"avg_score":            roundFloat(current.AvgScore, 2),
			"avg_uptime":           roundFloat(current.AvgUptime, 2),
			"issue_count":          current.IssueCount,
			"resolved_issue_count": current.ResolvedIssueCount,
		},
		"previous_period": map[string]interface{}{
			"period":               previous.Period,
			"total_executions":     previous.TotalExecutions,
			"avg_score":            roundFloat(previous.AvgScore, 2),
			"avg_uptime":           roundFloat(previous.AvgUptime, 2),
			"issue_count":          previous.IssueCount,
			"resolved_issue_count": previous.ResolvedIssueCount,
		},
		"changes": changes,
	}, nil
}

func queryPeriodStats(
	ctx context.Context,
	db *gorm.DB,
	start time.Time,
	end time.Time,
	deviceIDs []int,
	devices []deviceSnapshot,
) periodStats {
	stats := periodStats{
		Period: fmt.Sprintf("%s ~ %s", start.Format("2006-01-02"), end.Format("2006-01-02")),
	}

	inspectionAgg, err := queryInspectionAggregate(ctx, db, start, end, deviceIDs)
	if err == nil {
		stats.TotalExecutions = inspectionAgg.TotalExecutions
	}

	avgScore, err := queryAverageInspectionScore(ctx, db, start, end, deviceIDs)
	if err == nil {
		stats.AvgScore = avgScore
	}

	stats.AvgUptime = computeAverageUptime(devices)

	alertTotals, err := queryAlertTotals(ctx, db, start, end, deviceIDs)
	if err == nil {
		stats.IssueCount = alertTotals.Total
		stats.ResolvedIssueCount = alertTotals.Resolved
	}

	return stats
}

func queryAlertTotals(ctx context.Context, db *gorm.DB, start time.Time, end time.Time, deviceIDs []int) (alertTotals, error) {
	type row struct {
		Total    int64 `gorm:"column:total"`
		Resolved int64 `gorm:"column:resolved"`
		Severe   int64 `gorm:"column:severe"`
	}
	var result row
	query := db.WithContext(ctx).
		Table("alerts").
		Select(`COUNT(*) AS total,
            SUM(CASE WHEN status IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS resolved,
            SUM(CASE WHEN severity IN ('critical', 'error', 'fatal') THEN 1 ELSE 0 END) AS severe`).
		Where("created_at >= ? AND created_at <= ?", start, end)
	if len(deviceIDs) > 0 {
		query = query.Where("device_id IN ?", deviceIDs)
	}
	if err := query.Scan(&result).Error; err != nil {
		return alertTotals{}, err
	}
	return alertTotals{Total: result.Total, Resolved: result.Resolved, Severe: result.Severe}, nil
}

func computeKpiMetrics(
	ctx context.Context,
	db *gorm.DB,
	filters statisticsFilters,
	devices []deviceSnapshot,
	deviceIDs []int,
) (kpiMetrics, error) {
	inspectionAgg, err := queryInspectionAggregate(ctx, db, filters.Start, filters.End, deviceIDs)
	if err != nil {
		return kpiMetrics{}, err
	}

	completionRate := 0.0
	if inspectionAgg.TotalExecutions > 0 {
		completionRate = float64(inspectionAgg.CompletedExecutions) / float64(inspectionAgg.TotalExecutions) * 100
	}

	avgScore, err := queryAverageInspectionScore(ctx, db, filters.Start, filters.End, deviceIDs)
	if err != nil {
		return kpiMetrics{}, err
	}

	availability := 0.0
	online := 0
	for _, device := range devices {
		if strings.ToLower(strings.TrimSpace(device.Status)) == "online" {
			online++
		}
	}
	if len(devices) > 0 {
		availability = float64(online) / float64(len(devices)) * 100
	}

	alertTotals, err := queryAlertTotals(ctx, db, filters.Start, filters.End, deviceIDs)
	if err != nil {
		return kpiMetrics{}, err
	}

	return kpiMetrics{
		CompletionRate: completionRate,
		Availability:   availability,
		AvgScore:       avgScore,
		SevereIssues:   alertTotals.Severe,
	}, nil
}

func resolveComparisonRange(start time.Time, end time.Time, comparison string) (time.Time, time.Time) {
	switch strings.ToLower(strings.TrimSpace(comparison)) {
	case "previous_period":
		diff := end.Sub(start)
		return start.Add(-diff), start
	case "previous_year":
		return start.AddDate(-1, 0, 0), end.AddDate(-1, 0, 0)
	default:
		return time.Time{}, time.Time{}
	}
}

func formatPercentDelta(current float64, previous float64) string {
	return fmt.Sprintf("%+.1f%%", current-previous)
}

func formatNumberDelta(current float64, previous float64) string {
	return fmt.Sprintf("%+.1f", current-previous)
}

func formatIntDelta(current int64, previous int64) string {
	return fmt.Sprintf("%+d", current-previous)
}

func buildRankingPayload(items []devicePerformance) []map[string]interface{} {
	result := make([]map[string]interface{}, 0, len(items))
	for _, item := range items {
		result = append(result, map[string]interface{}{
			"device_id":   item.DeviceID,
			"device_name": item.DeviceName,
			"device_type": item.DeviceType,
			"metrics": map[string]interface{}{
				"availability":      roundFloat(item.Availability, 2),
				"avg_response_time": roundFloat(item.AvgResponseTime, 2),
				"error_rate":        roundFloat(item.ErrorRate, 2),
				"utilization":       roundFloat(item.Utilization, 2),
			},
			"ranking": roundFloat(item.Ranking, 2),
		})
	}
	return result
}
