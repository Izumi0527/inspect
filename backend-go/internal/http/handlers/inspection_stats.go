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

func resolveRequestedAnalyticsRange(c echo.Context) (time.Time, time.Time, bool) {
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

	startDate, _ := parseOptionalDate(startRaw)
	endDate, _ := parseOptionalDate(endRaw)
	start, end := resolveTrendRange(period, startDate, endDate)
	return start, end, true
}

func resolveStatsRange(value string) (time.Time, time.Time) {
	now := time.Now().UTC()
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "7d":
		return now.Add(-7 * 24 * time.Hour), now
	case "30d":
		return now.Add(-30 * 24 * time.Hour), now
	case "24h":
		return now.Add(-24 * time.Hour), now
	default:
		start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
		return start, start.Add(24 * time.Hour)
	}
}

func computeStatsSummary(ctx context.Context, db *gorm.DB, timeColumn string, start time.Time, end time.Time) (statsSummary, error) {
	if db == nil {
		return statsSummary{}, fmt.Errorf("database not initialized")
	}
	column := strings.TrimSpace(timeColumn)
	if column == "" {
		column = "started_at"
	}
	rangeCondition := fmt.Sprintf("%s >= ? AND %s <= ?", column, column)

	var total int64
	if err := db.WithContext(ctx).
		Table("inspections").
		Where(rangeCondition, start, end).
		Count(&total).Error; err != nil {
		return statsSummary{}, err
	}

	var success int64
	if err := db.WithContext(ctx).
		Table("inspections").
		Where(rangeCondition+" AND status = ? AND failed_checks = 0 AND warning_checks = 0", start, end, inspection.StatusCompleted).
		Count(&success).Error; err != nil {
		return statsSummary{}, err
	}

	type avgRow struct {
		AvgScore float64 `gorm:"column:avg_score"`
	}
	avg := avgRow{}
	if err := db.WithContext(ctx).
		Table("inspections").
		Select("AVG(CASE WHEN total_checks > 0 THEN passed_checks::float / total_checks * 100 ELSE NULL END) AS avg_score").
		Where(rangeCondition+" AND status = ?", start, end, inspection.StatusCompleted).
		Scan(&avg).Error; err != nil {
		return statsSummary{}, err
	}

	successRate := 0.0
	if total > 0 {
		successRate = float64(success) / float64(total) * 100
	}

	return statsSummary{
		TotalExecutions: int(total),
		SuccessRate:     roundFloat(successRate, 1),
		AvgScore:        roundFloat(avg.AvgScore, 1),
	}, nil
}

func pctChange(current int, previous int) string {
	if previous == 0 {
		return "0.0%"
	}
	diff := (float64(current-previous) / float64(previous)) * 100
	return fmt.Sprintf("%+.1f%%", diff)
}

func deltaChange(current float64, previous float64) string {
	return fmt.Sprintf("%+.1f%%", current-previous)
}

func roundFloat(value float64, precision int) float64 {
	if precision <= 0 {
		return math.Round(value)
	}
	pow := math.Pow(10, float64(precision))
	return math.Round(value*pow) / pow
}

func resolveTrendRange(period string, start *time.Time, end *time.Time) (time.Time, time.Time) {
	now := time.Now().UTC()
	// 设置结束时间为今天的23:59:59，确保包含今天的数据
	endOfToday := time.Date(now.Year(), now.Month(), now.Day(), 23, 59, 59, 999999999, time.UTC)
	if end == nil {
		end = &endOfToday
	} else {
		// 前端传入的 end_date 解析为 00:00:00，需要调整到当天的 23:59:59
		// 否则 WHERE ... <= 2026-02-11T00:00:00Z 会漏掉当天的所有数据
		adjusted := time.Date(end.Year(), end.Month(), end.Day(), 23, 59, 59, 999999999, end.Location())
		end = &adjusted
	}
	if start == nil {
		switch period {
		case "day":
			// 按天显示：查询最近7天的数据
			value := time.Date(now.Year(), now.Month(), now.Day()-6, 0, 0, 0, 0, time.UTC)
			start = &value
		case "month":
			// 按月显示：查询最近12个月的数据
			value := time.Date(now.Year()-1, now.Month(), 1, 0, 0, 0, 0, time.UTC)
			start = &value
		default:
			// 按周显示：查询最近4周的数据
			value := time.Date(now.Year(), now.Month(), now.Day()-27, 0, 0, 0, 0, time.UTC)
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
func generateEmptyTrendTimeSeries(start, end time.Time, period string) []map[string]interface{} {
	result := make([]map[string]interface{}, 0)

	// 根据周期确定时间步长和截断函数
	var step func(t time.Time) time.Time
	var truncate func(t time.Time) time.Time

	switch period {
	case "day":
		step = func(t time.Time) time.Time { return t.AddDate(0, 0, 1) }
		truncate = func(t time.Time) time.Time {
			return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
		}
	case "month":
		step = func(t time.Time) time.Time { return t.AddDate(0, 1, 0) }
		truncate = func(t time.Time) time.Time {
			return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
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
			return time.Date(t.Year(), t.Month(), t.Day()-(weekday-1), 0, 0, 0, 0, time.UTC)
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
func generateTrendTimeSeries(start, end time.Time, period string, dataMap map[string]trendDataPoint) []map[string]interface{} {
	result := make([]map[string]interface{}, 0)

	// 根据周期确定时间步长
	var step func(t time.Time) time.Time
	var truncate func(t time.Time) time.Time

	switch period {
	case "day":
		step = func(t time.Time) time.Time { return t.AddDate(0, 0, 1) }
		truncate = func(t time.Time) time.Time {
			return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
		}
	case "month":
		step = func(t time.Time) time.Time { return t.AddDate(0, 1, 0) }
		truncate = func(t time.Time) time.Time {
			return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
		}
	default: // week
		step = func(t time.Time) time.Time { return t.AddDate(0, 0, 7) }
		truncate = func(t time.Time) time.Time {
			// 找到本周的周一
			weekday := int(t.Weekday())
			if weekday == 0 {
				weekday = 7
			}
			return time.Date(t.Year(), t.Month(), t.Day()-(weekday-1), 0, 0, 0, 0, time.UTC)
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
