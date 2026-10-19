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

// trendDisplayPrecision 是趋势指标展示值的统一小数位：current/previous/change
// 与变化率都按它取整，确保报告里「当前 − 上期 = 变化」的算术自洽。
const trendDisplayPrecision = 2

// defaultTrendSensitivity 是异常检测的默认灵敏度，供分析接口与报表生成共用，
// 避免同一个魔数散落多处后失配。
const defaultTrendSensitivity = "medium"

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
	tz string,
) ([]trendMetricSeries, error) {
	series := make([]trendMetricSeries, 0, len(metrics))
	for _, raw := range metrics {
		spec := trendMetricSpecFor(raw)
		if spec.Name == "" {
			continue
		}
		points, source, err := queryTrendSeries(ctx, db, spec, start, end, granularity, deviceIDs, tz)
		if err != nil {
			return nil, err
		}
		spec.DisplayName = trendMetricDisplayNameFor(spec, source)
		series = append(series, trendMetricSeries{
			Spec:   spec,
			Points: points,
		})
	}
	return series, nil
}

// queryTrendSeries 取序列，并回传「实际命中的来源指标名」——只有 fallback
// 分支可能非空（代理指标要据此标注来源）。其余分支返回空串。
func queryTrendSeries(
	ctx context.Context,
	db *gorm.DB,
	spec trendMetricSpec,
	start time.Time,
	end time.Time,
	granularity string,
	deviceIDs []int,
	tz string,
) ([]trendSeriesPoint, string, error) {
	switch spec.Source {
	case trendSourceAvailability:
		points, err := queryAvailabilitySeries(ctx, db, start, end, granularity, deviceIDs, tz)
		return points, "", err
	case trendSourceAlerts:
		points, err := queryAlertSeries(ctx, db, start, end, granularity, deviceIDs, tz)
		return points, "", err
	case trendSourceDeviceMetricsFallback:
		return queryDeviceMetricSeriesWithFallback(ctx, db, spec.MetricNames, start, end, granularity, deviceIDs, tz)
	case trendSourceNetworkSum:
		points, err := queryNetworkMetricSeries(ctx, db, spec.MetricNames, start, end, granularity, deviceIDs, tz)
		return points, "", err
	default:
		points, err := queryDeviceMetricSeries(ctx, db, spec.MetricNames, start, end, granularity, deviceIDs, tz)
		return points, "", err
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
	tz string,
) ([]trendSeriesPoint, error) {
	if len(metricNames) == 0 {
		return []trendSeriesPoint{}, nil
	}

	bucketExpr := bucketExpression(granularity, "collected_at", tz)
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
	tz string,
) ([]trendSeriesPoint, string, error) {
	for _, name := range metricNames {
		points, err := queryDeviceMetricSeries(ctx, db, []string{name}, start, end, granularity, deviceIDs, tz)
		if err != nil {
			return nil, "", err
		}
		if len(points) > 0 {
			// 一并返回命中的真实指标：代理指标（如 capacity 依 disk→memory→cpu
			// 兜底）需要据此标注来源，否则会把内存/CPU 数据标成「容量使用」。
			return points, name, nil
		}
	}
	return []trendSeriesPoint{}, "", nil
}

func queryNetworkMetricSeries(
	ctx context.Context,
	db *gorm.DB,
	metricNames []string,
	start time.Time,
	end time.Time,
	granularity string,
	deviceIDs []int,
	tz string,
) ([]trendSeriesPoint, error) {
	if len(metricNames) == 0 {
		return []trendSeriesPoint{}, nil
	}

	bucketExpr := bucketExpression(granularity, "collected_at", tz)
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
	tz string,
) ([]trendSeriesPoint, error) {
	bucketExpr := bucketExpression(granularity, "a.created_at", tz)
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
	tz string,
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

	bucketExpr := bucketExpression(granularity, "collected_at", tz)
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

// bucketExpression 生成按业务时区截断的分桶表达式。
// 先 AT TIME ZONE 把 timestamptz 换算成业务时区的本地时间再 date_trunc，
// 再 AT TIME ZONE 转回 timestamptz——保持「桶起点 = 本地时刻」的瞬时语义，
// 使返回值可直接 Format(RFC3339) 传给前端，且不依赖数据库会话时区。
// tz 来自 system.timezone，已被 timezonePattern 校验（无引号注入风险）。
func bucketExpression(granularity string, column string, tz string) string {
	unit := normalizeGranularity(granularity)
	switch unit {
	case "minute", "hour", "week", "month":
		// 合法单位，原样使用
	default:
		unit = "day"
	}
	return fmt.Sprintf("date_trunc('%s', %s AT TIME ZONE '%s') AT TIME ZONE '%s'", unit, column, tz, tz)
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

	// summarizeTrend 已按展示精度取整，这里直接采用，保证
	//「当前 − 上期 = 变化」在报告里能对上。
	current, previous, change, changePct, direction := summarizeTrend(values)

	return map[string]interface{}{
		"name":              series.Spec.Name,
		"metric_name":       series.Spec.Name,
		"display_name":      series.Spec.DisplayName,
		"unit":              series.Spec.Unit,
		"current":           current,
		"previous":          previous,
		"change":            change,
		"change_percentage": roundPercentForDisplay(changePct),
		"trend_direction":   direction,
		"data_points":       points,
	}
}

// summarizeTrend 汇总窗内首末值（current=末值、previous=首值）。
//
// 关键：先把 current/previous 按展示精度取整，再由取整后的值推导 change 与
// 方向 —— 否则会出现两类自相矛盾：
//  1. 报告显示 72.08 − 72.05 = 0.03，变化列却标 0.04（由未取整值相减）；
//  2. change 实际为 +0.001 时方向标「↑ 上升」，显示出来的变化却是「+0.00」。
//
// 取整后再推导，读者用报告里的数字自己算也能对得上。
func summarizeTrend(values []float64) (current, previous, change, changePct float64, direction string) {
	if len(values) == 0 {
		return 0, 0, 0, 0, "stable"
	}
	current = roundFloat(values[len(values)-1], trendDisplayPrecision)
	previous = roundFloat(values[0], trendDisplayPrecision)
	change = roundFloat(current-previous, trendDisplayPrecision)
	if previous != 0 {
		changePct = change / previous * 100
	}

	switch {
	case change > 0:
		direction = "up"
	case change < 0:
		direction = "down"
	default:
		direction = "stable"
	}
	return current, previous, change, changePct, direction
}

// roundPercentForDisplay 保留变化率的有效精度：常规值 2 位小数足够，但微小
// 变化（<0.01%）若也压到 2 位会显示成「0.00」，与「无变化」混淆，故多留 2 位。
func roundPercentForDisplay(value float64) float64 {
	if value != 0 && math.Abs(value) < 0.01 {
		return roundFloat(value, 4)
	}
	return roundFloat(value, trendDisplayPrecision)
}

// trendMetricDisplayNameFor 在 fallback 解析出真实来源指标时，把「容量使用」这类
// 代理指标改写成「容量使用（内存）」——否则底层取的是内存/CPU 数据却标成容量，
// 会误导读者。命中名义（列表首个）指标或未解析出来源时保持原名。
func trendMetricDisplayNameFor(spec trendMetricSpec, sourceMetric string) string {
	nominal := ""
	if len(spec.MetricNames) > 0 {
		nominal = spec.MetricNames[0]
	}
	return trendMetricFallbackDisplayName(spec.DisplayName, nominal, sourceMetric)
}

// trendMetricFallbackDisplayName 是展示名决策的纯字符串版本（便于单测）：
// 来源与名义指标一致、或未解析出来源时保持原名，否则补「（来源）」。
func trendMetricFallbackDisplayName(displayName, nominalMetric, sourceMetric string) string {
	if sourceMetric == "" || sourceMetric == nominalMetric {
		return displayName
	}
	return fmt.Sprintf("%s（%s）", displayName, trendMetricSourceLabel(sourceMetric))
}

// trendMetricSourceLabel 返回来源指标的短标签：括号内的补充说明必须塞进
// 「指标」列宽（约 38mm），故用「磁盘/内存/CPU」这类简称而非完整指标名。
func trendMetricSourceLabel(metricName string) string {
	switch metricName {
	case "disk_usage":
		return "磁盘"
	case "memory_usage":
		return "内存"
	case "cpu_usage":
		return "CPU"
	default:
		return trendMetricSpecFor(metricName).DisplayName
	}
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

// minAnomalyDetectionPoints 是异常检测所需的最少采样点数。
// 检测基于 z-score（均值/标准差），样本过少时标准差不稳定，会产生大量误报，
// 因此低于该阈值时直接跳过检测而不是放宽判据。
const minAnomalyDetectionPoints = 6

// buildTrendAlertsMeta 说明本次告警检测的执行情况。
//
// 「没有告警」有两种截然不同的含义：检测跑了但没发现异常，或样本不足压根没跑。
// 前端只拿到空数组无法区分二者，会把「未检测」误呈现为「一切正常」，
// 因此这里把判据随响应一起返回。
func buildTrendAlertsMeta(series []trendMetricSeries, sensitivity string) map[string]interface{} {
	maxPoints := 0
	for _, item := range series {
		if len(item.Points) > maxPoints {
			maxPoints = len(item.Points)
		}
	}
	normalized := normalizeTrendSensitivity(sensitivity)

	return map[string]interface{}{
		"evaluated":           maxPoints >= minAnomalyDetectionPoints,
		"min_points_required": minAnomalyDetectionPoints,
		"actual_points":       maxPoints,
		// 判定口径随结果一并返回：读者看到「无异常」时需知道是按多大灵敏度、
		// 多少 z-score 阈值判的，否则无从判断宽严。
		"sensitivity":       normalized,
		"z_score_threshold": anomalyThreshold(normalized),
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
	if len(points) < minAnomalyDetectionPoints {
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

// normalizeTrendSensitivity 归一灵敏度取值，非法值退回默认（medium）。
func normalizeTrendSensitivity(sensitivity string) string {
	switch strings.ToLower(strings.TrimSpace(sensitivity)) {
	case "high":
		return "high"
	case "low":
		return "low"
	default:
		return defaultTrendSensitivity
	}
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

// timeframeForRange 按时间范围跨度选择预测周期。用「日历日」而非
// end.Sub(start).Hours()/24 判档：后者是浮点且带时刻误差，恰好 7 天的区间
// 可能算出 7.0000001 而被误判成「月」，预测步长随之突变（跨 DST 时更明显）。
func timeframeForRange(start time.Time, end time.Time) string {
	if end.Before(start) {
		return "week"
	}
	switch days := calendarDaysBetween(start, end); {
	case days <= 7:
		return "week"
	case days <= 30:
		return "month"
	default:
		return "quarter"
	}
}

// calendarDaysBetween 返回两个时刻各自所在日历日之间的天数差（忽略时刻），
// 对 DST/毫秒偏差免疫。两个时刻应来自同一解析路径（同一时区）。
func calendarDaysBetween(start time.Time, end time.Time) int {
	sy, sm, sd := start.Date()
	ey, em, ed := end.Date()
	startDay := time.Date(sy, sm, sd, 0, 0, 0, 0, time.UTC)
	endDay := time.Date(ey, em, ed, 0, 0, 0, 0, time.UTC)
	return int(endDay.Sub(startDay).Hours() / 24)
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
