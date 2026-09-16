package scheduler_test

import (
	"testing"
	"time"
	_ "unsafe"

	_ "github.com/your-org/inspect-system/backend-go/internal/scheduler"
)

// 设备日志轮询门控（任务 D2）：巡检任务每 3 分钟一轮，但告警日志轮询要 SSH 登录设备、
// 在设备上留下登录日志并被下一轮采回，因此单独按 logs.polling.interval_minutes 限频，
// 距上次轮询不足间隔就跳过；设置值可能以 int / float64 / 字符串等形态从配置表读出。

//go:linkname logPollingIntervalFrom github.com/your-org/inspect-system/backend-go/internal/scheduler.logPollingIntervalFrom
func logPollingIntervalFrom(value interface{}) time.Duration

//go:linkname logPollDue github.com/your-org/inspect-system/backend-go/internal/scheduler.logPollDue
func logPollDue(last time.Time, now time.Time, interval time.Duration) bool

func TestLogPollingIntervalFrom_ShouldAcceptEveryStoredNumberShape(t *testing.T) {
	cases := []struct {
		name  string
		value interface{}
		want  time.Duration
	}{
		{"int", 20, 20 * time.Minute},
		{"int64", int64(30), 30 * time.Minute},
		{"float64（JSON 解码形态）", float64(45), 45 * time.Minute},
		{"string", " 60 ", 60 * time.Minute},
		{"nil 回落默认 15 分钟", nil, 15 * time.Minute},
		{"越界回落默认", 0, 15 * time.Minute},
		{"超上限回落默认", 1441, 15 * time.Minute},
		{"非数字字符串回落默认", "abc", 15 * time.Minute},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := logPollingIntervalFrom(tc.value); got != tc.want {
				t.Fatalf("logPollingIntervalFrom(%v) = %v, want %v", tc.value, got, tc.want)
			}
		})
	}
}

func TestLogPollDue_ShouldSkipUntilIntervalElapsed(t *testing.T) {
	now := time.Date(2026, 9, 16, 10, 0, 0, 0, time.UTC)
	interval := 15 * time.Minute

	if !logPollDue(time.Time{}, now, interval) {
		t.Fatal("从未轮询过时应立即轮询")
	}
	if logPollDue(now.Add(-3*time.Minute), now, interval) {
		t.Fatal("距上次轮询 3 分钟（不足间隔）应跳过")
	}
	if !logPollDue(now.Add(-15*time.Minute), now, interval) {
		t.Fatal("恰好到达间隔应轮询")
	}
	if !logPollDue(now.Add(-40*time.Minute), now, interval) {
		t.Fatal("超过间隔应轮询")
	}
}
