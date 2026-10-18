package reports_test

import (
	"strings"
	"testing"

	"github.com/phpdave11/gofpdf"

	"github.com/your-org/inspect-system/backend-go/internal/reports/pdfkit"
)

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
