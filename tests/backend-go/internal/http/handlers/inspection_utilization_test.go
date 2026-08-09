package handlers_test

import (
	"encoding/json"
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

// 两个检查函数都是 InspectionHandler 的未导出值方法，经 go:linkname 桥接做白盒测试
//（沿用本仓库约定），接收者作为第一个参数传入。
//
//go:linkname checkInterfaceUtilizationMetric github.com/your-org/inspect-system/backend-go/internal/http/handlers.InspectionHandler.checkInterfaceUtilizationMetric
func checkInterfaceUtilizationMetric(h handlers.InspectionHandler, result *inspection.Result, metrics *devices.SNMPMetrics, warningThreshold, criticalThreshold float64)

//go:linkname checkBandwidthMetric github.com/your-org/inspect-system/backend-go/internal/http/handlers.InspectionHandler.checkBandwidthMetric
func checkBandwidthMetric(h handlers.InspectionHandler, result *inspection.Result, metrics *devices.SNMPMetrics)

func ifaceSpeed(mbps int64) *int64 { return &mbps }
func ifaceUp(up bool) *bool        { return &up }

// rateMbps 把 Mbps 换算成 bps，便于用直观的速率写测试用例
func rateMbps(mbps float64) *float64 {
	bps := mbps * 1_000_000
	return &bps
}

// utilizationDetails 是 result.Details 的解析结果。
// 这里刻意断言"落库的 JSON 契约"而非包内结构体：details 正是前端执行详情表
// 与 PDF 明细表消费的载荷，测它比测未导出结构体更贴近真实契约，
// 也免去为 linkname 镜像声明未导出类型（字段布局一旦漂移就会静默错位）。
type utilizationDetails struct {
	Kind              string  `json:"kind"`
	Total             int     `json:"total"`
	Evaluated         int     `json:"evaluated"`
	OverWarning       int     `json:"over_warning"`
	OverCritical      int     `json:"over_critical"`
	WarningThreshold  float64 `json:"warning_threshold"`
	CriticalThreshold float64 `json:"critical_threshold"`
	Interfaces        []struct {
		Name       string   `json:"name"`
		Direction  string   `json:"direction"`
		Percent    float64  `json:"percent"`
		SpeedMbps  int64    `json:"speed_mbps"`
		InRateBps  *float64 `json:"in_rate_bps"`
		OutRateBps *float64 `json:"out_rate_bps"`
	} `json:"interfaces"`
	Skipped []struct {
		Name   string `json:"name"`
		Reason string `json:"reason"`
	} `json:"skipped"`
}

func decodeUtilizationDetails(t *testing.T, result inspection.Result) utilizationDetails {
	t.Helper()
	if len(result.Details) == 0 {
		t.Fatal("details 为空：接口利用率检查项必须写入结构化明细")
	}
	var decoded utilizationDetails
	if err := json.Unmarshal(result.Details, &decoded); err != nil {
		t.Fatalf("details 不是合法 JSON: %v", err)
	}
	if decoded.Kind != "interface_utilization" {
		t.Fatalf("details.kind = %q, 期望 interface_utilization", decoded.Kind)
	}
	return decoded
}

// 明细必须覆盖"所有"接口：可评估的给利用率，不可评估的给原因。
// 只列可评估的会让人误以为采集坏了（真机 29 个接口常只有 2 个可评估）。
func TestInterfaceUtilizationDetailsCoverAllInterfaces(t *testing.T) {
	tests := []struct {
		name             string
		interfaces       []devices.InterfaceMetrics
		wantTotal        int
		wantEvaluated    int
		wantOverWarning  int
		wantOverCritical int
		wantOrder        []string
		wantSkipReasons  map[string]string
	}{
		{
			name: "无速率基线的接口进入 skipped 并附原因",
			interfaces: []devices.InterfaceMetrics{
				{Name: "if1", Description: "GE0/0/1", Speed: ifaceSpeed(1000)},
				{Name: "if2", Description: "GE0/0/2", Speed: ifaceSpeed(1000)},
			},
			wantTotal:     2,
			wantEvaluated: 0,
			wantSkipReasons: map[string]string{
				"GE0/0/1": "无速率样本（尚未形成差分基线）",
				"GE0/0/2": "无速率样本（尚未形成差分基线）",
			},
		},
		{
			name: "无容量的接口（Loopback/NULL）附容量缺失原因",
			interfaces: []devices.InterfaceMetrics{
				{Description: "InLoopBack0", InRate: rateMbps(1)},
				{Description: "NULL0", Speed: ifaceSpeed(0), InRate: rateMbps(1)},
			},
			wantTotal:     2,
			wantEvaluated: 0,
			wantSkipReasons: map[string]string{
				"InLoopBack0": "无接口容量（未上报速率）",
				"NULL0":       "无接口容量（未上报速率）",
			},
		},
		{
			name: "DOWN 接口被排除，IsUp 未知的接口仍参与评估",
			interfaces: []devices.InterfaceMetrics{
				{Description: "GE0/0/1", Speed: ifaceSpeed(1000), IsUp: ifaceUp(false), InRate: rateMbps(950)},
				{Description: "GE0/0/2", Speed: ifaceSpeed(1000), IsUp: ifaceUp(true), InRate: rateMbps(300)},
				{Description: "GE0/0/3", Speed: ifaceSpeed(1000), InRate: rateMbps(100)},
			},
			wantTotal:       3,
			wantEvaluated:   2,
			wantOrder:       []string{"GE0/0/2", "GE0/0/3"},
			wantSkipReasons: map[string]string{"GE0/0/1": "接口未 UP"},
		},
		{
			name: "阈值边界：恰好 70 计警告、恰好 90 同时计警告与故障",
			interfaces: []devices.InterfaceMetrics{
				{Description: "GE0/0/1", Speed: ifaceSpeed(1000), InRate: rateMbps(699.9)},
				{Description: "GE0/0/2", Speed: ifaceSpeed(1000), InRate: rateMbps(700)},
				{Description: "GE0/0/3", Speed: ifaceSpeed(1000), InRate: rateMbps(900)},
			},
			wantTotal:        3,
			wantEvaluated:    3,
			wantOverWarning:  2,
			wantOverCritical: 1,
			wantOrder:        []string{"GE0/0/3", "GE0/0/2", "GE0/0/1"},
		},
		{
			name: "全部接口按利用率降序列出，不做条数截断",
			interfaces: []devices.InterfaceMetrics{
				{Description: "GE0/0/1", Speed: ifaceSpeed(1000), OutRate: rateMbps(750)},
				{Description: "GE0/0/2", Speed: ifaceSpeed(1000), OutRate: rateMbps(950)},
				{Description: "GE0/0/3", Speed: ifaceSpeed(1000), OutRate: rateMbps(800)},
				{Description: "GE0/0/4", Speed: ifaceSpeed(1000), OutRate: rateMbps(880)},
				{Description: "GE0/0/5", Speed: ifaceSpeed(1000), OutRate: rateMbps(100)},
			},
			wantTotal:        5,
			wantEvaluated:    5,
			wantOverWarning:  4,
			wantOverCritical: 1,
			wantOrder:        []string{"GE0/0/2", "GE0/0/4", "GE0/0/3", "GE0/0/1", "GE0/0/5"},
		},
	}

	h := handlers.InspectionHandler{}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := inspection.Result{}
			checkInterfaceUtilizationMetric(h, &result, &devices.SNMPMetrics{Interfaces: tt.interfaces}, 0, 0)
			detail := decodeUtilizationDetails(t, result)

			if detail.Total != tt.wantTotal {
				t.Errorf("total = %d, 期望 %d", detail.Total, tt.wantTotal)
			}
			if detail.Evaluated != tt.wantEvaluated {
				t.Errorf("evaluated = %d, 期望 %d", detail.Evaluated, tt.wantEvaluated)
			}
			if detail.OverWarning != tt.wantOverWarning {
				t.Errorf("over_warning = %d, 期望 %d", detail.OverWarning, tt.wantOverWarning)
			}
			if detail.OverCritical != tt.wantOverCritical {
				t.Errorf("over_critical = %d, 期望 %d", detail.OverCritical, tt.wantOverCritical)
			}

			// 每个接口都必须有归属：要么在 interfaces，要么在 skipped
			if got := len(detail.Interfaces) + len(detail.Skipped); got != tt.wantTotal {
				t.Errorf("interfaces + skipped = %d, 期望覆盖全部 %d 个接口", got, tt.wantTotal)
			}

			if tt.wantOrder != nil {
				if len(detail.Interfaces) != len(tt.wantOrder) {
					t.Fatalf("interfaces 数量 = %d, 期望 %d", len(detail.Interfaces), len(tt.wantOrder))
				}
				for i, want := range tt.wantOrder {
					if detail.Interfaces[i].Name != want {
						t.Errorf("interfaces[%d].name = %q, 期望 %q", i, detail.Interfaces[i].Name, want)
					}
				}
			}

			for name, reason := range tt.wantSkipReasons {
				found := false
				for _, item := range detail.Skipped {
					if item.Name == name {
						found = true
						if item.Reason != reason {
							t.Errorf("skipped[%s].reason = %q, 期望 %q", name, item.Reason, reason)
						}
					}
				}
				if !found {
					t.Errorf("skipped 中缺少接口 %q", name)
				}
			}
		})
	}
}

// 峰值方向取入/出中更高的一侧，接口名优先取 Description
//（采集端把 Name 固定写成 "if<索引>"，用 Name 会输出无从定位的编号）。
func TestInterfaceUtilizationPeakDirectionAndNaming(t *testing.T) {
	h := handlers.InspectionHandler{}

	t.Run("出向更高时方向记为出", func(t *testing.T) {
		result := inspection.Result{}
		checkInterfaceUtilizationMetric(h, &result, &devices.SNMPMetrics{Interfaces: []devices.InterfaceMetrics{
			{Description: "GE0/0/1", Speed: ifaceSpeed(1000), InRate: rateMbps(200), OutRate: rateMbps(650)},
		}}, 0, 0)

		detail := decodeUtilizationDetails(t, result)
		if len(detail.Interfaces) != 1 {
			t.Fatalf("interfaces 数量 = %d, 期望 1", len(detail.Interfaces))
		}
		entry := detail.Interfaces[0]
		if entry.Direction != "出" {
			t.Errorf("direction = %q, 期望 出", entry.Direction)
		}
		if diff := entry.Percent - 65; diff > 0.01 || diff < -0.01 {
			t.Errorf("percent = %.2f, 期望 65", entry.Percent)
		}
	})

	t.Run("无 Description 时回退索引名", func(t *testing.T) {
		result := inspection.Result{}
		checkInterfaceUtilizationMetric(h, &result, &devices.SNMPMetrics{Interfaces: []devices.InterfaceMetrics{
			{Name: "if7", Speed: ifaceSpeed(100), InRate: rateMbps(50)},
		}}, 0, 0)

		detail := decodeUtilizationDetails(t, result)
		if len(detail.Interfaces) != 1 || detail.Interfaces[0].Name != "if7" {
			t.Fatalf("接口名回退失败: %+v", detail.Interfaces)
		}
	})
}

// 判定结果必须始终带参考标准（ExpectedValue），包括 skip 路径——
// 前端执行详情与 PDF 报告都据此展示判定依据。
func TestCheckInterfaceUtilizationMetricStatus(t *testing.T) {
	h := handlers.InspectionHandler{}

	tests := []struct {
		name       string
		metrics    *devices.SNMPMetrics
		wantStatus string
		wantActual bool
	}{
		{
			name:       "无采集数据判跳过",
			metrics:    nil,
			wantStatus: "skip",
		},
		{
			name:       "接口列表为空判跳过",
			metrics:    &devices.SNMPMetrics{},
			wantStatus: "skip",
		},
		{
			name: "有接口但无速率基线判跳过，不假报通过",
			metrics: &devices.SNMPMetrics{Interfaces: []devices.InterfaceMetrics{
				{Description: "GE0/0/1", Speed: ifaceSpeed(1000)},
			}},
			wantStatus: "skip",
		},
		{
			name: "利用率正常判通过",
			metrics: &devices.SNMPMetrics{Interfaces: []devices.InterfaceMetrics{
				{Description: "GE0/0/1", Speed: ifaceSpeed(1000), InRate: rateMbps(200)},
			}},
			wantStatus: "pass",
			wantActual: true,
		},
		{
			name: "超过警告阈值判警告",
			metrics: &devices.SNMPMetrics{Interfaces: []devices.InterfaceMetrics{
				{Description: "GE0/0/1", Speed: ifaceSpeed(1000), InRate: rateMbps(750)},
			}},
			wantStatus: "warning",
			wantActual: true,
		},
		{
			name: "超过故障阈值判失败",
			metrics: &devices.SNMPMetrics{Interfaces: []devices.InterfaceMetrics{
				{Description: "GE0/0/1", Speed: ifaceSpeed(1000), OutRate: rateMbps(950)},
			}},
			wantStatus: "fail",
			wantActual: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := inspection.Result{}
			checkInterfaceUtilizationMetric(h, &result, tt.metrics, 0, 0)

			if result.Status != tt.wantStatus {
				t.Errorf("Status = %q, 期望 %q", result.Status, tt.wantStatus)
			}
			if result.ExpectedValue == nil || *result.ExpectedValue == "" {
				t.Error("ExpectedValue 必须写入参考标准，即使在 skip 路径")
			}
			if tt.wantActual && (result.ActualValue == nil || *result.ActualValue == "") {
				t.Error("可计算利用率时必须写入 ActualValue")
			}
			if result.Message == nil || *result.Message == "" {
				t.Error("Message 不能为空")
			}
		})
	}
}

// 带宽吞吐量项已不再做利用率判定，但仍须区分"没有基线"与"跑了 0 流量"。
func TestCheckBandwidthMetricSkipsWithoutRateBaseline(t *testing.T) {
	h := handlers.InspectionHandler{}
	zero := 0.0

	t.Run("采集端已写入总速率但接口无速率样本时判跳过", func(t *testing.T) {
		result := inspection.Result{}
		checkBandwidthMetric(h, &result, &devices.SNMPMetrics{
			BandwidthIn:  &zero,
			BandwidthOut: &zero,
			Interfaces:   []devices.InterfaceMetrics{{Description: "GE0/0/1", Speed: ifaceSpeed(1000)}},
		})
		if result.Status != "skip" {
			t.Errorf("Status = %q, 期望 skip", result.Status)
		}
	})

	t.Run("有速率样本时判通过", func(t *testing.T) {
		in, out := 120_000_000.0, 80_000_000.0
		result := inspection.Result{}
		checkBandwidthMetric(h, &result, &devices.SNMPMetrics{
			BandwidthIn:  &in,
			BandwidthOut: &out,
			Interfaces:   []devices.InterfaceMetrics{{Description: "GE0/0/1", Speed: ifaceSpeed(1000), InRate: rateMbps(120)}},
		})
		if result.Status != "pass" {
			t.Errorf("Status = %q, 期望 pass", result.Status)
		}
		if result.ActualValue == nil || *result.ActualValue == "" {
			t.Error("ActualValue 必须包含入/出速率")
		}
	})
}
