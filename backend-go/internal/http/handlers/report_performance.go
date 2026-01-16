package handlers

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"strings"
	"time"

	"gorm.io/gorm"
)

type performanceMetricSpec struct {
	Name         string
	Unit         string
	MetricName   string
	DeviceColumn string
	Source       string
	ClampMin     float64
	ClampMax     float64
}

type metricStats struct {
	Current float64
	Average float64
	Peak    float64
}

const (
	perfSourceDevice  = "device_metrics"
	perfSourceNetwork = "network_metrics"
)

func buildPerformanceMetrics(ctx context.Context, db *gorm.DB) ([]map[string]interface{}, []map[string]interface{}, error) {
	if db == nil {
		return nil, nil, fmt.Errorf("database not initialized")
	}

	now := time.Now().UTC()
	currentStart := now.Add(-1 * time.Hour)
	avgStart := now.Add(-24 * time.Hour)

	specs := []performanceMetricSpec{
		{Name: "CPU使用率", Unit: "%", MetricName: "cpu_usage", DeviceColumn: "cpu_usage", Source: perfSourceDevice, ClampMin: 0, ClampMax: 100},
		{Name: "内存使用率", Unit: "%", MetricName: "memory_usage", DeviceColumn: "memory_usage", Source: perfSourceDevice, ClampMin: 0, ClampMax: 100},
		{Name: "磁盘使用率", Unit: "%", MetricName: "disk_usage", DeviceColumn: "disk_usage", Source: perfSourceDevice, ClampMin: 0, ClampMax: 100},
		{Name: "响应时间", Unit: "ms", MetricName: "response_time", DeviceColumn: "response_time", Source: perfSourceDevice, ClampMin: 0},
		{Name: "网络流量", Unit: "Mbps", Source: perfSourceNetwork, ClampMin: 0},
	}

	metrics := make([]map[string]interface{}, 0, len(specs))
	actuals := make(map[string]float64, len(specs))

	for _, spec := range specs {
		stats, err := queryMetricStats(ctx, db, spec, currentStart, avgStart, now)
		if err != nil {
			return nil, nil, err
		}
		stats.Current = clampValue(stats.Current, spec.ClampMin, spec.ClampMax)
		stats.Average = clampValue(stats.Average, spec.ClampMin, spec.ClampMax)
		stats.Peak = clampValue(stats.Peak, spec.ClampMin, spec.ClampMax)

		trend := computeMetricTrend(stats.Current, stats.Average)
		metrics = append(metrics, map[string]interface{}{
			"name":    spec.Name,
			"current": roundFloat(stats.Current, 2),
			"average": roundFloat(stats.Average, 2),
			"peak":    roundFloat(stats.Peak, 2),
			"unit":    spec.Unit,
			"trend":   trend,
		})
		actuals[spec.Name] = stats.Average
	}

	benchmarks := buildPerformanceBenchmarks(actuals)
	return metrics, benchmarks, nil
}

func queryMetricStats(
	ctx context.Context,
	db *gorm.DB,
	spec performanceMetricSpec,
	currentStart time.Time,
	avgStart time.Time,
	now time.Time,
) (metricStats, error) {
	if spec.Source == perfSourceNetwork {
		return queryNetworkMetricStats(ctx, db, currentStart, avgStart, now)
	}

	current, currentCount, err := queryMetricAverage(ctx, db, spec.MetricName, currentStart, now)
	if err != nil {
		return metricStats{}, err
	}
	if currentCount == 0 && spec.DeviceColumn != "" {
		if snapshot, ok, err := queryDeviceSnapshotAverage(ctx, db, spec.DeviceColumn); err == nil && ok {
			current = snapshot
		}
	}

	average, avgCount, err := queryMetricAverage(ctx, db, spec.MetricName, avgStart, now)
	if err != nil {
		return metricStats{}, err
	}
	peak, peakCount, err := queryMetricMax(ctx, db, spec.MetricName, avgStart, now)
	if err != nil {
		return metricStats{}, err
	}

	if avgCount == 0 {
		average = current
	}
	if peakCount == 0 {
		peak = current
	}

	return metricStats{
		Current: current,
		Average: average,
		Peak:    peak,
	}, nil
}

func queryMetricAverage(ctx context.Context, db *gorm.DB, metricName string, start time.Time, end time.Time) (float64, int64, error) {
	type row struct {
		AvgValue    sql.NullFloat64 `gorm:"column:avg_value"`
		SampleCount int64           `gorm:"column:sample_count"`
	}
	var result row
	err := db.WithContext(ctx).
		Table("device_metrics").
		Select("AVG(metric_value) AS avg_value, COUNT(*) AS sample_count").
		Where("metric_name = ?", metricName).
		Where("collected_at >= ? AND collected_at <= ?", start, end).
		Scan(&result).Error
	if err != nil {
		return 0, 0, err
	}
	if result.AvgValue.Valid {
		return result.AvgValue.Float64, result.SampleCount, nil
	}
	return 0, result.SampleCount, nil
}

func queryMetricMax(ctx context.Context, db *gorm.DB, metricName string, start time.Time, end time.Time) (float64, int64, error) {
	type row struct {
		MaxValue    sql.NullFloat64 `gorm:"column:max_value"`
		SampleCount int64           `gorm:"column:sample_count"`
	}
	var result row
	err := db.WithContext(ctx).
		Table("device_metrics").
		Select("MAX(metric_value) AS max_value, COUNT(*) AS sample_count").
		Where("metric_name = ?", metricName).
		Where("collected_at >= ? AND collected_at <= ?", start, end).
		Scan(&result).Error
	if err != nil {
		return 0, 0, err
	}
	if result.MaxValue.Valid {
		return result.MaxValue.Float64, result.SampleCount, nil
	}
	return 0, result.SampleCount, nil
}

func queryDeviceSnapshotAverage(ctx context.Context, db *gorm.DB, column string) (float64, bool, error) {
	column = strings.TrimSpace(column)
	if column == "" {
		return 0, false, nil
	}
	var avg sql.NullFloat64
	err := db.WithContext(ctx).
		Table("devices").
		Select(fmt.Sprintf("AVG(%s) AS avg_value", column)).
		Where("is_active = ?", true).
		Scan(&avg).Error
	if err != nil {
		return 0, false, err
	}
	if avg.Valid {
		return avg.Float64, true, nil
	}
	return 0, false, nil
}

func queryNetworkMetricStats(
	ctx context.Context,
	db *gorm.DB,
	currentStart time.Time,
	avgStart time.Time,
	now time.Time,
) (metricStats, error) {
	inbound := []string{"bandwidth_in", "network_bytes_in", "throughput_in"}
	outbound := []string{"bandwidth_out", "network_bytes_out", "throughput_out"}
	all := append(append([]string{}, inbound...), outbound...)
	if len(all) == 0 {
		return metricStats{}, nil
	}

	current, _, err := queryNetworkAggregate(ctx, db, all, currentStart, now)
	if err != nil {
		return metricStats{}, err
	}
	average, peak, err := queryNetworkAggregate(ctx, db, all, avgStart, now)
	if err != nil {
		return metricStats{}, err
	}

	return metricStats{
		Current: current / 1_000_000.0,
		Average: average / 1_000_000.0,
		Peak:    peak / 1_000_000.0,
	}, nil
}

func queryNetworkAggregate(ctx context.Context, db *gorm.DB, metrics []string, start time.Time, end time.Time) (float64, float64, error) {
	if len(metrics) == 0 {
		return 0, 0, nil
	}

	bucketExpr := "date_trunc('minute', collected_at)"
	query := fmt.Sprintf(
		`SELECT AVG(total) AS avg_value, MAX(total) AS max_value
         FROM (
             SELECT %s AS bucket, SUM(metric_value) AS total
             FROM device_metrics
             WHERE metric_name IN (%s) AND collected_at >= ? AND collected_at <= ?
             GROUP BY bucket
         ) s`,
		bucketExpr,
		formatMetricList(metrics),
	)

	type row struct {
		AvgValue sql.NullFloat64 `gorm:"column:avg_value"`
		MaxValue sql.NullFloat64 `gorm:"column:max_value"`
	}
	var result row
	if err := db.WithContext(ctx).Raw(query, start, end).Scan(&result).Error; err != nil {
		return 0, 0, err
	}

	avg := 0.0
	if result.AvgValue.Valid {
		avg = result.AvgValue.Float64
	}
	max := 0.0
	if result.MaxValue.Valid {
		max = result.MaxValue.Float64
	}

	return avg, max, nil
}

func computeMetricTrend(current float64, average float64) string {
	diff := current - average
	threshold := math.Max(0.5, math.Abs(average)*0.05)
	if diff > threshold {
		return "up"
	}
	if diff < -threshold {
		return "down"
	}
	return "stable"
}

func buildPerformanceBenchmarks(actuals map[string]float64) []map[string]interface{} {
	type benchmarkSpec struct {
		Metric string
		Target float64
	}
	specs := []benchmarkSpec{
		{Metric: "CPU使用率", Target: 70},
		{Metric: "内存使用率", Target: 75},
		{Metric: "磁盘使用率", Target: 80},
		{Metric: "响应时间", Target: 200},
	}

	benchmarks := make([]map[string]interface{}, 0, len(specs))
	for _, spec := range specs {
		actual, ok := actuals[spec.Metric]
		if !ok {
			continue
		}
		status := benchmarkStatus(actual, spec.Target)
		gap := actual - spec.Target
		benchmarks = append(benchmarks, map[string]interface{}{
			"metric": spec.Metric,
			"target": roundFloat(spec.Target, 2),
			"actual": roundFloat(actual, 2),
			"status": status,
			"gap":    roundFloat(gap, 2),
		})
	}
	return benchmarks
}

func benchmarkStatus(actual float64, target float64) string {
	if target <= 0 {
		return "warning"
	}
	if actual <= target {
		return "met"
	}
	if actual <= target*1.2 {
		return "warning"
	}
	return "critical"
}

