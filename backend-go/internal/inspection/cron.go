package inspection

import (
	"fmt"
	"strings"
	"time"

	"github.com/robfig/cron/v3"
)

// NormalizeCronExpression 将前端 Quartz 风格 Cron 规范化为 robfig/cron(v3) 兼容的 5 段 Cron。
//
// 支持输入：
// - 5 段：min hour dom month dow（将 ? 替换为 *）
// - 6 段：sec min hour dom month dow（丢弃秒字段）
// - 7 段：sec min hour dom month dow year（丢弃秒字段与年字段）
func NormalizeCronExpression(expr string) (string, error) {
	expr = strings.TrimSpace(expr)
	if expr == "" {
		return "", fmt.Errorf("cron expression is empty")
	}

	parts := strings.Fields(expr)
	switch len(parts) {
	case 5:
		replaceQuestionMarks(parts)
		return strings.Join(parts, " "), nil
	case 6:
		parts = parts[1:] // drop seconds
		replaceQuestionMarks(parts)
		return strings.Join(parts, " "), nil
	case 7:
		parts = parts[1:6] // drop seconds + year
		replaceQuestionMarks(parts)
		return strings.Join(parts, " "), nil
	default:
		return "", fmt.Errorf("invalid cron expression: expected 5/6/7 fields, got %d", len(parts))
	}
}

func replaceQuestionMarks(parts []string) {
	for i := range parts {
		if strings.TrimSpace(parts[i]) == "?" {
			parts[i] = "*"
		}
	}
}

// ComputeNextRunTime 计算从指定时间开始的下一次触发时间。
// normalizedCron 必须是 5 段 Cron（min hour dom month dow）。
func ComputeNextRunTime(normalizedCron string, from time.Time) (time.Time, error) {
	normalizedCron = strings.TrimSpace(normalizedCron)
	if normalizedCron == "" {
		return time.Time{}, fmt.Errorf("cron expression is empty")
	}
	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
	schedule, err := parser.Parse(normalizedCron)
	if err != nil {
		return time.Time{}, err
	}
	return schedule.Next(from), nil
}
