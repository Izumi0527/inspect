package reports_test

// 趋势报告渲染侧的守卫测试：格式兜底（formatValueForReport）与展示文案
// 本地化（方向/周期/级别/置信度/时间戳），确保 JSON dump 不会回归、
// 英文枚举与机器时间不会重新泄漏到用户可读文本里。

import (
	"strings"
	"testing"
	_ "unsafe"
)

//go:linkname formatValueForReport github.com/your-org/inspect-system/backend-go/internal/reports.formatValueForReport
func formatValueForReport(value interface{}) string

//go:linkname trendValueText github.com/your-org/inspect-system/backend-go/internal/reports.trendValueText
func trendValueText(value float64, unit string) string

//go:linkname trendDeltaText github.com/your-org/inspect-system/backend-go/internal/reports.trendDeltaText
func trendDeltaText(value float64, unit string) string

//go:linkname trendDirectionText github.com/your-org/inspect-system/backend-go/internal/reports.trendDirectionText
func trendDirectionText(direction string) string

//go:linkname trendTimeframeText github.com/your-org/inspect-system/backend-go/internal/reports.trendTimeframeText
func trendTimeframeText(timeframe string) string

//go:linkname trendSeverityText github.com/your-org/inspect-system/backend-go/internal/reports.trendSeverityText
func trendSeverityText(severity string) string

//go:linkname trendConfidenceText github.com/your-org/inspect-system/backend-go/internal/reports.trendConfidenceText
func trendConfidenceText(confidence float64) string

//go:linkname trendDetectedAtText github.com/your-org/inspect-system/backend-go/internal/reports.trendDetectedAtText
func trendDetectedAtText(raw string) string

//go:linkname localizeTrendTimestamps github.com/your-org/inspect-system/backend-go/internal/reports.localizeTrendTimestamps
func localizeTrendTimestamps(text string) string

var testNewline = string(rune(10))

func TestFormatValueForReport_NoRawDump(t *testing.T) {
	cases := []struct {
		name string
		in   interface{}
		want string
	}{
		{"nil 为空串", nil, ""},
		{"字符串切片按行拼接（不当 JSON 数组）", []string{"指标 A", "指标 B"}, "指标 A" + testNewline + "指标 B"},
		{"空切片为空串（不出现裸 []）", []interface{}{}, ""},
		{"空 map 为空串（不出现裸 {}）", map[string]interface{}{}, ""},
	}
	for _, tc := range cases {
		if got := formatValueForReport(tc.in); got != tc.want {
			t.Errorf("%s: got %q, want %q", tc.name, got, tc.want)
		}
	}

	// 非空嵌套结构仍序列化为 JSON（保留既有能力），但必须限长标注。
	nested := formatValueForReport(map[string]interface{}{"key": "value"})
	if !strings.Contains(nested, "\"key\"") {
		t.Errorf("嵌套结构应保留 JSON 序列化: %q", nested)
	}

	long := map[string]interface{}{}
	for i := 0; i < 200; i++ {
		long[strings.Repeat("k", 20)+string(rune('a'+i%26))+string(rune('a'+i/26))] = strings.Repeat("v", 40)
	}
	truncated := formatValueForReport(long)
	if !strings.Contains(truncated, "已截断") {
		t.Errorf("超长结构应截断并标注: len=%d", len(truncated))
	}
	if len([]rune(truncated)) > 1300 {
		t.Errorf("截断后长度失控: %d", len([]rune(truncated)))
	}
}

func TestTrendDisplayText_Localized(t *testing.T) {
	if got := trendValueText(72.08, "%"); got != "72.08%" {
		t.Errorf("trendValueText 带单位: %q", got)
	}
	if got := trendValueText(0, ""); got != "0.00" {
		t.Errorf("trendValueText 无单位: %q", got)
	}
	if got := trendDeltaText(0.04, "%"); got != "+0.04%" {
		t.Errorf("trendDeltaText 正数补加号: %q", got)
	}
	if got := trendDeltaText(-5.3, "%"); got != "-5.30%" {
		t.Errorf("trendDeltaText 负数: %q", got)
	}

	directions := map[string]string{"up": "↑ 上升", "down": "↓ 下降", "stable": "→ 持平", "": "-"}
	for in, want := range directions {
		if got := trendDirectionText(in); got != want {
			t.Errorf("trendDirectionText(%q) = %q, want %q", in, got, want)
		}
	}

	timeframes := map[string]string{
		"day": "未来 1 天", "week": "未来 1 周", "month": "未来 1 个月",
		"quarter": "未来 1 季度", "year": "未来 1 年", "": "-",
	}
	for in, want := range timeframes {
		if got := trendTimeframeText(in); got != want {
			t.Errorf("trendTimeframeText(%q) = %q, want %q", in, got, want)
		}
	}

	severities := map[string]string{"critical": "严重", "warning": "警告", "info": "提示", "": "-"}
	for in, want := range severities {
		if got := trendSeverityText(in); got != want {
			t.Errorf("trendSeverityText(%q) = %q, want %q", in, got, want)
		}
	}

	if got := trendConfidenceText(0.9); got != "90.0%" {
		t.Errorf("trendConfidenceText(0.9) = %q", got)
	}
}

func TestTrendTimestampText_Localized(t *testing.T) {
	got := trendDetectedAtText("2026-10-15T03:00:00Z")
	if strings.Contains(got, "T") || !strings.Contains(got, "2026-10-15") {
		t.Errorf("RFC3339 应转为本地可读时间: %q", got)
	}
	if got := trendDetectedAtText(""); got != "-" {
		t.Errorf("空时间戳应为占位符: %q", got)
	}
	if got := trendDetectedAtText("不是时间"); got != "不是时间" {
		t.Errorf("不可解析的时间应原样保留: %q", got)
	}

	// 生成侧的告警描述内嵌 RFC3339，渲染时必须替换，否则读者看到机器时间。
	description := "检测到内存使用在 2026-10-15T03:00:00Z 出现异常值"
	localized := localizeTrendTimestamps(description)
	if strings.Contains(localized, "T03:00:00Z") {
		t.Errorf("描述内嵌时间戳未本地化: %q", localized)
	}
	if !strings.Contains(localized, "出现异常值") {
		t.Errorf("本地化不应破坏原文: %q", localized)
	}
	if empty := localizeTrendTimestamps(""); empty != "" {
		t.Errorf("空文本应原样返回: %q", empty)
	}
}
