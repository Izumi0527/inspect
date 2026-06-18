package handlers

import (
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
)

func (h ReportsHandler) GetStatisticsData(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	payload := map[string]interface{}{}
	_ = c.Bind(&payload)

	filters := parseStatisticsFilters(payload)
	ctx := c.Request().Context()

	devicesList, err := loadDeviceSnapshots(ctx, db, filters)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load devices")
	}
	deviceIDs := extractDeviceIDs(devicesList)

	statusCounts := countDeviceStatuses(devicesList)
	overview := map[string]interface{}{
		"total_devices":   len(devicesList),
		"online_devices":  statusCounts["online"],
		"offline_devices": statusCounts["offline"],
		"warning_devices": statusCounts["warning"],
		"error_devices":   statusCounts["error"],
		"avg_uptime":      roundFloat(computeAverageUptime(devicesList), 2),
	}

	inspectionAgg, err := queryInspectionAggregate(ctx, db, filters.Start, filters.End, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inspection statistics")
	}
	avgScore, err := queryAverageInspectionScore(ctx, db, filters.Start, filters.End, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inspection scores")
	}
	overview["total_executions"] = inspectionAgg.TotalExecutions
	overview["avg_score"] = roundFloat(avgScore, 2)

	deviceDistribution, err := buildDeviceDistribution(ctx, db, devicesList)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to build device distribution")
	}
	deviceDistribution["by_status"] = statusCounts

	perfList, perfAgg, err := computeDevicePerformance(ctx, db, devicesList, deviceIDs, filters.Start, filters.End, "performance")
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load performance stats")
	}

	complianceStats, err := buildComplianceStats(ctx, db, filters.Start, filters.End, deviceIDs, inspectionAgg)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load compliance stats")
	}

	historicalComparison, err := buildHistoricalComparison(ctx, db, filters, deviceIDs, devicesList)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load historical comparison")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"overview":            overview,
			"device_distribution": deviceDistribution,
			"performance_stats": map[string]interface{}{
				"by_device":  buildPerformancePayload(perfList),
				"aggregated": buildPerformanceAggregatePayload(perfAgg),
			},
			"compliance_stats":      complianceStats,
			"historical_comparison": historicalComparison,
		},
	})
}

func (h ReportsHandler) GetStatisticsKPI(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	payload := map[string]interface{}{}
	_ = c.Bind(&payload)

	filters := parseStatisticsFilters(payload)
	start := filters.Start
	end := filters.End

	ctx := c.Request().Context()
	devicesList, err := loadDeviceSnapshots(ctx, db, filters)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load devices")
	}
	deviceIDs := extractDeviceIDs(devicesList)

	currentMetrics, err := computeKpiMetrics(ctx, db, filters, devicesList, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to compute KPI metrics")
	}

	comparisonPeriod := readString(payload, "comparison_period", "comparisonPeriod")
	prevStart, prevEnd := resolveComparisonRange(start, end, comparisonPeriod)
	previousMetrics := kpiMetrics{}
	if !prevStart.IsZero() && !prevEnd.IsZero() {
		prevFilters := filters
		prevFilters.Start = prevStart
		prevFilters.End = prevEnd
		previousMetrics, _ = computeKpiMetrics(ctx, db, prevFilters, devicesList, deviceIDs)
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"inspection_completion_rate_change": formatPercentDelta(currentMetrics.CompletionRate, previousMetrics.CompletionRate),
			"device_availability_change":        formatPercentDelta(currentMetrics.Availability, previousMetrics.Availability),
			"avg_health_score_change":           formatNumberDelta(currentMetrics.AvgScore, previousMetrics.AvgScore),
			"severe_issue_count_change":         formatIntDelta(currentMetrics.SevereIssues, previousMetrics.SevereIssues),
		},
	})
}

func (h ReportsHandler) GetStatisticsRankings(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	payload := map[string]interface{}{}
	_ = c.Bind(&payload)

	filters := parseStatisticsFilters(payload)
	rankingType := readString(payload, "ranking_type", "rankingType")
	if rankingType == "" {
		rankingType = "performance"
	}
	topN, ok := readInt(payload, "top_n", "topN")
	if !ok || topN <= 0 {
		topN = 10
	}
	includeBottom := false
	if value, ok := readBool(payload, "include_bottom", "includeBottom"); ok {
		includeBottom = value
	}

	ctx := c.Request().Context()
	devicesList, err := loadDeviceSnapshots(ctx, db, filters)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load devices")
	}
	deviceIDs := extractDeviceIDs(devicesList)

	perfList, _, err := computeDevicePerformance(ctx, db, devicesList, deviceIDs, filters.Start, filters.End, rankingType)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to compute rankings")
	}

	ranked := append([]devicePerformance{}, perfList...)
	sort.Slice(ranked, func(i, j int) bool {
		return ranked[i].Ranking > ranked[j].Ranking
	})

	topItems := ranked
	if len(topItems) > topN {
		topItems = topItems[:topN]
	}

	result := make([]map[string]interface{}, 0, len(topItems))
	result = append(result, buildRankingPayload(topItems)...)

	if includeBottom && len(ranked) > topN {
		bottomItems := ranked
		if len(bottomItems) > topN {
			bottomItems = bottomItems[len(bottomItems)-topN:]
		}
		result = append(result, buildRankingPayload(bottomItems)...)
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    result,
	})
}

func (h ReportsHandler) GenerateStatisticsReport(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:create"); err != nil {
		return err
	}
	return h.GenerateReportFromRequest(c)
}

func (h ReportsHandler) GetDeviceStatistics(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	startTime, endTime, granularity := parseTrendRangeFromQuery(c)

	var totalDevices int64
	_ = db.WithContext(c.Request().Context()).Table("devices").Count(&totalDevices)

	type statusRow struct {
		Status string `gorm:"column:status"`
		Count  int    `gorm:"column:count"`
	}
	rows := make([]statusRow, 0)
	_ = db.WithContext(c.Request().Context()).
		Table("devices").
		Select("status, COUNT(*) AS count").
		Group("status").
		Scan(&rows)

	byStatus := map[string]int{}
	onlineCount := 0
	for _, row := range rows {
		byStatus[row.Status] = row.Count
		if row.Status == "online" {
			onlineCount = row.Count
		}
	}

	onlineRate := 0.0
	if totalDevices > 0 {
		onlineRate = float64(onlineCount) / float64(totalDevices) * 100
	}

	typeRow := make([]struct {
		DeviceType string `gorm:"column:device_type"`
		Count      int    `gorm:"column:count"`
	}, 0)
	_ = db.WithContext(c.Request().Context()).
		Table("devices").
		Select("device_type, COUNT(*) AS count").
		Group("device_type").
		Scan(&typeRow)

	byType := map[string]int{}
	for _, row := range typeRow {
		byType[row.DeviceType] = row.Count
	}

	var avgResponse float64
	_ = db.WithContext(c.Request().Context()).
		Table("devices").
		Select("AVG(response_time) AS avg_response_time").
		Scan(&avgResponse)

	trendData := []map[string]interface{}{}
	if exists, err := tableExists(c.Request().Context(), db, "device_status_history"); err == nil && exists {
		type trendRow struct {
			Bucket time.Time `gorm:"column:bucket"`
			Online int64     `gorm:"column:online"`
			Total  int64     `gorm:"column:total"`
		}
		rows := make([]trendRow, 0)
		bucketExpr := bucketExpression(granularity, "collected_at")
		selectExpr := fmt.Sprintf("%s AS bucket, SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) AS online, COUNT(*) AS total", bucketExpr)
		_ = db.WithContext(c.Request().Context()).
			Table("device_status_history").
			Select(selectExpr).
			Where("collected_at >= ? AND collected_at <= ?", startTime, endTime).
			Group("bucket").
			Order("bucket").
			Scan(&rows)

		for _, row := range rows {
			rate := 0.0
			if row.Total > 0 {
				rate = float64(row.Online) / float64(row.Total) * 100
			}
			trendData = append(trendData, map[string]interface{}{
				"date":           row.Bucket.Format(time.RFC3339),
				"online_devices": row.Online,
				"total_devices":  row.Total,
				"online_rate":    roundFloat(rate, 2),
			})
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"total_devices":     totalDevices,
			"online_rate":       onlineRate,
			"avg_response_time": avgResponse,
			"by_type":           byType,
			"by_status":         byStatus,
			"trend_data":        trendData,
		},
	})
}

func (h ReportsHandler) GetAlertStatistics(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	startTime, endTime, granularity := parseTrendRangeFromQuery(c)

	var totalAlerts int64
	_ = db.WithContext(c.Request().Context()).
		Table("alerts AS a").
		Joins("JOIN devices d ON d.id = a.device_id").
		Count(&totalAlerts)

	severityRows := make([]struct {
		Severity string `gorm:"column:severity"`
		Count    int    `gorm:"column:count"`
	}, 0)
	_ = db.WithContext(c.Request().Context()).
		Table("alerts AS a").
		Joins("JOIN devices d ON d.id = a.device_id").
		Select("severity, COUNT(*) AS count").
		Group("severity").
		Scan(&severityRows)

	bySeverity := map[string]int{}
	for _, row := range severityRows {
		bySeverity[row.Severity] = row.Count
	}

	deviceRows := make([]struct {
		DeviceID int `gorm:"column:device_id"`
		Count    int `gorm:"column:count"`
	}, 0)
	_ = db.WithContext(c.Request().Context()).
		Table("alerts AS a").
		Joins("JOIN devices d ON d.id = a.device_id").
		Select("a.device_id, COUNT(*) AS count").
		Group("a.device_id").
		Scan(&deviceRows)

	byDevice := map[string]int{}
	for _, row := range deviceRows {
		byDevice[strconv.Itoa(row.DeviceID)] = row.Count
	}

	avgResolutionTime := 0.0
	var avgRow struct {
		AvgResolution float64 `gorm:"column:avg_resolution_time"`
	}
	err := db.WithContext(c.Request().Context()).
		Table("alerts AS a").
		Joins("JOIN devices d ON d.id = a.device_id").
		Select("COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(a.resolved_at, a.closed_at) - a.created_at)) / 3600.0), 0) AS avg_resolution_time").
		Where("a.created_at IS NOT NULL").
		Where("COALESCE(a.resolved_at, a.closed_at) IS NOT NULL").
		Where("a.status IN ?", []string{"resolved", "closed"}).
		Scan(&avgRow).Error
	if err == nil {
		avgResolutionTime = roundFloat(avgRow.AvgResolution, 2)
	}

	trendData := []map[string]interface{}{}
	type trendRow struct {
		Bucket   time.Time `gorm:"column:bucket"`
		Total    int64     `gorm:"column:total"`
		Resolved int64     `gorm:"column:resolved"`
		Severe   int64     `gorm:"column:severe"`
	}
	rows := make([]trendRow, 0)
	bucketExpr := bucketExpression(granularity, "a.created_at")
	selectExpr := fmt.Sprintf(`%s AS bucket,
        COUNT(*) AS total,
        SUM(CASE WHEN a.status IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS resolved,
        SUM(CASE WHEN a.severity IN ('critical', 'error', 'fatal') THEN 1 ELSE 0 END) AS severe`, bucketExpr)
	_ = db.WithContext(c.Request().Context()).
		Table("alerts AS a").
		Joins("JOIN devices d ON d.id = a.device_id").
		Select(selectExpr).
		Where("a.created_at >= ? AND a.created_at <= ?", startTime, endTime).
		Group("bucket").
		Order("bucket").
		Scan(&rows)
	for _, row := range rows {
		trendData = append(trendData, map[string]interface{}{
			"date":     row.Bucket.Format(time.RFC3339),
			"total":    row.Total,
			"resolved": row.Resolved,
			"severe":   row.Severe,
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"total_alerts":        totalAlerts,
			"by_severity":         bySeverity,
			"by_device":           byDevice,
			"avg_resolution_time": avgResolutionTime,
			"trend_data":          trendData,
		},
	})
}

func (h ReportsHandler) GetInspectionStatistics(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	startTime, endTime, granularity := parseTrendRangeFromQuery(c)

	var totalTasks int64
	var completedTasks int64
	_ = db.WithContext(c.Request().Context()).Table("inspections").Count(&totalTasks)
	_ = db.WithContext(c.Request().Context()).Table("inspections").Where("status = ?", "completed").Count(&completedTasks)

	passRate := 0.0
	if totalTasks > 0 {
		passRate = float64(completedTasks) / float64(totalTasks) * 100
	}

	deviceTypeRows := make([]struct {
		DeviceType string `gorm:"column:device_type"`
		Count      int    `gorm:"column:count"`
	}, 0)
	_ = db.WithContext(c.Request().Context()).
		Table("inspections AS i").
		Select("COALESCE(NULLIF(d.device_type, ''), '未设置') AS device_type, COUNT(*) AS count").
		Joins("LEFT JOIN devices d ON d.id = i.device_id").
		Group("device_type").
		Scan(&deviceTypeRows)

	byDeviceType := map[string]int{}
	for _, row := range deviceTypeRows {
		deviceType := strings.TrimSpace(row.DeviceType)
		if deviceType == "" {
			deviceType = "未设置"
		}
		byDeviceType[deviceType] = row.Count
	}

	trendData := []map[string]interface{}{}
	type trendRow struct {
		Bucket    time.Time `gorm:"column:bucket"`
		Total     int64     `gorm:"column:total"`
		Completed int64     `gorm:"column:completed"`
		Failed    int64     `gorm:"column:failed"`
	}
	rows := make([]trendRow, 0)
	timeExpr := bucketExpression(granularity, "COALESCE(started_at, created_at)")
	selectExpr := fmt.Sprintf(`%s AS bucket,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed`, timeExpr)
	_ = db.WithContext(c.Request().Context()).
		Table("inspections").
		Select(selectExpr).
		Where("COALESCE(started_at, created_at) >= ? AND COALESCE(started_at, created_at) <= ?", startTime, endTime).
		Group("bucket").
		Order("bucket").
		Scan(&rows)
	for _, row := range rows {
		trendData = append(trendData, map[string]interface{}{
			"date":      row.Bucket.Format(time.RFC3339),
			"total":     row.Total,
			"completed": row.Completed,
			"failed":    row.Failed,
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"total_tasks":     totalTasks,
			"completed_tasks": completedTasks,
			"pass_rate":       passRate,
			"by_device_type":  byDeviceType,
			"trend_data":      trendData,
		},
	})
}
