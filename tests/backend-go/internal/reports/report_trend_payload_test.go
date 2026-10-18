package reports_test

import (
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

//go:linkname parseTrendReportPayload github.com/your-org/inspect-system/backend-go/internal/reports.parseTrendReportPayload
func parseTrendReportPayload(payload map[string]interface{}) reports.TrendReportData

// 完整形状：与生成侧 report_data 的真实结构一致（JSON 反序列化后数字为 float64）。
func TestParseTrendReportPayload_FullShape(t *testing.T) {
	payload := map[string]interface{}{
		"report_name":  "趋势分析报告 - 2026-10-18",
		"range":        "2026-10-11 ~ 2026-10-18",
		"generated_at": "2026-10-18 19:00:00",
		"generated_by": "admin",
		"notes":        "该趋势报表为摘要版（不包含全部数据点），用于快速回溯趋势变化与预测结果。",
		"summary":      map[string]interface{}{"metrics": float64(1), "devices": float64(3)},
		"metrics": []interface{}{
			map[string]interface{}{
				"display_name": "容量使用", "metric_name": "capacity", "unit": "%",
				"current": 72.08, "previous": 72.05, "change": 0.04,
				"change_percentage": 0.05, "trend_direction": "up",
			},
		},
		"predictions": []interface{}{
			map[string]interface{}{
				"metric": "capacity", "current_value": 72.08, "predicted_value": 72.13,
				"confidence": 0.9, "timeframe": "week", "recommendation": "容量使用稳定",
			},
		},
		"alerts": []interface{}{
			map[string]interface{}{
				"severity": "warning", "title": "内存波动异常",
				"description": "检测到内存使用在 2026-10-15T03:00:00Z 出现异常值",
				"detected_at": "2026-10-15T03:00:00Z",
			},
		},
		"alerts_meta": map[string]interface{}{
			"evaluated": true, "min_points_required": float64(6), "actual_points": float64(24),
		},
	}

	got := parseTrendReportPayload(payload)

	if got.ReportName != "趋势分析报告 - 2026-10-18" || got.Range != "2026-10-11 ~ 2026-10-18" {
		t.Fatalf("header fields = %+v", got)
	}
	if got.GeneratedBy != "admin" || got.Notes == "" {
		t.Fatalf("generated_by/notes = %q/%q", got.GeneratedBy, got.Notes)
	}
	if got.MetricCount != 1 || got.DeviceCount != 3 {
		t.Fatalf("summary counts = %d/%d, want 1/3", got.MetricCount, got.DeviceCount)
	}
	if len(got.Metrics) != 1 {
		t.Fatalf("metrics len = %d", len(got.Metrics))
	}
	m := got.Metrics[0]
	if m.DisplayName != "容量使用" || m.Unit != "%" {
		t.Errorf("metric display/unit = %q/%q", m.DisplayName, m.Unit)
	}
	if m.Current != 72.08 || m.Previous != 72.05 || m.Change != 0.04 || m.ChangePercentage != 0.05 {
		t.Errorf("metric values = %+v", m)
	}
	if m.Direction != "up" {
		t.Errorf("direction = %q", m.Direction)
	}
	if len(got.Predictions) != 1 || got.Predictions[0].PredictedValue != 72.13 || got.Predictions[0].Confidence != 0.9 {
		t.Errorf("predictions = %+v", got.Predictions)
	}
	if got.Predictions[0].Timeframe != "week" || got.Predictions[0].Recommendation != "容量使用稳定" {
		t.Errorf("prediction timeframe/recommendation = %+v", got.Predictions[0])
	}
	if len(got.Alerts) != 1 || got.Alerts[0].Severity != "warning" || got.Alerts[0].Title != "内存波动异常" {
		t.Errorf("alerts = %+v", got.Alerts)
	}
	if !got.AlertsMeta.Evaluated || got.AlertsMeta.MinPointsRequired != 6 || got.AlertsMeta.ActualPoints != 24 {
		t.Errorf("alerts_meta = %+v", got.AlertsMeta)
	}
}

// 缺字段 / 空 payload：不得 panic，返回可渲染的零值结构。
func TestParseTrendReportPayload_MissingFields(t *testing.T) {
	got := parseTrendReportPayload(map[string]interface{}{})
	if len(got.Metrics) != 0 || len(got.Predictions) != 0 || len(got.Alerts) != 0 {
		t.Fatalf("empty payload should yield empty slices: %+v", got)
	}
	if got.MetricCount != 0 || got.DeviceCount != 0 {
		t.Fatalf("counts = %d/%d", got.MetricCount, got.DeviceCount)
	}
	// AlertsMeta 零值：未评估（渲染侧据此说明"数据点不足未检测"）
	if got.AlertsMeta.Evaluated {
		t.Errorf("AlertsMeta.Evaluated should default false")
	}
}

// 类型异常：字符串数字应容错转换；错误类型的数组元素应跳过；display_name 缺失回退 metric_name。
func TestParseTrendReportPayload_TypeTolerance(t *testing.T) {
	payload := map[string]interface{}{
		"metrics": []interface{}{
			map[string]interface{}{
				"metric_name": "cpu", "current": "61.5", "previous": 60, "unit": "",
				// display_name 缺失 → 回退 metric_name
			},
			"not-a-map", // 应跳过
		},
		"predictions": "not-a-slice",
		"alerts_meta": map[string]interface{}{"evaluated": "true", "actual_points": "9"},
	}
	got := parseTrendReportPayload(payload)
	if len(got.Metrics) != 1 {
		t.Fatalf("metrics len = %d, want 1 (invalid item skipped)", len(got.Metrics))
	}
	if got.Metrics[0].DisplayName != "cpu" {
		t.Errorf("display fallback = %q, want cpu", got.Metrics[0].DisplayName)
	}
	if got.Metrics[0].Current != 61.5 {
		t.Errorf("string number tolerance: current = %v", got.Metrics[0].Current)
	}
	if len(got.Predictions) != 0 {
		t.Errorf("non-slice predictions should be empty, got %d", len(got.Predictions))
	}
	if got.AlertsMeta.ActualPoints != 9 {
		t.Errorf("string int tolerance: actual_points = %d", got.AlertsMeta.ActualPoints)
	}
}
