package handlers

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

const (
	trendSourceAvailability          = "availability"
	trendSourceAlerts                = "alerts"
	trendSourceDeviceMetrics         = "device_metrics"
	trendSourceDeviceMetricsFallback = "device_metrics_fallback"
	trendSourceNetworkSum            = "network_sum"
)

type trendMetricSpec struct {
	Name        string
	DisplayName string
	Unit        string
	Source      string
	MetricNames []string
	ClampMin    float64
	ClampMax    float64
}

type trendSeriesPoint struct {
	Timestamp time.Time
	Value     float64
}

type trendMetricSeries struct {
	Spec   trendMetricSpec
	Points []trendSeriesPoint
}

type trendAnomaly struct {
	MetricName  string
	DisplayName string
	Timestamp   time.Time
	Value       float64
	Expected    float64
	Score       float64
	Severity    string
}

func normalizeGranularity(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "minute", "hour", "day", "week", "month":
		return strings.ToLower(strings.TrimSpace(raw))
	default:
		return "day"
	}
}

func normalizeTrendMetricName(raw string) string {
	normalized := strings.ToLower(strings.TrimSpace(raw))
	switch normalized {
	case "availability", "performance", "errors", "capacity":
		return normalized
	case "network", "traffic", "bandwidth":
		return "network_traffic"
	default:
		return monitoring.NormalizeMetricName(normalized)
	}
}

func trendMetricSpecFor(raw string) trendMetricSpec {
	name := normalizeTrendMetricName(raw)
	switch name {
	case "availability":
		return trendMetricSpec{
			Name:        "availability",
			DisplayName: "可用性",
			Unit:        "%",
			Source:      trendSourceAvailability,
			ClampMin:    0,
			ClampMax:    100,
		}
	case "performance":
		return trendMetricSpec{
			Name:        "performance",
			DisplayName: "性能",
			Unit:        "ms",
			Source:      trendSourceDeviceMetrics,
			MetricNames: []string{"response_time"},
			ClampMin:    0,
		}
	case "errors":
		return trendMetricSpec{
			Name:        "errors",
			DisplayName: "错误数",
			Unit:        "count",
			Source:      trendSourceAlerts,
			ClampMin:    0,
		}
	case "capacity":
		return trendMetricSpec{
			Name:        "capacity",
			DisplayName: "容量使用",
			Unit:        "%",
			Source:      trendSourceDeviceMetricsFallback,
			MetricNames: []string{"disk_usage", "memory_usage", "cpu_usage"},
			ClampMin:    0,
			ClampMax:    100,
		}
	case "cpu_usage":
		return trendMetricSpec{
			Name:        "cpu_usage",
			DisplayName: "CPU使用率",
			Unit:        "%",
			Source:      trendSourceDeviceMetrics,
			MetricNames: []string{"cpu_usage"},
			ClampMin:    0,
			ClampMax:    100,
		}
	case "memory_usage":
		return trendMetricSpec{
			Name:        "memory_usage",
			DisplayName: "内存使用率",
			Unit:        "%",
			Source:      trendSourceDeviceMetrics,
			MetricNames: []string{"memory_usage"},
			ClampMin:    0,
			ClampMax:    100,
		}
	case "disk_usage":
		return trendMetricSpec{
			Name:        "disk_usage",
			DisplayName: "磁盘使用率",
			Unit:        "%",
			Source:      trendSourceDeviceMetrics,
			MetricNames: []string{"disk_usage"},
			ClampMin:    0,
			ClampMax:    100,
		}
	case "response_time":
		return trendMetricSpec{
			Name:        "response_time",
			DisplayName: "响应时间",
			Unit:        "ms",
			Source:      trendSourceDeviceMetrics,
			MetricNames: []string{"response_time"},
			ClampMin:    0,
		}
	case "bandwidth_utilization":
		return trendMetricSpec{
			Name:        "bandwidth_utilization",
			DisplayName: "带宽利用率",
			Unit:        "%",
			Source:      trendSourceDeviceMetrics,
			MetricNames: []string{"bandwidth_utilization"},
			ClampMin:    0,
			ClampMax:    100,
		}
	case "network_traffic":
		return trendMetricSpec{
			Name:        "network_traffic",
			DisplayName: "网络流量",
			Unit:        "Mbps",
			Source:      trendSourceNetworkSum,
			MetricNames: []string{"bandwidth_in", "network_bytes_in", "throughput_in", "bandwidth_out", "network_bytes_out", "throughput_out"},
			ClampMin:    0,
		}
	default:
		if name == "" {
			return trendMetricSpec{}
		}
		return trendMetricSpec{
			Name:        name,
			DisplayName: name,
			Unit:        "",
			Source:      trendSourceDeviceMetrics,
			MetricNames: []string{name},
			ClampMin:    0,
		}
	}
}

func loadTrendSeries(
	ctx context.Context,
	db *gorm.DB,
	metrics []string,
	start time.Time,
	end time.Time,
	granularity string,
	deviceIDs []int,
) ([]trendMetricSeries, error) {
	series := make([]trendMetricSeries, 0, len(metrics))
	for _, raw := range metrics {
		spec := trendMetricSpecFor(raw)
		if spec.Name == "" {
			continue
		}
		points, err := queryTrendSeries(ctx, db, spec, start, end, granularity, deviceIDs)
		if err != nil {
			return nil, err
		}
		series = append(series, trendMetricSeries{
			Spec:   spec,
			Points: points,
		})
	}
	return series, nil
}

func queryTrendSeries(
	ctx context.Context,
	db *gorm.DB,
	spec trendMetricSpec,
	start time.Time,
	end time.Time,
	granularity string,
	deviceIDs []int,
) ([]trendSeriesPoint, error) {
	switch spec.Source {
	case trendSourceAvailability:
		return queryAvailabilitySeries(ctx, db, start, end, granularity, deviceIDs)
	case trendSourceAlerts:
		return queryAlertSeries(ctx, db, start, end, granularity, deviceIDs)
	case trendSourceDeviceMetricsFallback:
		return queryDeviceMetricSeriesWithFallback(ctx, db, spec.MetricNames, start, end, granularity, deviceIDs)
	case trendSourceNetworkSum:
		return queryNetworkMetricSeries(ctx, db, spec.MetricNames, start, end, granularity, deviceIDs)
	default:
		return queryDeviceMetricSeries(ctx, db, spec.MetricNames, start, end, granularity, deviceIDs)
	}
}

func queryDeviceMetricSeries(
	ctx context.Context,
	db *gorm.DB,
	metricNames []string,
	start time.Time,
	end time.Time,
	granularity string,
	deviceIDs []int,
) ([]trendSeriesPoint, error) {
	if len(metricNames) == 0 {
		return []trendSeriesPoint{}, nil
	}

	bucketExpr := bucketExpression(granularity, "collected_at")
	selectExpr := fmt.Sprintf("%s AS bucket, AVG(metric_value) AS value", bucketExpr)

	type row struct {
		Bucket time.Time       `gorm:"column:bucket"`
		Value  sql.NullFloat64 `gorm:"column:value"`
	}

	query := db.WithContext(ctx).
		Table("device_metrics").
		Select(selectExpr).
		Where("metric_name IN ?", metricNames).
		Where("collected_at >= ? AND collected_at <= ?", start, end)

	if len(deviceIDs) > 0 {
		query = query.Where("device_id IN ?", deviceIDs)
	}

	rows := make([]row, 0)
	if err := query.Group("bucket").Order("bucket").Scan(&rows).Error; err != nil {
		return nil, err
	}

	points := make([]trendSeriesPoint, 0, len(rows))
	for _, item := range rows {
		if !item.Value.Valid {
			continue
		}
		points = append(points, trendSeriesPoint{
			Timestamp: item.Bucket.UTC(),
			Value:     item.Value.Float64,
		})
	}
	return points, nil
}

func queryDeviceMetricSeriesWithFallback(
	ctx context.Context,
	db *gorm.DB,
	metricNames []string,
	start time.Time,
	end time.Time,
	granularity string,
	deviceIDs []int,
) ([]trendSeriesPoint, error) {
	for _, name := range metricNames {
		points, err := queryDeviceMetricSeries(ctx, db, []string{name}, start, end, granularity, deviceIDs)
		if err != nil {
			return nil, err
		}
		if len(points) > 0 {
			return points, nil
		}
	}
	return []trendSeriesPoint{}, nil
}

func queryNetworkMetricSeries(
	ctx context.Context,
	db *gorm.DB,
	metricNames []string,
	start time.Time,
	end time.Time,
	granularity string,
	deviceIDs []int,
) ([]trendSeriesPoint, error) {
	if len(metricNames) == 0 {
		return []trendSeriesPoint{}, nil
	}

	bucketExpr := bucketExpression(granularity, "collected_at")
	selectExpr := fmt.Sprintf("%s AS bucket, SUM(metric_value) AS value", bucketExpr)

	type row struct {
		Bucket time.Time       `gorm:"column:bucket"`
		Value  sql.NullFloat64 `gorm:"column:value"`
	}
	rows := make([]row, 0)

	query := db.WithContext(ctx).
		Table("device_metrics").
		Select(selectExpr).
		Where("metric_name IN ?", metricNames).
		Where("collected_at >= ? AND collected_at <= ?", start, end)
	if len(deviceIDs) > 0 {
		query = query.Where("device_id IN ?", deviceIDs)
	}

	if err := query.Group("bucket").Order("bucket").Scan(&rows).Error; err != nil {
		return nil, err
	}

	points := make([]trendSeriesPoint, 0, len(rows))
	for _, item := range rows {
		if !item.Value.Valid {
			continue
		}
		points = append(points, trendSeriesPoint{
			Timestamp: item.Bucket.UTC(),
			Value:     item.Value.Float64 / 1_000_000.0,
		})
	}
	return points, nil
}

func queryAlertSeries(
	ctx context.Context,
	db *gorm.DB,
	start time.Time,
	end time.Time,
	granularity string,
	deviceIDs []int,
) ([]trendSeriesPoint, error) {
	bucketExpr := bucketExpression(granularity, "a.created_at")
	selectExpr := fmt.Sprintf("%s AS bucket, COUNT(*) AS value", bucketExpr)

	type row struct {
		Bucket time.Time `gorm:"column:bucket"`
		Value  int64     `gorm:"column:value"`
	}

	query := db.WithContext(ctx).
		Table("alerts AS a").
		Joins("JOIN devices d ON d.id = a.device_id").
		Select(selectExpr).
		Where("a.created_at >= ? AND a.created_at <= ?", start, end)

	if len(deviceIDs) > 0 {
		query = query.Where("a.device_id IN ?", deviceIDs)
	}

	rows := make([]row, 0)
	if err := query.Group("bucket").Order("bucket").Scan(&rows).Error; err != nil {
		return nil, err
	}

	points := make([]trendSeriesPoint, 0, len(rows))
	for _, item := range rows {
		points = append(points, trendSeriesPoint{
			Timestamp: item.Bucket.UTC(),
			Value:     float64(item.Value),
		})
	}
	return points, nil
}

func queryAvailabilitySeries(
	ctx context.Context,
	db *gorm.DB,
	start time.Time,
	end time.Time,
	granularity string,
	deviceIDs []int,
) ([]trendSeriesPoint, error) {
	exists, err := tableExists(ctx, db, "device_status_history")
	if err != nil {
		return nil, err
	}
	if !exists {
		value, err := queryAvailabilitySnapshot(ctx, db, deviceIDs)
		if err != nil {
			return nil, err
		}
		return []trendSeriesPoint{{Timestamp: end.UTC(), Value: value}}, nil
	}

	bucketExpr := bucketExpression(granularity, "collected_at")
	selectExpr := fmt.Sprintf(`%s AS bucket,
        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) AS online,
        COUNT(*) AS total`, bucketExpr)

	type row struct {
		Bucket time.Time `gorm:"column:bucket"`
		Online int64     `gorm:"column:online"`
		Total  int64     `gorm:"column:total"`
	}

	query := db.WithContext(ctx).
		Table("device_status_history").
		Select(selectExpr).
		Where("collected_at >= ? AND collected_at <= ?", start, end)

	if len(deviceIDs) > 0 {
		query = query.Where("device_id IN ?", deviceIDs)
	}

	rows := make([]row, 0)
	if err := query.Group("bucket").Order("bucket").Scan(&rows).Error; err != nil {
		return nil, err
	}

	points := make([]trendSeriesPoint, 0, len(rows))
	for _, item := range rows {
		value := 0.0
		if item.Total > 0 {
			value = float64(item.Online) / float64(item.Total) * 100
		}
		points = append(points, trendSeriesPoint{
			Timestamp: item.Bucket.UTC(),
			Value:     value,
		})
	}

	if len(points) == 0 {
		value, err := queryAvailabilitySnapshot(ctx, db, deviceIDs)
		if err != nil {
			return nil, err
		}
		return []trendSeriesPoint{{Timestamp: end.UTC(), Value: value}}, nil
	}

	return points, nil
}

func queryAvailabilitySnapshot(ctx context.Context, db *gorm.DB, deviceIDs []int) (float64, error) {
	type row struct {
		Total  int64 `gorm:"column:total"`
		Online int64 `gorm:"column:online"`
	}

	query := db.WithContext(ctx).
		Table("devices").
		Select("COUNT(*) AS total, SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) AS online")

	if len(deviceIDs) > 0 {
		query = query.Where("id IN ?", deviceIDs)
	}

	var item row
	if err := query.Scan(&item).Error; err != nil {
		return 0, err
	}
	if item.Total == 0 {
		return 0, nil
	}
	return float64(item.Online) / float64(item.Total) * 100, nil
}

func bucketExpression(granularity string, column string) string {
	switch normalizeGranularity(granularity) {
	case "minute":
		return fmt.Sprintf("date_trunc('minute', %s)", column)
	case "hour":
		return fmt.Sprintf("date_trunc('hour', %s)", column)
	case "week":
		return fmt.Sprintf("date_trunc('week', %s)", column)
	case "month":
		return fmt.Sprintf("date_trunc('month', %s)", column)
	default:
		return fmt.Sprintf("date_trunc('day', %s)", column)
	}
}

func formatMetricList(metrics []string) string {
	if len(metrics) == 0 {
		return "''"
	}
	escaped := make([]string, 0, len(metrics))
	for _, metric := range metrics {
		escaped = append(escaped, fmt.Sprintf("'%s'", strings.ReplaceAll(metric, "'", "''")))
	}
	return strings.Join(escaped, ",")
}

func tableExists(ctx context.Context, db *gorm.DB, name string) (bool, error) {
	var exists bool
	err := db.WithContext(ctx).
		Raw("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ?)", name).
		Scan(&exists).Error
	return exists, err
}

func buildTrendMetricPayload(series trendMetricSeries) map[string]interface{} {
	points := make([]map[string]interface{}, 0, len(series.Points))
	values := make([]float64, 0, len(series.Points))
	for _, point := range series.Points {
		value := clampValue(point.Value, series.Spec.ClampMin, series.Spec.ClampMax)
		points = append(points, map[string]interface{}{
			"timestamp": point.Timestamp.Format(time.RFC3339),
			"value":     roundFloat(value, 2),
		})
		values = append(values, value)
	}

	current, previous, change, changePct, direction := summarizeTrend(values)

	return map[string]interface{}{
		"name":              series.Spec.Name,
		"metric_name":       series.Spec.Name,
		"display_name":      series.Spec.DisplayName,
		"unit":              series.Spec.Unit,
		"current":           roundFloat(current, 2),
		"previous":          roundFloat(previous, 2),
		"change":            roundFloat(change, 2),
		"change_percentage": roundFloat(changePct, 2),
		"trend_direction":   direction,
		"data_points":       points,
	}
}

func summarizeTrend(values []float64) (float64, float64, float64, float64, string) {
	if len(values) == 0 {
		return 0, 0, 0, 0, "stable"
	}
	current := values[len(values)-1]
	previous := values[0]
	change := current - previous
	changePct := 0.0
	if previous != 0 {
		changePct = change / previous * 100
	}

	direction := "stable"
	if change > 0 {
		direction = "up"
	} else if change < 0 {
		direction = "down"
	}

	return current, previous, change, changePct, direction
}

func clampValue(value float64, min float64, max float64) float64 {
	if value < min {
		value = min
	}
	if max > min && value > max {
		value = max
	}
	return value
}

func buildTrendPredictions(series []trendMetricSeries, steps int, timeframe string) []map[string]interface{} {
	predictions := make([]map[string]interface{}, 0)
	for _, item := range series {
		if len(item.Points) < 2 {
			continue
		}
		current, predicted, confidence := predictSeries(item, steps)
		recommendation := predictionRecommendation(item.Spec.Name, predicted)
		predictions = append(predictions, map[string]interface{}{
			"metric":          item.Spec.Name,
			"current_value":   roundFloat(current, 2),
			"predicted_value": roundFloat(predicted, 2),
			"confidence":      roundFloat(confidence, 2),
			"timeframe":       timeframe,
			"recommendation":  recommendation,
		})
	}
	return predictions
}

func predictSeries(item trendMetricSeries, steps int) (float64, float64, float64) {
	values := make([]float64, 0, len(item.Points))
	for _, point := range item.Points {
		values = append(values, clampValue(point.Value, item.Spec.ClampMin, item.Spec.ClampMax))
	}
	if len(values) == 0 {
		return 0, 0, 0
	}
	current := values[len(values)-1]
	if len(values) < 2 {
		return current, current, 0
	}
	if steps <= 0 {
		steps = 1
	}
	if steps > len(values) {
		steps = len(values)
	}
	slope := (values[len(values)-1] - values[0]) / float64(len(values)-1)
	predicted := current + slope*float64(steps)
	predicted = clampValue(predicted, item.Spec.ClampMin, item.Spec.ClampMax)
	confidence := predictionConfidence(values)
	return current, predicted, confidence
}

func predictionConfidence(values []float64) float64 {
	if len(values) < 2 {
		return 0
	}
	mean, std := meanStd(values)
	if mean == 0 {
		mean = 1
	}
	relativeStd := std / math.Abs(mean)
	confidence := 0.6 + 0.05*float64(minInt(len(values), 6))
	if relativeStd > 1 {
		confidence -= 0.2
	} else if relativeStd > 0.5 {
		confidence -= 0.1
	}
	if confidence < 0.2 {
		confidence = 0.2
	}
	if confidence > 0.95 {
		confidence = 0.95
	}
	return confidence
}

func predictionRecommendation(metric string, predicted float64) string {
	switch metric {
	case "availability":
		if predicted < 95 {
			return "可用性下降，建议排查设备稳定性"
		}
		return "保持当前运维策略"
	case "performance", "response_time":
		if predicted > 200 {
			return "响应时间升高，建议优化链路或资源"
		}
		return "性能稳定，无需调整"
	case "errors":
		if predicted > 0 {
			return "错误数上升，建议关注告警波动"
		}
		return "暂无异常趋势"
	case "capacity", "cpu_usage", "memory_usage", "disk_usage":
		if predicted > 80 {
			return "容量使用偏高，建议预留扩容空间"
		}
		return "容量使用稳定"
	default:
		return ""
	}
}

func buildTrendAlerts(series []trendMetricSeries, sensitivity string, limit int) []map[string]interface{} {
	alerts := make([]map[string]interface{}, 0)
	for _, item := range series {
		anomalies := detectAnomalies(item, sensitivity)
		for _, anomaly := range anomalies {
			alerts = append(alerts, map[string]interface{}{
				"id":               fmt.Sprintf("%s-%s", anomaly.MetricName, anomaly.Timestamp.Format("20060102150405")),
				"type":             "anomaly",
				"severity":         anomaly.Severity,
				"title":            fmt.Sprintf("%s波动异常", anomaly.DisplayName),
				"description":      fmt.Sprintf("检测到%s在%s出现异常值", anomaly.DisplayName, anomaly.Timestamp.Format(time.RFC3339)),
				"affected_metrics": []string{anomaly.MetricName},
				"detected_at":      anomaly.Timestamp.Format(time.RFC3339),
				"status":           "active",
			})
			if limit > 0 && len(alerts) >= limit {
				return alerts
			}
		}
	}
	return alerts
}

func detectAnomalies(series trendMetricSeries, sensitivity string) []trendAnomaly {
	points := series.Points
	if len(points) < 6 {
		return []trendAnomaly{}
	}
	values := make([]float64, 0, len(points))
	for _, point := range points {
		values = append(values, clampValue(point.Value, series.Spec.ClampMin, series.Spec.ClampMax))
	}
	mean, std := meanStd(values)
	if std == 0 {
		return []trendAnomaly{}
	}
	threshold := anomalyThreshold(sensitivity)
	anomalies := make([]trendAnomaly, 0)
	for idx, point := range points {
		value := values[idx]
		score := math.Abs(value-mean) / std
		if score < threshold {
			continue
		}
		anomalies = append(anomalies, trendAnomaly{
			MetricName:  series.Spec.Name,
			DisplayName: series.Spec.DisplayName,
			Timestamp:   point.Timestamp.UTC(),
			Value:       value,
			Expected:    mean,
			Score:       score,
			Severity:    anomalySeverity(score, threshold),
		})
	}
	return anomalies
}

func anomalyThreshold(sensitivity string) float64 {
	switch strings.ToLower(strings.TrimSpace(sensitivity)) {
	case "high":
		return 2.0
	case "low":
		return 3.0
	default:
		return 2.5
	}
}

func anomalySeverity(score float64, threshold float64) string {
	switch {
	case score >= threshold*1.8:
		return "critical"
	case score >= threshold*1.3:
		return "error"
	default:
		return "warning"
	}
}

func meanStd(values []float64) (float64, float64) {
	if len(values) == 0 {
		return 0, 0
	}
	sum := 0.0
	for _, value := range values {
		sum += value
	}
	mean := sum / float64(len(values))
	variance := 0.0
	for _, value := range values {
		diff := value - mean
		variance += diff * diff
	}
	variance = variance / float64(len(values))
	return mean, math.Sqrt(variance)
}

func minInt(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

func normalizeTimeframe(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "week", "month", "quarter":
		return strings.ToLower(strings.TrimSpace(raw))
	default:
		return "week"
	}
}

func timeframeDuration(timeframe string) time.Duration {
	switch normalizeTimeframe(timeframe) {
	case "month":
		return 30 * 24 * time.Hour
	case "quarter":
		return 90 * 24 * time.Hour
	default:
		return 7 * 24 * time.Hour
	}
}

func predictionSteps(timeframe string, granularity string) int {
	switch normalizeTimeframe(timeframe) {
	case "month":
		return stepsByGranularity(granularity, 30)
	case "quarter":
		return stepsByGranularity(granularity, 90)
	default:
		return stepsByGranularity(granularity, 7)
	}
}

func stepsByGranularity(granularity string, days int) int {
	switch normalizeGranularity(granularity) {
	case "hour":
		return days * 24
	case "week":
		if days >= 7 {
			return days / 7
		}
		return 1
	case "month":
		if days >= 30 {
			return days / 30
		}
		return 1
	default:
		return days
	}
}

func timeframeForRange(start time.Time, end time.Time) string {
	if end.Before(start) {
		return "week"
	}
	days := end.Sub(start).Hours() / 24
	switch {
	case days <= 7:
		return "week"
	case days <= 30:
		return "month"
	default:
		return "quarter"
	}
}

func parseIntSlice(value interface{}) []int {
	if value == nil {
		return []int{}
	}
	switch v := value.(type) {
	case []int:
		return append([]int{}, v...)
	case []int64:
		ids := make([]int, 0, len(v))
		for _, item := range v {
			ids = append(ids, int(item))
		}
		return ids
	case []interface{}:
		ids := make([]int, 0, len(v))
		for _, item := range v {
			switch raw := item.(type) {
			case int:
				ids = append(ids, raw)
			case int64:
				ids = append(ids, int(raw))
			case float64:
				ids = append(ids, int(raw))
			case string:
				if parsed, err := strconv.Atoi(strings.TrimSpace(raw)); err == nil {
					ids = append(ids, parsed)
				}
			}
		}
		return ids
	case []string:
		ids := make([]int, 0, len(v))
		for _, item := range v {
			if parsed, err := strconv.Atoi(strings.TrimSpace(item)); err == nil {
				ids = append(ids, parsed)
			}
		}
		return ids
	case string:
		parts := strings.Split(v, ",")
		ids := make([]int, 0, len(parts))
		for _, part := range parts {
			if parsed, err := strconv.Atoi(strings.TrimSpace(part)); err == nil {
				ids = append(ids, parsed)
			}
		}
		return ids
	default:
		return []int{}
	}
}
