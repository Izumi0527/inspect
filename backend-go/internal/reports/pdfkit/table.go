package pdfkit

import (
	"strings"

	"github.com/phpdave11/gofpdf"
)

// Text-width helpers shared by every table renderer. All three measure with
// the currently-set font, so callers must SetFont before using them. They were
// originally private to the reports package; moving them here lets GridTable
// and SoftTable share one truncation/wrapping implementation instead of the
// soft table going without.

// TruncateToWidth shortens text with a trailing ellipsis until it fits
// maxWidth at the currently-set font. gofpdf's CellFormat neither wraps nor
// clips, so untruncated long values (device names, raw check outputs) would
// otherwise be drawn straight across the neighbouring columns.
func TruncateToWidth(pdf *gofpdf.Fpdf, text string, maxWidth float64) string {
	if maxWidth <= 0 || pdf.GetStringWidth(text) <= maxWidth {
		return text
	}
	const ellipsis = "…"
	runes := []rune(text)
	for len(runes) > 0 {
		runes = runes[:len(runes)-1]
		candidate := string(runes) + ellipsis
		if pdf.GetStringWidth(candidate) <= maxWidth {
			return candidate
		}
	}
	return ellipsis
}

// SplitLines wraps text into lines no wider than maxWidth using the
// currently-set font, breaking on rune boundaries. gofpdf's own SplitText
// walks the string byte-by-byte (designed for cp1252 fonts) and may break
// inside a multi-byte CJK sequence, swallowing one byte at the break point —
// a Chinese character silently disappears from the output. Width accumulates
// per rune, which matches full-string measurement since gofpdf applies no
// kerning.
func SplitLines(pdf *gofpdf.Fpdf, text string, maxWidth float64) []string {
	if text == "" {
		return []string{""}
	}
	lines := make([]string, 0, 2)
	var current strings.Builder
	lineWidth := 0.0
	for _, r := range text {
		runeWidth := pdf.GetStringWidth(string(r))
		if current.Len() > 0 && maxWidth > 0 && lineWidth+runeWidth > maxWidth {
			lines = append(lines, current.String())
			current.Reset()
			lineWidth = 0
		}
		current.WriteRune(r)
		lineWidth += runeWidth
	}
	return append(lines, current.String())
}

// SanitizeCellText collapses the line breaks and tabs that would otherwise
// make CellFormat draw stray glyphs inside a table cell.
func SanitizeCellText(value string) string {
	if !strings.ContainsAny(value, "\r\n\t") {
		return value
	}
	replacer := strings.NewReplacer("\r\n", " ", "\r", " ", "\n", " ", "\t", " ")
	return strings.Join(strings.Fields(replacer.Replace(value)), " ")
}

// FitCellText sanitizes then truncates a single-line cell value to the width
// available inside a column. It is the one call every table renderer should
// use before drawing a plain (non-wrapping) cell.
func FitCellText(pdf *gofpdf.Fpdf, value string, colWidthMM float64) string {
	return TruncateToWidth(pdf, SanitizeCellText(value), colWidthMM-cellPadMM)
}

// cellPadMM approximates gofpdf's built-in 1mm cell margin on both sides;
// truncation targets the width actually available to glyphs.
const cellPadMM = 2.2
