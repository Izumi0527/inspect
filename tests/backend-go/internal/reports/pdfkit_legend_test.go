package reports_test

import (
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/reports/pdfkit"
)

//go:linkname wrapLegendRows github.com/your-org/inspect-system/backend-go/internal/reports/pdfkit.wrapLegendRows
func wrapLegendRows(itemWidths []int, maxWidth int, itemGap int) [][]int

//go:linkname lineChartTickStep github.com/your-org/inspect-system/backend-go/internal/reports/pdfkit.lineChartTickStep
func lineChartTickStep(pointCount int) int

// X 轴最多约 8 个刻度：步长必须向上取整，否则 9-15 个点时步长为 1、标签全画会互相重叠。
func TestLineChartTickStep_CeilsToAtMostEightLabels(t *testing.T) {
	cases := map[int]int{0: 1, 1: 1, 8: 1, 9: 2, 12: 2, 16: 2, 17: 3, 288: 36}
	for points, want := range cases {
		if got := lineChartTickStep(points); got != want {
			t.Fatalf("lineChartTickStep(%d) = %d, want %d", points, got, want)
		}
	}
}

// 图例项按宽度贪心换行：一行放不下就另起一行；单项超宽也必须独占一行而不是被丢弃。
func TestWrapLegendRows_GreedyWrapKeepsOrderAndNeverDrops(t *testing.T) {
	rows := wrapLegendRows([]int{100, 100, 100, 100, 100}, 320, 10)
	want := [][]int{{0, 1, 2}, {3, 4}}
	if len(rows) != len(want) {
		t.Fatalf("rows = %v, want %v", rows, want)
	}
	for i := range want {
		if len(rows[i]) != len(want[i]) {
			t.Fatalf("rows[%d] = %v, want %v", i, rows[i], want[i])
		}
		for j := range want[i] {
			if rows[i][j] != want[i][j] {
				t.Fatalf("rows[%d] = %v, want %v", i, rows[i], want[i])
			}
		}
	}

	oversized := wrapLegendRows([]int{500, 50}, 320, 10)
	if len(oversized) != 2 || len(oversized[0]) != 1 || oversized[0][0] != 0 || oversized[1][0] != 1 {
		t.Fatalf("超宽项应独占一行且不被丢弃：rows = %v", oversized)
	}

	if rows := wrapLegendRows(nil, 320, 10); len(rows) != 0 {
		t.Fatalf("空输入应返回零行，got %v", rows)
	}
}

// 10 条长中文名系列（5 台设备 × CPU/内存）必须仍能渲染成 PNG，这是监控 PDF 的上限场景。
func TestRenderLineChart_TenLongNamedSeries_RendersPNG(t *testing.T) {
	series := make([]pdfkit.LineSeries, 0, 10)
	for i := 0; i < 5; i++ {
		name := "核心交换机 (10.0.0." + string(rune('1'+i)) + ")"
		series = append(series,
			pdfkit.LineSeries{Name: name + " CPU", Color: pdfkit.ColorPrimary, Values: []float64{10, 20, 30}},
			pdfkit.LineSeries{Name: name + " 内存", Color: pdfkit.ColorPrimary, Values: []float64{40, 42, 41}, DashArray: []float64{6, 4}},
		)
	}
	png, err := pdfkit.RenderLineChart(pdfkit.LineSpec{
		Title:   "CPU（实线）/ 内存（虚线），单位 %",
		XLabels: []string{"t1", "t2", "t3"},
		Series:  series,
		NoFill:  true,
	})
	if err != nil {
		t.Fatalf("RenderLineChart() error = %v", err)
	}
	if !isPNG(png) {
		t.Fatalf("RenderLineChart() did not produce PNG bytes")
	}
}
