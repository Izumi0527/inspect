package handlers

import (
	"fmt"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

func (h ReportsHandler) GetReportStats(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	var total int64
	_ = db.WithContext(c.Request().Context()).Model(&reports.Report{}).Count(&total)

	startOfDay := time.Now().UTC().Truncate(24 * time.Hour)
	var generatedToday int64
	_ = db.WithContext(c.Request().Context()).Model(&reports.Report{}).
		Where("created_at >= ?", startOfDay).
		Count(&generatedToday)

	var scheduledCount int64
	_ = db.WithContext(c.Request().Context()).Model(&reports.ReportSchedule{}).Count(&scheduledCount)

	var failedCount int64
	_ = db.WithContext(c.Request().Context()).Model(&reports.Report{}).
		Where("status = ?", "failed").
		Count(&failedCount)

	type avgRow struct {
		Avg float64 `gorm:"column:avg_generation_time"`
	}
	var avg avgRow
	_ = db.WithContext(c.Request().Context()).Model(&reports.Report{}).
		Select("AVG(generation_time) AS avg_generation_time").
		Scan(&avg)

	usage, _ := h.computeFormatUsage(c.Request().Context(), db)
	mostUsed := "pdf"
	maxCount := 0
	for format, count := range usage {
		if count > maxCount {
			maxCount = count
			mostUsed = format
		}
	}

	storageUsed, _ := h.computeStorageUsage(c.Request().Context(), db)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"totalReports":      total,
			"generatedToday":    generatedToday,
			"scheduledReports":  scheduledCount,
			"failedReports":     failedCount,
			"avgGenerationTime": avg.Avg,
			"mostUsedFormat":    mostUsed,
			"storageUsed":       storageUsed,
		},
	})
}

func (h ReportsHandler) GetUsageAnalysis(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}

	var req struct {
		DateRange map[string]string `json:"dateRange"`
	}
	_ = c.Bind(&req)

	start, end := resolveDateRangeFromMap(req.DateRange)
	if start.IsZero() || end.IsZero() {
		end = time.Now().UTC()
		start = end.AddDate(0, 0, -7)
	}

	db := h.Service.DB()
	type dailyRow struct {
		Date  time.Time `gorm:"column:date"`
		Count int       `gorm:"column:count"`
	}
	rows := make([]dailyRow, 0)
	_ = db.WithContext(c.Request().Context()).
		Model(&reports.Report{}).
		Select("DATE(created_at) AS date, COUNT(*) AS count").
		Where("created_at >= ? AND created_at <= ?", start, end).
		Group("DATE(created_at)").
		Order("date").
		Scan(&rows)

	daily := make([]map[string]interface{}, 0, len(rows))
	for _, row := range rows {
		daily = append(daily, map[string]interface{}{
			"date":  row.Date.Format("2006-01-02"),
			"count": row.Count,
		})
	}

	type typeRow struct {
		ReportType string `gorm:"column:report_type"`
		Count      int    `gorm:"column:count"`
	}
	typeRows := make([]typeRow, 0)
	_ = db.WithContext(c.Request().Context()).
		Model(&reports.Report{}).
		Select("report_type, COUNT(*) AS count").
		Group("report_type").
		Scan(&typeRows)

	byType := map[string]int{}
	for _, row := range typeRows {
		byType[row.ReportType] = row.Count
	}

	byFormat, _ := h.computeFormatUsage(c.Request().Context(), db)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"dailyUsage": daily,
			"byType":     byType,
			"byFormat":   byFormat,
		},
	})
}

func (h ReportsHandler) GetPerformanceMetrics(c echo.Context) error {
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

	metrics, benchmarks, err := buildPerformanceMetrics(c.Request().Context(), db)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load performance metrics")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"metrics":    metrics,
			"benchmarks": benchmarks,
		},
	})
}

func (h ReportsHandler) GetTrendAnalysis(c echo.Context) error {
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

	var req map[string]interface{}
	_ = c.Bind(&req)

	metrics := readStringSlice(req, "metrics")
	if len(metrics) == 0 {
		metrics = []string{"availability", "performance", "errors", "capacity"}
	}
	granularity := normalizeGranularity(readString(req, "granularity"))
	deviceIDs := parseIntSlice(req["device_ids"])
	if len(deviceIDs) == 0 {
		deviceIDs = parseIntSlice(req["devices"])
	}

	start, end := resolveDateRangeFromPayload(req)
	if start.IsZero() || end.IsZero() {
		now := time.Now().UTC()
		start = now.AddDate(0, 0, -7)
		end = now
	}

	series, err := loadTrendSeries(c.Request().Context(), db, metrics, start, end, granularity, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load trend data")
	}

	payload := make([]map[string]interface{}, 0, len(series))
	for _, item := range series {
		payload = append(payload, buildTrendMetricPayload(item))
	}

	timeframe := timeframeForRange(start, end)
	predictions := buildTrendPredictions(series, predictionSteps(timeframe, granularity), timeframe)
	alerts := buildTrendAlerts(series, "medium", 50)

	dateRange := map[string]interface{}{
		"startDate": start.Format(time.RFC3339),
		"endDate":   end.Format(time.RFC3339),
	}
	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"timeRange":   dateRange,
			"metrics":     payload,
			"predictions": predictions,
			"alerts":      alerts,
		},
	})
}

func (h ReportsHandler) GenerateTrendReport(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:create"); err != nil {
		return err
	}
	return h.GenerateReportFromRequest(c)
}

func (h ReportsHandler) GetTrendPredictions(c echo.Context) error {
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

	var req map[string]interface{}
	_ = c.Bind(&req)

	metrics := readStringSlice(req, "metrics")
	if len(metrics) == 0 {
		metrics = []string{"availability", "performance"}
	}
	timeframe := normalizeTimeframe(readString(req, "timeframe"))
	deviceIDs := parseIntSlice(req["device_ids"])
	if len(deviceIDs) == 0 {
		deviceIDs = parseIntSlice(req["devices"])
	}

	end := time.Now().UTC()
	start := end.Add(-timeframeDuration(timeframe))
	granularity := "day"

	series, err := loadTrendSeries(c.Request().Context(), db, metrics, start, end, granularity, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load prediction data")
	}
	predictions := buildTrendPredictions(series, predictionSteps(timeframe, granularity), timeframe)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"predictions": predictions,
		},
	})
}

func (h ReportsHandler) GetTrendAnomalies(c echo.Context) error {
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

	var req map[string]interface{}
	_ = c.Bind(&req)

	metrics := readStringSlice(req, "metrics")
	if len(metrics) == 0 {
		metrics = []string{"availability", "performance", "errors", "capacity"}
	}
	sensitivity := readString(req, "sensitivity")
	if sensitivity == "" {
		sensitivity = "medium"
	}
	deviceIDs := parseIntSlice(req["device_ids"])
	if len(deviceIDs) == 0 {
		deviceIDs = parseIntSlice(req["devices"])
	}

	start, end := resolveDateRangeFromPayload(req)
	if start.IsZero() || end.IsZero() {
		end = time.Now().UTC()
		start = end.AddDate(0, 0, -7)
	}
	granularity := "day"
	if end.Sub(start) <= 48*time.Hour {
		granularity = "hour"
	}

	series, err := loadTrendSeries(c.Request().Context(), db, metrics, start, end, granularity, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load anomaly data")
	}

	anomalies := make([]map[string]interface{}, 0)
	summary := map[string]int{}
	for _, item := range series {
		items := detectAnomalies(item, sensitivity)
		for _, anomaly := range items {
			anomalies = append(anomalies, map[string]interface{}{
				"id":           fmt.Sprintf("%s-%s", anomaly.MetricName, anomaly.Timestamp.Format("20060102150405")),
				"metric":       anomaly.MetricName,
				"display_name": anomaly.DisplayName,
				"timestamp":    anomaly.Timestamp.Format(time.RFC3339),
				"value":        roundFloat(anomaly.Value, 2),
				"expected":     roundFloat(anomaly.Expected, 2),
				"score":        roundFloat(anomaly.Score, 2),
				"severity":     anomaly.Severity,
			})
			summary[anomaly.MetricName]++
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"anomalies": anomalies,
			"summary":   summary,
		},
	})
}
