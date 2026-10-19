package handlers_test

// 趋势生成侧的数据一致性守卫（第 7 节 1/2/4 条）：
//   - summarizeTrend 必须先取整再推导变化与方向，保证报告里
//     「当前 − 上期 = 变化」自洽、且微小变化不会被标成「上升」；
//   - 变化率对微小值保留更多小数，避免显示成 0.00%；
//   - timeframeForRange 用日历日判档，不受时刻/DST 偏差影响；
//   - fallback 代理指标要标注真实来源（容量使用（内存））。

import (
	"testing"
	"time"
	_ "unsafe"

	_ "github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

//go:linkname summarizeTrend github.com/your-org/inspect-system/backend-go/internal/http/handlers.summarizeTrend
func summarizeTrend(values []float64) (current, previous, change, changePct float64, direction string)

//go:linkname roundPercentForDisplay github.com/your-org/inspect-system/backend-go/internal/http/handlers.roundPercentForDisplay
func roundPercentForDisplay(value float64) float64

//go:linkname timeframeForRange github.com/your-org/inspect-system/backend-go/internal/http/handlers.timeframeForRange
func timeframeForRange(start time.Time, end time.Time) string

//go:linkname calendarDaysBetween github.com/your-org/inspect-system/backend-go/internal/http/handlers.calendarDaysBetween
func calendarDaysBetween(start time.Time, end time.Time) int

//go:linkname normalizeTrendSensitivity github.com/your-org/inspect-system/backend-go/internal/http/handlers.normalizeTrendSensitivity
func normalizeTrendSensitivity(sensitivity string) string

//go:linkname anomalyThreshold github.com/your-org/inspect-system/backend-go/internal/http/handlers.anomalyThreshold
func anomalyThreshold(sensitivity string) float64

//go:linkname trendMetricFallbackDisplayName github.com/your-org/inspect-system/backend-go/internal/http/handlers.trendMetricFallbackDisplayName
func trendMetricFallbackDisplayName(displayName, nominalMetric, sourceMetric string) string

//go:linkname trendMetricSourceLabel github.com/your-org/inspect-system/backend-go/internal/http/handlers.trendMetricSourceLabel
func trendMetricSourceLabel(metricName string) string

func approx(a, b float64) bool {
	d := a - b
	return d < 1e-9 && d > -1e-9
}

// 第 1 条：报告里「当前 − 上期 = 变化」必须对得上。
func TestSummarizeTrend_DisplayArithmeticIsConsistent(t *testing.T) {
	// 首末值 72.05 / 72.08：未取整相减得 0.04 的旧 bug 来源。
	current, previous, change, _, direction := summarizeTrend([]float64{72.05, 72.0619, 72.08})
	if !approx(current, 72.08) || !approx(previous, 72.05) {
		t.Fatalf("首末值取整: current=%v previous=%v", current, previous)
	}
	if !approx(change, 0.03) {
		t.Errorf("变化应为取整后相减 0.03，实际 %v", change)
	}
	if !approx(current-previous, change) {
		t.Errorf("报告算术不自洽: 当前-上期=%v 变化=%v", current-previous, change)
	}
	if direction != "up" {
		t.Errorf("方向应为 up，实际 %q", direction)
	}
}

// 变化取整为 0 时必须判「持平」，不能出现「变化 +0.00 却标上升」。
func TestSummarizeTrend_TinyChangeIsStable(t *testing.T) {
	current, previous, change, _, direction := summarizeTrend([]float64{1.0001, 1.0002})
	if !approx(change, 0) || !approx(current, previous) {
		t.Fatalf("微小变化应取整为 0: current=%v previous=%v change=%v", current, previous, change)
	}
	if direction != "stable" {
		t.Errorf("变化取整为 0 应判「持平」，实际 %q", direction)
	}
}

func TestSummarizeTrend_EmptyIsZero(t *testing.T) {
	c, p, ch, pct, dir := summarizeTrend(nil)
	if c != 0 || p != 0 || ch != 0 || pct != 0 || dir != "stable" {
		t.Errorf("空输入应全零且 stable，实际 %v %v %v %v %q", c, p, ch, pct, dir)
	}
}

// 第 2 条：微小变化率多留 2 位，不压成 0.00。
func TestRoundPercentForDisplay(t *testing.T) {
	cases := []struct {
		in   float64
		want float64
	}{
		{0.05, 0.05},
		{0.0416, 0.04},
		{-11.32, -11.32},
		{0.0012, 0.0012}, // 保留 4 位而不是 0
		{0, 0},
	}
	for _, c := range cases {
		if got := roundPercentForDisplay(c.in); !approx(got, c.want) {
			t.Errorf("roundPercentForDisplay(%v) = %v, want %v", c.in, got, c.want)
		}
	}
}

// 第 4 条：7/30/90 天分档按日历日，不被 30 分钟时刻偏差推高一档。
func TestTimeframeForRange_CalendarDayBoundaries(t *testing.T) {
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	cases := []struct {
		name   string
		offset time.Duration
		want   string
	}{
		{"整 7 天", 7 * 24 * time.Hour, "week"},
		{"7 天多 30 分钟", 7*24*time.Hour + 30*time.Minute, "week"},
		{"8 天", 8 * 24 * time.Hour, "month"},
		{"整 30 天", 30 * 24 * time.Hour, "month"},
		{"31 天", 31 * 24 * time.Hour, "quarter"},
		{"整 90 天", 90 * 24 * time.Hour, "quarter"},
	}
	for _, c := range cases {
		if got := timeframeForRange(base, base.Add(c.offset)); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
	if got := timeframeForRange(base, base.Add(-time.Hour)); got != "week" {
		t.Errorf("反向区间应回退 week，实际 %q", got)
	}
}

func TestCalendarDaysBetween(t *testing.T) {
	d := func(y, m, day, h int) time.Time {
		return time.Date(y, time.Month(m), day, h, 0, 0, 0, time.UTC)
	}
	if got := calendarDaysBetween(d(2026, 1, 1, 23), d(2026, 1, 2, 1)); got != 1 {
		t.Errorf("跨日相邻应 1 天，实际 %d", got)
	}
	if got := calendarDaysBetween(d(2026, 1, 1, 0), d(2026, 1, 8, 0)); got != 7 {
		t.Errorf("整周应 7 天，实际 %d", got)
	}
	if got := calendarDaysBetween(d(2026, 1, 8, 0), d(2026, 1, 1, 0)); got != -7 {
		t.Errorf("反向应 -7 天，实际 %d", got)
	}
}
