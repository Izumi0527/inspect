package handlers

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

func buildResultStatusFilter(statusList []string) (string, []interface{}) {
	conditions := make([]string, 0, len(statusList))
	args := make([]interface{}, 0)
	for _, raw := range statusList {
		switch strings.ToLower(strings.TrimSpace(raw)) {
		case "success":
			conditions = append(conditions, "(status = ? AND failed_checks = 0 AND warning_checks = 0)")
			args = append(args, inspection.StatusCompleted)
		case "warning":
			conditions = append(conditions, "(status = ? AND warning_checks > 0 AND failed_checks = 0)")
			args = append(args, inspection.StatusCompleted)
		case "error":
			conditions = append(conditions, "(status IN ? OR failed_checks > 0)")
			args = append(args, []string{inspection.StatusFailed, inspection.StatusCancelled, inspection.StatusTimeout})
		case "offline":
			conditions = append(conditions, "(status IN ?)")
			args = append(args, []string{inspection.StatusPending, inspection.StatusRunning})
		}
	}
	return strings.Join(conditions, " OR "), args
}

func resolveRequestedAnalyticsRange(c echo.Context, loc *time.Location) (time.Time, time.Time, bool) {
	if c == nil {
		return time.Time{}, time.Time{}, false
	}

	period := strings.TrimSpace(c.QueryParam("period"))
	startRaw := strings.TrimSpace(c.QueryParam("start_date"))
	endRaw := strings.TrimSpace(c.QueryParam("end_date"))
	if period == "" && startRaw == "" && endRaw == "" {
		return time.Time{}, time.Time{}, false
	}
	if period == "" {
		period = "week"
	}

	startDate, _ := parseOptionalDate(startRaw, loc)
	endDate, _ := parseOptionalDate(endRaw, loc)
	start, end := resolveTrendRange(period, startDate, endDate, loc)
	return start, end, true
}

// resolveStatsRange 解析 "range" 快捷参数（7d/30d/24h/当天）。
// 默认分支是「当天」，必须用业务时区 loc 取年月日：用 UTC 会取到 UTC 的今天，
// 与用户看到的本地「今天」错开。
func resolveStatsRange(value string, loc *time.Location) (time.Time, time.Time) {
	now := time.Now().In(loc)
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "7d":
		return now.Add(-7 * 24 * time.Hour), now
	case "30d":
		return now.Add(-30 * 24 * time.Hour), now
	case "24h":
		return now.Add(-24 * time.Hour), now
	default:
		start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
		return start, start.Add(24 * time.Hour)
	}
}

var allowedStatsTimeColumns = map[string]bool{
	"started_at":   true,
	"created_at":   true,
	"completed_at": true,
}

func batchStatsSubquerySelect(includeStartedAt bool) string {
	cols := []string{
		executionGroupKeyExpr + " AS group_key",
	}
	if includeStartedAt {
		cols = append(cols, "MIN(started_at) AS batch_started_at")
	}
	cols = append(
		cols,
		// 批次完成口径：批内无 running/pending 且至少有一台设备完成
		"CASE WHEN SUM(CASE WHEN status IN ('running', 'pending') THEN 1 ELSE 0 END) = 0 AND SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) > 0 THEN 1 ELSE 0 END AS batch_completed",
		// 批次失败口径：批内无 running/pending/completed 且存在 failed/timeout
		"CASE WHEN SUM(CASE WHEN status IN ('running', 'pending', 'completed') THEN 1 ELSE 0 END) = 0 AND SUM(CASE WHEN status IN ('failed', 'timeout') THEN 1 ELSE 0 END) > 0 THEN 1 ELSE 0 END AS batch_failed",
		// 评分口径与执行历史一致：仅统计已执行项（排除 skipped / not_applicable）
		"CASE WHEN SUM(passed_checks + failed_checks + warning_checks) > 0 THEN SUM(passed_checks)::float / SUM(passed_checks + failed_checks + warning_checks) * 100 ELSE NULL END AS batch_score",
	)
	return strings.Join(cols, ", ")
}

func computeStatsSummary(ctx context.Context, db *gorm.DB, timeColumn string, start time.Time, end time.Time) (statsSummary, error) {
	if db == nil {
		return statsSummary{}, fmt.Errorf("database not initialized")
	}
	column := strings.TrimSpace(timeColumn)
	if !allowedStatsTimeColumns[column] {
		column = "started_at"
	}
	rangeCondition := fmt.Sprintf("%s >= ? AND %s <= ?", column, column)

	sub := db.WithContext(ctx).
		Table("inspections").
		Select(batchStatsSubquerySelect(false)).
		Where(rangeCondition, start, end).
		Group(executionGroupKeyExpr)

	type statsAggRow struct {
		TotalExecutions   int     `gorm:"column:total_executions"`
		SuccessExecutions int     `gorm:"column:success_executions"`
		AvgScore          float64 `gorm:"column:avg_score"`
	}
	agg := statsAggRow{}
	if err := db.WithContext(ctx).
		Table("(?) AS batch_stats", sub).
		Select("COUNT(*) AS total_executions, COALESCE(SUM(batch_completed), 0) AS success_executions, COALESCE(AVG(CASE WHEN batch_completed = 1 THEN batch_score ELSE NULL END), 0) AS avg_score").
		Scan(&agg).Error; err != nil {
		return statsSummary{}, err
	}

	successRate := 0.0
	if agg.TotalExecutions > 0 {
		successRate = float64(agg.SuccessExecutions) / float64(agg.TotalExecutions) * 100
	}

	return statsSummary{
		TotalExecutions: agg.TotalExecutions,
		SuccessRate:     roundFloat(successRate, 1),
		AvgScore:        roundFloat(agg.AvgScore, 1),
	}, nil
}

func pctChange(current int, previous int) string {
	if previous == 0 {
		if current > 0 {
			return "+100.0%"
		}
		return "0.0%"
	}
	diff := (float64(current-previous) / float64(previous)) * 100
	return fmt.Sprintf("%+.1f%%", diff)
}

func deltaChangeWithBaseline(current float64, previous float64, hasPrevious bool) string {
	if !hasPrevious {
		return "0.0%"
	}
	return fmt.Sprintf("%+.1f%%", current-previous)
}

// resolvePreviousRange 计算与 [start, end] 等长且不重叠的上一比较周期，
// 防止 <= 边界把 start 时刻的记录同时算入当前周期与上一周期；
// 使用 -1µs 适配 PostgreSQL timestamptz 微秒精度，避免纳秒进位到 start。
func resolvePreviousRange(start time.Time, end time.Time) (time.Time, time.Time) {
	span := end.Sub(start)
	if end.Nanosecond() == 999999999 {
		span += time.Nanosecond
	}
	previousEnd := start.Add(-time.Microsecond)
	previousStart := start.Add(-span)
	return previousStart, previousEnd
}

// validateAnalyticsRange 限制分析查询时间跨度，防止恶意大跨度触发百万级趋势点内存溢出。
func validateAnalyticsRange(period string, start time.Time, end time.Time) error {
	if start.After(end) {
		return fmt.Errorf("start_date must not be after end_date")
	}
	span := end.Sub(start)
	switch strings.ToLower(strings.TrimSpace(period)) {
	case "day":
		if span > 367*24*time.Hour {
			return fmt.Errorf("date range for day period must not exceed 366 days")
		}
	case "month":
		if span > 120*31*24*time.Hour {
			return fmt.Errorf("date range for month period must not exceed 10 years")
		}
	default:
		if span > 261*7*24*time.Hour {
			return fmt.Errorf("date range for week period must not exceed 260 weeks")
		}
	}
	return nil
}

func roundFloat(value float64, precision int) float64 {
	if precision <= 0 {
		return math.Round(value)
	}
	pow := math.Pow(10, float64(precision))
	return math.Round(value*pow) / pow
}

func resolveTrendRange(period string, start *time.Time, end *time.Time, loc *time.Location) (time.Time, time.Time) {
	now := time.Now().In(loc)
	// 设置结束时间为今天的23:59:59，确保包含今天的数据
	endOfToday := time.Date(now.Year(), now.Month(), now.Day(), 23, 59, 59, 999999999, loc)
	if end == nil {
		end = &endOfToday
	} else {
		// 前端传入的 end_date 解析为 00:00:00，需要调整到当天的 23:59:59
		// 否则 WHERE ... <= 2026-02-11T00:00:00 会漏掉当天的所有数据
		adjusted := time.Date(end.Year(), end.Month(), end.Day(), 23, 59, 59, 999999999, end.Location())
		end = &adjusted
	}
	if start == nil {
		switch period {
		case "day":
			// 按天显示：查询最近7天的数据
			value := time.Date(now.Year(), now.Month(), now.Day()-6, 0, 0, 0, 0, loc)
			start = &value
		case "month":
			// 按月显示：查询最近12个自然月的数据（含当月共12个月）
			value := time.Date(now.Year(), now.Month()-11, 1, 0, 0, 0, 0, loc)
			start = &value
		default:
			// 按周显示：查询最近4周的数据
			value := time.Date(now.Year(), now.Month(), now.Day()-27, 0, 0, 0, 0, loc)
			start = &value
		}
	}
	return *start, *end
}

// trendDataPoint 用于生成趋势时间序列
type trendDataPoint struct {
	Date       time.Time
	Executions int
	Success    int
	Failed     int
	AvgScore   float64
}

// generateEmptyTrendTimeSeries 生成空的时间序列（所有值为0）
func generateEmptyTrendTimeSeries(start, end time.Time, period string, loc *time.Location) []map[string]interface{} {
	result := make([]map[string]interface{}, 0)

	// 根据周期确定时间步长和截断函数
	var step func(t time.Time) time.Time
	var truncate func(t time.Time) time.Time

	switch period {
	case "day":
		step = func(t time.Time) time.Time { return t.AddDate(0, 0, 1) }
		truncate = func(t time.Time) time.Time {
			return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
		}
	case "month":
		step = func(t time.Time) time.Time { return t.AddDate(0, 1, 0) }
		truncate = func(t time.Time) time.Time {
			return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, loc)
		}
	default: // week
		step = func(t time.Time) time.Time { return t.AddDate(0, 0, 7) }
		truncate = func(t time.Time) time.Time {
			// PostgreSQL date_trunc('week', ...) 返回的是 ISO 周的周一
			// Go 的 Weekday(): Sunday=0, Monday=1, ..., Saturday=6
			weekday := int(t.Weekday())
			if weekday == 0 {
				weekday = 7 // 周日当作7
			}
			// 回退到周一
			return time.Date(t.Year(), t.Month(), t.Day()-(weekday-1), 0, 0, 0, 0, loc)
		}
	}

	// 从起始时间开始，按步长生成时间点
	current := truncate(start)
	endTruncated := truncate(end)

	for !current.After(endTruncated) {
		point := map[string]interface{}{
			"date":       current.Format(time.RFC3339),
			"executions": 0,
			"success":    0,
			"failed":     0,
			"avgScore":   0.0,
		}
		result = append(result, point)
		current = step(current)
	}

	return result
}

// generateTrendTimeSeries 生成完整的时间序列，填充缺失的数据点为0
func generateTrendTimeSeries(start, end time.Time, period string, dataMap map[string]trendDataPoint, loc *time.Location) []map[string]interface{} {
	result := make([]map[string]interface{}, 0)

	// 根据周期确定时间步长
	var step func(t time.Time) time.Time
	var truncate func(t time.Time) time.Time

	switch period {
	case "day":
		step = func(t time.Time) time.Time { return t.AddDate(0, 0, 1) }
		truncate = func(t time.Time) time.Time {
			return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
		}
	case "month":
		step = func(t time.Time) time.Time { return t.AddDate(0, 1, 0) }
		truncate = func(t time.Time) time.Time {
			return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, loc)
		}
	default: // week
		step = func(t time.Time) time.Time { return t.AddDate(0, 0, 7) }
		truncate = func(t time.Time) time.Time {
			// 找到本周的周一
			weekday := int(t.Weekday())
			if weekday == 0 {
				weekday = 7
			}
			return time.Date(t.Year(), t.Month(), t.Day()-(weekday-1), 0, 0, 0, 0, loc)
		}
	}

	// 从起始时间开始，按步长生成时间点
	current := truncate(start)
	endTruncated := truncate(end)

	for !current.After(endTruncated) {
		key := current.Format("2006-01-02")
		data, exists := dataMap[key]

		point := map[string]interface{}{
			"date":       current.Format(time.RFC3339),
			"executions": 0,
			"success":    0,
			"failed":     0,
			"avgScore":   0.0,
		}

		if exists {
			point["executions"] = data.Executions
			point["success"] = data.Success
			point["failed"] = data.Failed
			point["avgScore"] = roundFloat(data.AvgScore, 1)
		}

		result = append(result, point)
		current = step(current)
	}

	return result
}

func buildReportsDownloadURL(filename string) string {
	return fmt.Sprintf("/api/v1/reports/files/%s", filename)
}

func resolveReportFilePath(report reports.Report) string {
	paths := decodeJSONMap(report.FilePaths)
	if len(paths) == 0 {
		return ""
	}
	formats := decodeJSONStringSlice(report.FileFormats)
	for _, format := range formats {
		if value, ok := paths[format]; ok {
			return fmt.Sprint(value)
		}
	}
	for _, value := range paths {
		return fmt.Sprint(value)
	}
	return ""
}
