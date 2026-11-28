package reports_test

import (
	"bytes"
	"math"
	"strings"
	"testing"
	_ "unsafe"

	"github.com/phpdave11/gofpdf"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
	"github.com/your-org/inspect-system/backend-go/internal/reports/pdfkit"
)

//go:linkname describeInspectionTally github.com/your-org/inspect-system/backend-go/internal/reports.describeInspectionTally
func describeInspectionTally(stats reports.InspectionSummaryStats) string

//go:linkname splitPDFRightAlignedLines github.com/your-org/inspect-system/backend-go/internal/reports.splitPDFRightAlignedLines
func splitPDFRightAlignedLines(pdf *gofpdf.Fpdf, text string, maxWidth float64) []string

// newMeasurePDF builds a page with the CJK font registered so text width
// measurement behaves exactly as it does during real rendering. Hosts without
// a usable CJK font skip instead of failing — same policy as the other
// render tests in this package.
func newMeasurePDF(t *testing.T) *gofpdf.Fpdf {
	t.Helper()
	pdf := gofpdf.New("P", "mm", "A4", "")
	if err := pdfkit.RegisterFonts(pdf); err != nil {
		t.Skipf("current host lacks a usable CJK font for measuring: %v", err)
	}
	pdf.AddPage()
	pdf.SetFont(pdfkit.FontFamilyCJK, "", pdfkit.FontTableBody)
	return pdf
}

// A 38mm column fed a 60-rune CJK device name must come back truncated with an
// ellipsis inside the column — the exact regression behind the "内容出格"
// report for the monitoring alert table.
func TestFitCellText_TruncatesLongCJKToColumnWidth(t *testing.T) {
	pdf := newMeasurePDF(t)
	long := strings.Repeat("超长设备名", 12)
	if pdf.GetStringWidth(long) <= 38 {
		t.Fatalf("test premise broken: raw width %.1f should exceed 38mm", pdf.GetStringWidth(long))
	}
	got := pdfkit.FitCellText(pdf, long, 38)
	if w := pdf.GetStringWidth(got); w > 38 {
		t.Errorf("fitted width %.2fmm exceeds column width 38mm for %q", w, got)
	}
	if !strings.HasSuffix(got, "…") {
		t.Errorf("expected ellipsis suffix, got %q", got)
	}
}

func TestFitCellText_KeepsShortTextIntact(t *testing.T) {
	pdf := newMeasurePDF(t)
	if got := pdfkit.FitCellText(pdf, "core-sw-01", 60); got != "core-sw-01" {
		t.Errorf("short text altered: %q", got)
	}
}

// Cell text must never carry raw line breaks into CellFormat (stray glyphs).
func TestFitCellText_CollapsesWhitespace(t *testing.T) {
	pdf := newMeasurePDF(t)
	got := pdfkit.FitCellText(pdf, "a\r\nb\tc", 100)
	if strings.ContainsAny(got, "\r\n\t") {
		t.Errorf("whitespace survived sanitize: %q", got)
	}
}

// Wrap splitting must never lose a rune (the gofpdf SplitText CJK swallow bug)
// and every produced line must fit the requested width.
func TestSplitLines_RespectsWidthAndKeepsAllRunes(t *testing.T) {
	pdf := newMeasurePDF(t)
	text := strings.Repeat("接口", 30)
	lines := pdfkit.SplitLines(pdf, text, 40)
	if len(lines) < 2 {
		t.Fatalf("expected wrapping into multiple lines, got %d", len(lines))
	}
	for _, ln := range lines {
		if w := pdf.GetStringWidth(ln); w > 40.01 {
			t.Errorf("line width %.2fmm exceeds max 40mm: %q", w, ln)
		}
	}
	if joined := strings.Join(lines, ""); joined != text {
		t.Errorf("SplitLines lost runes:\n got %q\nwant %q", joined, text)
	}
}

func TestSplitPDFRightAlignedLines_PreservesFullInspectionTallyWithoutTruncation(t *testing.T) {
	pdf := newMeasurePDF(t)
	pdf.SetMargins(18, 18, 18)
	maxWidth := pdfkit.UsableWidth(pdf) - 2

	t.Run("UserReportStats", func(t *testing.T) {
		stats := reports.InspectionSummaryStats{
			TotalChecks:   120,
			PassedChecks:  88,
			WarningChecks: 3,
			FailedChecks:  15,
			SkippedChecks: 14,
		}
		tally := describeInspectionTally(stats)
		if !strings.Contains(tally, "（按 106 项计）") {
			t.Fatalf("expected tally to contain '（按 106 项计）', got: %s", tally)
		}

		lines := splitPDFRightAlignedLines(pdf, tally, maxWidth)
		if len(lines) != 2 {
			t.Fatalf("expected len(lines) == 2, got %d: %#v", len(lines), lines)
		}
		if !strings.HasSuffix(lines[0], "；") {
			t.Errorf("expected line[0] to end with '；', got: %q", lines[0])
		}
		wantLine1 := "通过率分母已剔除跳过 14 项（按 106 项计）"
		if lines[1] != wantLine1 {
			t.Errorf("line[1] = %q, want %q", lines[1], wantLine1)
		}
		for i, line := range lines {
			if strings.Contains(line, "…") {
				t.Errorf("line %d contains ellipsis: %q", i, line)
			}
			if w := pdf.GetStringWidth(line); w > maxWidth+0.001 {
				t.Errorf("line %d width %.2fmm exceeds maxWidth %.2fmm: %q", i, w, maxWidth, line)
			}
		}
		if joined := strings.Join(lines, ""); joined != tally {
			t.Errorf("joined text mismatch:\n got %q\nwant %q", joined, tally)
		}
	})

	t.Run("AllStatesSuperimposed", func(t *testing.T) {
		statsAll := reports.InspectionSummaryStats{
			TotalChecks:         150,
			PassedChecks:        100,
			WarningChecks:       5,
			FailedChecks:        10,
			ErrorChecks:         5,
			SkippedChecks:       15,
			NotApplicableChecks: 10,
			UnknownChecks:       5,
		}
		tallyAll := describeInspectionTally(statsAll)
		linesAll := splitPDFRightAlignedLines(pdf, tallyAll, maxWidth)
		if len(linesAll) < 2 {
			t.Fatalf("expected >= 2 lines for all states tally, got %d", len(linesAll))
		}
		for i, line := range linesAll {
			if strings.Contains(line, "…") {
				t.Errorf("all-states line %d contains ellipsis: %q", i, line)
			}
			if w := pdf.GetStringWidth(line); w > maxWidth+0.001 {
				t.Errorf("all-states line %d width %.2fmm exceeds maxWidth %.2fmm: %q", i, w, maxWidth, line)
			}
		}
		if joined := strings.Join(linesAll, ""); joined != tallyAll {
			t.Errorf("joined all-states text mismatch:\n got %q\nwant %q", joined, tallyAll)
		}
	})

	t.Run("ShortTextSingleLine", func(t *testing.T) {
		shortText := "口径：总检查项 10 = 通过 10"
		linesShort := splitPDFRightAlignedLines(pdf, shortText, maxWidth)
		if len(linesShort) != 1 {
			t.Fatalf("expected 1 line for short text, got %d", len(linesShort))
		}
		if linesShort[0] != shortText {
			t.Errorf("got %q, want %q", linesShort[0], shortText)
		}
		if w := pdf.GetStringWidth(linesShort[0]); w > maxWidth+0.001 {
			t.Errorf("short line width %.2fmm exceeds maxWidth %.2fmm: %q", w, maxWidth, linesShort[0])
		}
		if joined := strings.Join(linesShort, ""); joined != shortText {
			t.Errorf("joined short text mismatch:\n got %q\nwant %q", joined, shortText)
		}
	})
}

func TestGridTable_WrappedCellDoesNotTruncatePastSixLines(t *testing.T) {
	pdf := newMeasurePDF(t)
	pdf.SetMargins(18, 18, 18)
	pdf.SetXY(18, 25)

	style := pdfkit.DefaultGridTableStyle(pdfkit.GridHeaderStyle{
		FillColor: pdfkit.ColorPrimary,
		TextColor: pdfkit.ColorWhite,
		FontStyle: "B",
		FontSize:  pdfkit.FontSmall,
		Align:     "C",
	})
	style.WrapColumns = []int{0}
	colWidth := 36.2
	text := "已评估 52 个接口；中断 11 个，空闲 36 个，人为关闭 0 个（11 个接口曾承载流量、现已中断（链路故障或对端异常）：GigabitEthernet0/0/1、GigabitEthernet0/0/2、GigabitEthernet0/0/3、GigabitEthernet0/0/4、GigabitEthernet0/0/5）"

	pdf.SetFont(pdfkit.FontFamilyCJK, "", style.BodyFontSize)
	expectedLines := pdfkit.SplitLines(pdf, text, colWidth-2.2)
	if len(expectedLines) <= 6 {
		t.Fatalf("test premise broken: expected > 6 wrapped lines, got %d", len(expectedLines))
	}

	startY := pdf.GetY()
	pdfkit.GridTable(pdf, []string{"实际值"}, [][]string{{text}}, []float64{colWidth}, style)
	endY := pdf.GetY()

	wantDelta := style.HeaderHeight + float64(len(expectedLines))*style.BodyHeight
	if math.Abs((endY-startY)-wantDelta) > 0.01 {
		t.Fatalf("rendered height = %.2fmm, want %.2fmm for %d lines (6-line truncation regression)", endY-startY, wantDelta, len(expectedLines))
	}
	if err := pdf.Error(); err != nil {
		t.Fatalf("pdf.Error() = %v", err)
	}
}

func TestGridTable_OversizedWrappedRowSplitsAcrossPages(t *testing.T) {
	pdf := newMeasurePDF(t)
	pdf.SetMargins(18, 18, 18)
	pdf.SetAutoPageBreak(true, 15)
	pdf.SetXY(18, 25)

	style := pdfkit.DefaultGridTableStyle(pdfkit.GridHeaderStyle{
		FillColor: pdfkit.ColorPrimary,
		TextColor: pdfkit.ColorWhite,
		FontStyle: "B",
		FontSize:  pdfkit.FontSmall,
		Align:     "C",
	})
	style.WrapColumns = []int{0}
	style.BottomMarginMM = 15

	longText := strings.Repeat("GigabitEthernet0/0/1、", 50)
	pdf.SetFont(pdfkit.FontFamilyCJK, "", style.BodyFontSize)
	if lines := pdfkit.SplitLines(pdf, longText, 36.2-2.2); len(lines) <= 45 {
		t.Fatalf("test premise broken: expected > 45 wrapped lines, got %d", len(lines))
	}

	pdfkit.GridTable(pdf, []string{"实际值"}, [][]string{{longText}}, []float64{36.2}, style)

	if pdf.PageNo() < 2 {
		t.Fatalf("PageNo() = %d, want >= 2 for oversized wrapped row", pdf.PageNo())
	}
	if pdf.GetY() > 297-15+0.01 {
		t.Fatalf("GetY() = %.2fmm exceeds bottom margin limit %.2fmm", pdf.GetY(), 297.0-15.0)
	}
	if err := pdf.Error(); err != nil {
		t.Fatalf("pdf.Error() = %v", err)
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		t.Fatalf("pdf.Output() error = %v", err)
	}
	if !bytes.HasPrefix(buf.Bytes(), []byte("%PDF-")) {
		t.Fatalf("output is not a valid PDF")
	}
}

func TestGridTable_DeviceCategoryColumnWrapsAt24MM(t *testing.T) {
	pdf := newMeasurePDF(t)
	pdf.SetMargins(18, 18, 18)
	pdf.SetXY(18, 25)

	style := pdfkit.DefaultGridTableStyle(pdfkit.GridHeaderStyle{
		FillColor: pdfkit.ColorPrimary,
		TextColor: pdfkit.ColorWhite,
		FontStyle: "B",
		FontSize:  pdfkit.FontSmall,
		Align:     "C",
	})
	style.WrapColumns = []int{1}

	categories := []string{"硬件与系统健康", "端口与链路性能", "配置与安全合规"}
	rows := make([][]string, 0, len(categories))
	expectedTotalLines := 0
	pdf.SetFont(pdfkit.FontFamilyCJK, "", style.BodyFontSize)
	for _, cat := range categories {
		lines := pdfkit.SplitLines(pdf, cat, 24.0-2.2)
		if len(lines) < 2 {
			t.Fatalf("test premise broken: category %q did not wrap in 24mm column (lines=%d)", cat, len(lines))
		}
		expectedTotalLines += len(lines)
		rows = append(rows, []string{"检查项", cat})
	}

	startY := pdf.GetY()
	pdfkit.GridTable(pdf, []string{"检查项", "维度分类"}, rows, []float64{34, 24}, style)
	endY := pdf.GetY()

	wantDelta := style.HeaderHeight + float64(expectedTotalLines)*style.BodyHeight
	if math.Abs((endY-startY)-wantDelta) > 0.01 {
		t.Fatalf("rendered height = %.2fmm, want %.2fmm for %d total lines", endY-startY, wantDelta, expectedTotalLines)
	}
	if err := pdf.Error(); err != nil {
		t.Fatalf("pdf.Error() = %v", err)
	}
}
