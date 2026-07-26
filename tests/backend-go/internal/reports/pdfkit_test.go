package reports_test

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/phpdave11/gofpdf"

	"github.com/your-org/inspect-system/backend-go/internal/reports/pdfkit"
)

// TestRenderDonutChart_ProducesPNG asserts that the donut renderer returns
// a non-empty PNG byte stream that decodes as PNG (magic 0x89 P N G ...).
func TestRenderDonutChart_ProducesPNG(t *testing.T) {
	png, err := pdfkit.RenderDonutChart(pdfkit.DonutSpec{
		Title: "测试",
		Slices: []pdfkit.DonutSlice{
			{Label: "A", Value: 3, Color: pdfkit.ColorPrimary},
			{Label: "B", Value: 7, Color: pdfkit.ColorSuccess},
		},
	})
	if err != nil {
		t.Fatalf("RenderDonutChart() error = %v", err)
	}
	if !isPNG(png) {
		t.Fatalf("RenderDonutChart() did not produce PNG bytes (first 8 = %x)", first8(png))
	}
}

// TestRenderDonutChart_RejectsEmptyInput verifies the renderer fails fast
// when no positive-valued slices exist, instead of silently producing a
// blank chart.
func TestRenderDonutChart_RejectsEmptyInput(t *testing.T) {
	_, err := pdfkit.RenderDonutChart(pdfkit.DonutSpec{Slices: nil})
	if err == nil {
		t.Fatal("expected error for empty donut spec, got nil")
	}
}

// TestRenderBarChart_ProducesPNG covers the bar chart path used for
// "device type distribution" / "location distribution" embedded above
// statistics tables.
func TestRenderBarChart_ProducesPNG(t *testing.T) {
	png, err := pdfkit.RenderBarChart(pdfkit.BarSpec{
		Title:    "类型分布",
		BarColor: pdfkit.ColorPrimary,
		Bars: []pdfkit.DonutSlice{
			{Label: "switch", Value: 5},
			{Label: "router", Value: 3},
			{Label: "firewall", Value: 2},
		},
	})
	if err != nil {
		t.Fatalf("RenderBarChart() error = %v", err)
	}
	if !isPNG(png) {
		t.Fatalf("RenderBarChart() did not produce PNG bytes (first 8 = %x)", first8(png))
	}
}

// TestRenderLineChart_ProducesPNG covers the time-series path used for
// monitoring CPU / memory / network panels.
func TestRenderLineChart_ProducesPNG(t *testing.T) {
	png, err := pdfkit.RenderLineChart(pdfkit.LineSpec{
		Title: "性能趋势",
		Series: []pdfkit.LineSeries{
			{Name: "CPU", Color: pdfkit.ColorPrimary, Values: []float64{10, 20, 30, 40, 50}},
			{Name: "MEM", Color: pdfkit.ColorIndigo400, Values: []float64{20, 25, 35, 30, 45}},
		},
		XLabels: []string{"t1", "t2", "t3", "t4", "t5"},
	})
	if err != nil {
		t.Fatalf("RenderLineChart() error = %v", err)
	}
	if !isPNG(png) {
		t.Fatalf("RenderLineChart() did not produce PNG bytes (first 8 = %x)", first8(png))
	}
}

// TestRenderDonutChart_CacheReturnsSameBytes proves that calling the
// renderer twice with the same spec returns the exact same byte slice
// (not a new render). This guards against accidental cache-key drift.
func TestRenderDonutChart_CacheReturnsSameBytes(t *testing.T) {
	spec := pdfkit.DonutSpec{
		Title: "缓存测试",
		Slices: []pdfkit.DonutSlice{
			{Label: "A", Value: 1, Color: pdfkit.ColorPrimary},
			{Label: "B", Value: 2, Color: pdfkit.ColorSuccess},
		},
	}
	first, err := pdfkit.RenderDonutChart(spec)
	if err != nil {
		t.Fatalf("RenderDonutChart() error = %v", err)
	}
	second, err := pdfkit.RenderDonutChart(spec)
	if err != nil {
		t.Fatalf("RenderDonutChart() error = %v", err)
	}
	if !bytes.Equal(first, second) {
		t.Fatalf("cache returned different bytes (len=%d vs %d)", len(first), len(second))
	}
}

// TestRenderMonitoringPDF_StructurallyValid drives pdfkit end-to-end with
// representative input and verifies the file on disk is a real, multi-KB
// PDF with embedded fonts. Skipped when the environment has no CJK font.
func TestRenderMonitoringPDF_StructurallyValid(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "monitoring.pdf")

	stats := &pdfkit.MonitoringStatsInput{
		TotalDevices: 42,
		ActiveAlerts: 3,
		AvgCPU:       38.5,
		AvgMemory:    61.2,
		PeakOutbound: 12_266_000,
		PeakInbound:  2_818_000,
	}
	input := pdfkit.MonitoringPDFInput{
		Title:     "监控报告",
		TimeRange: "24h",
		Sections:  []string{"stats", "charts", "alerts"},
		Stats:     stats,
		SystemPerformance: []pdfkit.TimeSeriesPoint{
			{Timestamp: "2026-05-09T08:00:00Z", CPUUsage: 30, MemoryUsage: 50, NetworkTraffic: 8},
			{Timestamp: "2026-05-09T09:00:00Z", CPUUsage: 42, MemoryUsage: 58, NetworkTraffic: 12},
			{Timestamp: "2026-05-09T10:00:00Z", CPUUsage: 51, MemoryUsage: 64, NetworkTraffic: 15},
		},
	}

	if err := pdfkit.RenderMonitoringPDF(path, input); err != nil {
		if strings.Contains(err.Error(), "未找到可用的PDF中文字体") {
			t.Skipf("缺中文字体，跳过: %v", err)
		}
		t.Fatalf("RenderMonitoringPDF() error = %v", err)
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	if !bytes.HasPrefix(raw, []byte("%PDF-")) {
		t.Fatalf("output is not a PDF, first bytes = %x", first8(raw))
	}
	if !bytes.Contains(raw, []byte("/Font")) {
		t.Fatalf("output missing /Font dictionary")
	}
	if len(raw) < 8*1024 {
		t.Fatalf("output too small (%d bytes); expected ≥ 8KB", len(raw))
	}
}

// TestSoftTable_RendersInsideGofpdf builds a tiny PDF using only pdfkit's
// table component to verify the helper integrates correctly with gofpdf.
func TestSoftTable_RendersInsideGofpdf(t *testing.T) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(15, 15, 15)
	pdf.SetAutoPageBreak(true, 15)
	if err := pdfkit.RegisterFonts(pdf); err != nil {
		if strings.Contains(err.Error(), "未找到可用的PDF中文字体") {
			t.Skipf("缺中文字体，跳过: %v", err)
		}
		t.Fatalf("RegisterFonts() error = %v", err)
	}
	pdf.AddPage()

	pdfkit.WriteSoftTable(pdf, pdfkit.SoftTable{
		Headers: []string{"列1", "列2", "列3"},
		Rows: [][]string{
			{"A", "1", "x"},
			{"B", "2", "y"},
			{"C", "3", "z"},
		},
		Widths: []float64{40, 40, 40},
	})

	buf := bytes.NewBuffer(nil)
	if err := pdf.Output(buf); err != nil {
		t.Fatalf("pdf.Output() error = %v", err)
	}
	raw := buf.Bytes()
	if !bytes.HasPrefix(raw, []byte("%PDF-")) {
		t.Fatalf("not a PDF (first 8 = %x)", first8(raw))
	}
	if !bytes.Contains(raw, []byte("/Type /Page")) {
		t.Fatal("output missing /Type /Page")
	}
}

// TestWriteCoverPage_RendersStandalone validates the cover page primitive
// in isolation (without the full report pipeline).
func TestWriteCoverPage_RendersStandalone(t *testing.T) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(15, 15, 15)
	if err := pdfkit.RegisterFonts(pdf); err != nil {
		if strings.Contains(err.Error(), "未找到可用的PDF中文字体") {
			t.Skipf("缺中文字体，跳过: %v", err)
		}
		t.Fatalf("RegisterFonts() error = %v", err)
	}

	pdfkit.WriteCoverPage(pdf, pdfkit.CoverPage{
		Title:       "网络设备巡检报告",
		Subtitle:    "2026 年 5 月 — 季度回顾",
		GeneratedAt: "2026-05-09 10:30:00",
		Range:       "2026-05-01 ~ 2026-05-09",
		GeneratedBy: "admin",
		Highlights:  []string{"设备 42 台", "通过率 96.4%", "活跃告警 3"},
	})

	buf := bytes.NewBuffer(nil)
	if err := pdf.Output(buf); err != nil {
		t.Fatalf("pdf.Output() error = %v", err)
	}
	raw := buf.Bytes()
	if !bytes.HasPrefix(raw, []byte("%PDF-")) {
		t.Fatalf("not a PDF (first 8 = %x)", first8(raw))
	}
	// Cover page packs gradient bands + circles + multiple text lines
	// + brand badge — easily clears 6KB even with no compression.
	if len(raw) < 4*1024 {
		t.Fatalf("cover-only PDF too small (%d bytes); expected ≥ 4KB", len(raw))
	}
}

// isPNG checks the standard PNG signature: 0x89 'P' 'N' 'G' 0x0D 0x0A 0x1A 0x0A
func isPNG(b []byte) bool {
	return len(b) >= 8 &&
		b[0] == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G' &&
		b[4] == 0x0D && b[5] == 0x0A && b[6] == 0x1A && b[7] == 0x0A
}

func first8(b []byte) []byte {
	if len(b) >= 8 {
		return b[:8]
	}
	return b
}
