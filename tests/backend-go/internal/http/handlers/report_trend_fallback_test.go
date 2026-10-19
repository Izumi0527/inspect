package handlers_test

// 第 3 条（代理指标来源标注）与第 5 条（检测口径）的生成侧守卫。
// linkname 声明见 report_trend_metrics_test.go（同包共享）。

import "testing"

// 第 5 条：灵敏度归一与阈值映射，供 alerts_meta 携带判定口径。
func TestNormalizeTrendSensitivity(t *testing.T) {
	cases := map[string]string{
		"":       "medium",
		"medium": "medium",
		"HIGH":   "high",
		" low ":  "low",
		"weird":  "medium",
	}
	for in, want := range cases {
		if got := normalizeTrendSensitivity(in); got != want {
			t.Errorf("normalizeTrendSensitivity(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestAnomalyThreshold_MatchesSensitivity(t *testing.T) {
	cases := map[string]float64{
		"high":   2.0,
		"medium": 2.5,
		"low":    3.0,
		"":       2.5, // 默认 medium
		"weird":  2.5,
	}
	for in, want := range cases {
		if got := anomalyThreshold(in); got != want {
			t.Errorf("anomalyThreshold(%q) = %v, want %v", in, got, want)
		}
	}
}

// 第 3 条：capacity 走 fallback 取到内存/CPU 时，展示名要标出来源，
// 不能一律显示「容量使用」造成张冠李戴。
func TestTrendMetricFallbackDisplayName(t *testing.T) {
	cases := []struct {
		display, nominal, source, want string
	}{
		{"容量使用", "disk_usage", "disk_usage", "容量使用"}, // 命中名义指标：原名
		{"容量使用", "disk_usage", "", "容量使用"},           // 未解析出来源：原名
		{"容量使用", "disk_usage", "memory_usage", "容量使用（内存）"},
		{"容量使用", "disk_usage", "cpu_usage", "容量使用（CPU）"},
	}
	for _, c := range cases {
		if got := trendMetricFallbackDisplayName(c.display, c.nominal, c.source); got != c.want {
			t.Errorf("(%q,%q,%q) = %q, want %q", c.display, c.nominal, c.source, got, c.want)
		}
	}
}

func TestTrendMetricSourceLabel(t *testing.T) {
	cases := map[string]string{
		"disk_usage":   "磁盘",
		"memory_usage": "内存",
		"cpu_usage":    "CPU",
	}
	for in, want := range cases {
		if got := trendMetricSourceLabel(in); got != want {
			t.Errorf("trendMetricSourceLabel(%q) = %q, want %q", in, got, want)
		}
	}
}
