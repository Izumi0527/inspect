package reports_test

// 渲染侧守卫：变化率不被压成 0.00%、检测口径文案本地化，以及 alerts_meta
// 新增的灵敏度/阈值能被解析出来（第 2、5 条）。

import (
	"strings"
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

//go:linkname trendChangePercentText github.com/your-org/inspect-system/backend-go/internal/reports.trendChangePercentText
func trendChangePercentText(value float64) string

//go:linkname trendSensitivityText github.com/your-org/inspect-system/backend-go/internal/reports.trendSensitivityText
func trendSensitivityText(sensitivity string) string

//go:linkname trendDetectionCriteriaText github.com/your-org/inspect-system/backend-go/internal/reports.trendDetectionCriteriaText
func trendDetectionCriteriaText(meta reports.TrendAlertsMetaReport) string

func TestTrendChangePercentText(t *testing.T) {
	cases := []struct {
		in   float64
		want string
	}{
		{0.05, "+0.05%"},
		{-11.32, "-11.32%"},
		{0.0012, "+0.0012%"}, // 不压成 +0.00%
		{0, "0.00%"},
	}
	for _, c := range cases {
		if got := trendChangePercentText(c.in); got != c.want {
			t.Errorf("trendChangePercentText(%v) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestTrendSensitivityText(t *testing.T) {
	cases := map[string]string{
		"high":   "高",
		"medium": "中",
		"low":    "低",
		"":       "默认", // 历史报告未携带
		"weird":  "默认",
	}
	for in, want := range cases {
		if got := trendSensitivityText(in); got != want {
			t.Errorf("trendSensitivityText(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestTrendDetectionCriteriaText(t *testing.T) {
	full := trendDetectionCriteriaText(reports.TrendAlertsMetaReport{
		Sensitivity: "medium", Threshold: 2.5, MinPointsRequired: 6,
	})
	for _, want := range []string{"灵敏度 中", "z-score 阈值 2.5", "6 个数据点"} {
		if !strings.Contains(full, want) {
			t.Errorf("检测口径文案缺 %q: %q", want, full)
		}
	}
	// 历史报告没有阈值：只描述灵敏度与点数门槛，不硬凑 z-score。
	legacy := trendDetectionCriteriaText(reports.TrendAlertsMetaReport{MinPointsRequired: 6})
	if strings.Contains(legacy, "z-score") {
		t.Errorf("无阈值时不应出现 z-score: %q", legacy)
	}
}

// alerts_meta 现在随报告携带检测判据口径，解析器要能读出来。
func TestParseTrendReportPayload_AlertsMetaCarriesCriteria(t *testing.T) {
	payload := map[string]interface{}{
		"alerts_meta": map[string]interface{}{
			"evaluated":           true,
			"min_points_required": float64(6),
			"actual_points":       float64(24),
			"sensitivity":         "medium",
			"z_score_threshold":   float64(2.5),
		},
	}
	data := parseTrendReportPayload(payload)
	if !data.AlertsMeta.Evaluated || data.AlertsMeta.MinPointsRequired != 6 || data.AlertsMeta.ActualPoints != 24 {
		t.Fatalf("既有字段解析异常: %+v", data.AlertsMeta)
	}
	if data.AlertsMeta.Sensitivity != "medium" {
		t.Errorf("sensitivity 未解析: %q", data.AlertsMeta.Sensitivity)
	}
	if data.AlertsMeta.Threshold != 2.5 {
		t.Errorf("z_score_threshold 未解析: %v", data.AlertsMeta.Threshold)
	}
}
