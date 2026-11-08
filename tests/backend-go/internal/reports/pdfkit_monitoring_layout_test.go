package reports_test

import (
	"fmt"
	"math"
	"testing"
	"time"
	_ "unsafe"

	"github.com/phpdave11/gofpdf"

	"github.com/your-org/inspect-system/backend-go/internal/reports/pdfkit"
)

//go:linkname trafficLineSpec github.com/your-org/inspect-system/backend-go/internal/reports/pdfkit.trafficLineSpec
func trafficLineSpec(traffic []pdfkit.NetworkTrafficPoint, sampleInterval string) pdfkit.LineSpec

//go:linkname renderMonitoringCharts github.com/your-org/inspect-system/backend-go/internal/reports/pdfkit.renderMonitoringCharts
func renderMonitoringCharts(pdf *gofpdf.Fpdf, perfLabels []string, devices []pdfkit.DevicePerformanceSeries, traffic []pdfkit.NetworkTrafficPoint, sampleInterval string)

// 流量图的数值单位按量级选择：输入恒为 Mbps，固定按 Mbps 画时 Kbps 级流量的纵轴刻度全是 0.00。
// 标题里的单位必须与换算后的数值一致。
func TestTrafficLineSpec_PicksUnitByMagnitudeAndScalesValues(t *testing.T) {
	cases := []struct {
		name      string
		in, out   []float64 // Mbps
		wantTitle string
		wantIn    []float64
		wantOut   []float64
	}{
		{"Kbps 级", []float64{0.25, 0.1}, []float64{0.05, 0.02}, "流量 (Kbps) · 采样粒度 15 分钟", []float64{250, 100}, []float64{50, 20}},
		{"bps 级", []float64{0.0005, 0}, []float64{0.0002, 0}, "流量 (bps) · 采样粒度 15 分钟", []float64{500, 0}, []float64{200, 0}},
		{"Mbps 级", []float64{12.5}, []float64{3}, "流量 (Mbps) · 采样粒度 15 分钟", []float64{12.5}, []float64{3}},
		{"Gbps 级", []float64{2500}, []float64{1200}, "流量 (Gbps) · 采样粒度 15 分钟", []float64{2.5}, []float64{1.2}},
		{"全为 0 时沿用 Mbps", []float64{0, 0}, []float64{0, 0}, "流量 (Mbps) · 采样粒度 15 分钟", []float64{0, 0}, []float64{0, 0}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			spec := trafficLineSpec(trafficPoints(tc.in, tc.out), "15 分钟")
			if spec.Title != tc.wantTitle {
				t.Fatalf("Title = %q，want %q", spec.Title, tc.wantTitle)
			}
			if len(spec.Series) != 2 {
				t.Fatalf("Series = %d 条，want 2（下行、上行）", len(spec.Series))
			}
			assertValues(t, "下行", spec.Series[0].Values, tc.wantIn)
			assertValues(t, "上行", spec.Series[1].Values, tc.wantOut)
		})
	}
}

// 图表以绝对坐标嵌入，不会触发 gofpdf 的自动分页：剩余高度不够时图片会越过底边距压住页脚。
// 页面中部开始渲染性能与流量两张图时，第二张必须整体换到下一页，渲染结束后的位置仍在可打印区内。
func TestRenderMonitoringCharts_BreaksPageInsteadOfOverflowingFooter(t *testing.T) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(18, 18, 18)
	pdf.SetAutoPageBreak(true, 15)
	if err := pdfkit.RegisterFonts(pdf); err != nil {
		t.Skipf("RegisterFonts() error = %v（缺少中文字体时无法渲染标题）", err)
	}
	pdf.AddPage()
	pdf.SetY(120) // 相当于首页 Hero 与统计卡之后的位置

	labels := make([]string, 24)
	cpu := make([]float64, 24)
	mem := make([]float64, 24)
	in := make([]float64, 24)
	out := make([]float64, 24)
	for i := range labels {
		labels[i] = time.Date(2026, 11, 7, i, 0, 0, 0, time.UTC).Format(time.RFC3339)
		cpu[i], mem[i], in[i], out[i] = 20, 60, 5, 2
	}
	devices := []pdfkit.DevicePerformanceSeries{{Name: "CORE-SW", CPU: cpu, Memory: mem}}
	renderMonitoringCharts(pdf, labels, devices, trafficPointsAt(labels, in, out), "1 小时")

	_, pageH := pdf.GetPageSize()
	_, bottom := pdf.GetAutoPageBreak()
	if y := pdf.GetY(); y > pageH-bottom {
		t.Fatalf("渲染结束位置 y=%.1fmm 越过可打印区底线 %.1fmm：流量图压进了页脚区域", y, pageH-bottom)
	}
	if pdf.PageNo() != 2 {
		t.Fatalf("PageNo = %d，want 2（流量图放不下时应整节换页）", pdf.PageNo())
	}
}

func trafficPoints(in, out []float64) []pdfkit.NetworkTrafficPoint {
	labels := make([]string, len(in))
	for i := range labels {
		labels[i] = fmt.Sprintf("2026-11-07T%02d:00:00Z", i)
	}
	return trafficPointsAt(labels, in, out)
}

func trafficPointsAt(labels []string, in, out []float64) []pdfkit.NetworkTrafficPoint {
	points := make([]pdfkit.NetworkTrafficPoint, len(labels))
	for i := range labels {
		points[i] = pdfkit.NetworkTrafficPoint{Timestamp: labels[i], Inbound: in[i], Outbound: out[i]}
	}
	return points
}

func assertValues(t *testing.T, name string, got, want []float64) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s 数值个数 = %d，want %d", name, len(got), len(want))
	}
	for i := range want {
		if math.Abs(got[i]-want[i]) > 1e-9 {
			t.Fatalf("%s[%d] = %v，want %v", name, i, got[i], want[i])
		}
	}
}
