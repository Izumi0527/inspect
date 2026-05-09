package pdfkit

import (
	"fmt"
	"strings"

	"github.com/phpdave11/gofpdf"
)

// CoverPage describes the data shown on a report cover. Fields left empty
// are silently skipped, so callers can pass partial data without conditional
// boilerplate.
type CoverPage struct {
	Title       string
	Subtitle    string
	Brand       string   // e.g. "INSPECT" — defaults to "INSPECT" when blank
	Tagline     string   // small text under brand, e.g. "Report Center"
	GeneratedAt string   // human-readable timestamp
	Range       string   // e.g. "2026-05-01 ~ 2026-05-08"
	GeneratedBy string   // optional author name
	Highlights  []string // up to 4 short metric pills shown below info block
}

// WriteCoverPage renders a full A4 cover page on a fresh PDF page.
//
// Layout:
//
//	╔══════════════════════════════════════════╗
//	║  ▓▓▓▓▓▓ indigo gradient banner ▓▓▓▓▓▓▓▓▓ ║   ~110mm
//	║  ▓                                      ▓ ║
//	║  ▓     <Title>                          ▓ ║
//	║  ▓     <Subtitle>                       ▓ ║
//	║  ▓                                      ▓ ║
//	║  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ║
//	║                                          ║
//	║   ┌─ Generated At ─┐ ┌─ Range ──────┐     ║
//	║   │ 2026-05-09     │ │ 2026-05-01.. │     ║
//	║   └────────────────┘ └──────────────┘     ║
//	║                                          ║
//	║   [Highlight] [Highlight] [Highlight]     ║
//	║                                          ║
//	║                   ───── INSPECT          ║
//	║                  Report Center           ║
//	╚══════════════════════════════════════════╝
//
// The "gradient" is a stack of thin horizontal bands transitioning from
// ColorPrimaryStrong (indigo-600) to ColorAccent (indigo-400). gofpdf
// has no native gradient primitive, so this band-stack approach is the
// least-bad option that still looks smooth at typical PDF zoom levels.
func WriteCoverPage(pdf *gofpdf.Fpdf, data CoverPage) {
	pdf.AddPage()
	pageW, pageH := pdf.GetPageSize()

	// Banner
	bannerH := 110.0
	drawVerticalGradient(pdf, 0, 0, pageW, bannerH, ColorPrimaryStrong, ColorAccent, 40)

	// Decorative circles in the banner (subtle, white at 8% opacity emulated
	// via near-white on the gradient — gofpdf has no alpha so we use pale
	// indigo that blends well).
	pdf.SetFillColor(ColorIndigo300[0], ColorIndigo300[1], ColorIndigo300[2])
	for i, r := range []float64{18, 12, 26} {
		pdf.Circle(pageW-30+float64(i)*4, 18+float64(i)*8, r, "F")
	}

	// Title block
	pdf.SetTextColor(ColorWhite[0], ColorWhite[1], ColorWhite[2])
	pdf.SetFont(FontFamilyCJK, "B", 32)
	pdf.SetXY(28, 42)
	pdf.MultiCell(pageW-56, 14, strings.TrimSpace(data.Title), "", "L", false)

	if subtitle := strings.TrimSpace(data.Subtitle); subtitle != "" {
		pdf.SetFont(FontFamilyCJK, "", 13)
		pdf.SetX(28)
		pdf.MultiCell(pageW-56, 7, subtitle, "", "L", false)
	}

	// Info block (two-column key/value grid)
	infoY := bannerH + 18
	pdf.SetTextColor(ColorText[0], ColorText[1], ColorText[2])
	infoEntries := [][2]string{
		{"生成时间", strings.TrimSpace(data.GeneratedAt)},
		{"统计范围", strings.TrimSpace(data.Range)},
		{"生成人", strings.TrimSpace(data.GeneratedBy)},
	}
	colW := (pageW - 56 - 8) / 2
	row := 0
	for _, kv := range infoEntries {
		if kv[1] == "" {
			continue
		}
		col := row % 2
		line := row / 2
		x := 28 + float64(col)*(colW+8)
		y := infoY + float64(line)*22

		pdf.SetFillColor(ColorSurfaceMuted[0], ColorSurfaceMuted[1], ColorSurfaceMuted[2])
		pdf.SetDrawColor(ColorBorder[0], ColorBorder[1], ColorBorder[2])
		pdf.Rect(x, y, colW, 18, "FD")
		// left accent bar
		pdf.SetFillColor(ColorPrimary[0], ColorPrimary[1], ColorPrimary[2])
		pdf.Rect(x, y, 2.4, 18, "F")

		pdf.SetXY(x+6, y+3.5)
		pdf.SetFont(FontFamilyCJK, "", 9)
		pdf.SetTextColor(ColorTextMuted[0], ColorTextMuted[1], ColorTextMuted[2])
		pdf.CellFormat(colW-10, 4.5, kv[0], "", 1, "L", false, 0, "")
		pdf.SetXY(x+6, y+10)
		pdf.SetFont(FontFamilyCJK, "B", 12)
		pdf.SetTextColor(ColorText[0], ColorText[1], ColorText[2])
		pdf.CellFormat(colW-10, 5, kv[1], "", 1, "L", false, 0, "")
		row++
	}

	// Highlight pills
	if len(data.Highlights) > 0 {
		pillY := infoY + 56
		pillX := 28.0
		pdf.SetFont(FontFamilyCJK, "B", 9)
		for i, h := range data.Highlights {
			if i >= 4 {
				break
			}
			text := strings.TrimSpace(h)
			if text == "" {
				continue
			}
			w := 28.0 + float64(len([]rune(text)))*1.6
			pdf.SetFillColor(ColorPrimarySoft[0], ColorPrimarySoft[1], ColorPrimarySoft[2])
			pdf.RoundedRect(pillX, pillY, w, 9, 2.5, "0123", "F")
			pdf.SetXY(pillX, pillY+1.4)
			pdf.SetTextColor(ColorPrimaryStrong[0], ColorPrimaryStrong[1], ColorPrimaryStrong[2])
			pdf.CellFormat(w, 6, text, "", 0, "C", false, 0, "")
			pillX += w + 5
			if pillX > pageW-30 {
				break
			}
		}
	}

	// Brand block bottom-right
	brand := strings.TrimSpace(data.Brand)
	if brand == "" {
		brand = "INSPECT"
	}
	tagline := strings.TrimSpace(data.Tagline)
	if tagline == "" {
		tagline = "Report Center"
	}
	pdf.SetDrawColor(ColorPrimary[0], ColorPrimary[1], ColorPrimary[2])
	pdf.SetLineWidth(0.6)
	pdf.Line(pageW-66, pageH-46, pageW-26, pageH-46)
	pdf.SetTextColor(ColorPrimaryStrong[0], ColorPrimaryStrong[1], ColorPrimaryStrong[2])
	pdf.SetFont(FontFamilyLatin, "B", 18)
	pdf.SetXY(pageW-66, pageH-44)
	pdf.CellFormat(40, 8, brand, "", 1, "R", false, 0, "")
	pdf.SetX(pageW - 66)
	pdf.SetFont(FontFamilyLatin, "", 9)
	pdf.SetTextColor(ColorTextMuted[0], ColorTextMuted[1], ColorTextMuted[2])
	pdf.CellFormat(40, 5, tagline, "", 0, "R", false, 0, "")

	// Reset draw state to neutral defaults so callers don't inherit our colors.
	pdf.SetTextColor(ColorBlack[0], ColorBlack[1], ColorBlack[2])
	pdf.SetDrawColor(ColorBlack[0], ColorBlack[1], ColorBlack[2])
	pdf.SetLineWidth(0.2)
}

// TOCEntry represents one row in a Table of Contents.
type TOCEntry struct {
	Title string
	Page  int
}

// WriteTableOfContents renders a "目录" page on a fresh page if entries
// has at least 3 items. Shorter reports skip the TOC to stay compact.
//
// Each row is "<title>  ............  <page>" with a dotted leader. gofpdf
// has no real link primitive in this version, so page numbers are textual.
func WriteTableOfContents(pdf *gofpdf.Fpdf, entries []TOCEntry) {
	if len(entries) < 3 {
		return
	}
	pdf.AddPage()

	pageW, _ := pdf.GetPageSize()
	left, _, right, _ := pdf.GetMargins()
	usable := pageW - left - right

	pdf.SetFont(FontFamilyCJK, "B", 22)
	pdf.SetTextColor(ColorText[0], ColorText[1], ColorText[2])
	pdf.SetXY(left, 24)
	pdf.CellFormat(usable, 12, "目录", "", 1, "L", false, 0, "")

	pdf.SetDrawColor(ColorPrimary[0], ColorPrimary[1], ColorPrimary[2])
	pdf.SetLineWidth(1.4)
	pdf.Line(left, 38, left+30, 38)

	pdf.SetLineWidth(0.2)
	pdf.SetY(50)
	pdf.SetFont(FontFamilyCJK, "", 11)

	for i, entry := range entries {
		title := strings.TrimSpace(entry.Title)
		if title == "" {
			continue
		}
		y := pdf.GetY()
		pageStr := fmt.Sprintf("%d", entry.Page)

		pdf.SetTextColor(ColorTextMuted[0], ColorTextMuted[1], ColorTextMuted[2])
		pdf.SetFont(FontFamilyLatin, "B", 9)
		pdf.SetXY(left, y+1)
		pdf.CellFormat(8, 8, fmt.Sprintf("%02d", i+1), "", 0, "L", false, 0, "")

		pdf.SetTextColor(ColorText[0], ColorText[1], ColorText[2])
		pdf.SetFont(FontFamilyCJK, "", 11)
		pdf.SetX(left + 8)
		titleW := pdf.GetStringWidth(title)
		pdf.CellFormat(titleW+2, 8, title, "", 0, "L", false, 0, "")

		// Dotted leader
		pageW := pdf.GetStringWidth(pageStr)
		leaderStart := left + 10 + titleW
		leaderEnd := left + usable - pageW - 2
		drawDottedLine(pdf, leaderStart, y+5.5, leaderEnd, y+5.5, ColorBorder)

		pdf.SetXY(left+usable-pageW-2, y)
		pdf.SetFont(FontFamilyLatin, "B", 10)
		pdf.SetTextColor(ColorPrimary[0], ColorPrimary[1], ColorPrimary[2])
		pdf.CellFormat(pageW+2, 8, pageStr, "", 1, "R", false, 0, "")

		pdf.SetY(y + 9)
	}

	pdf.SetTextColor(ColorBlack[0], ColorBlack[1], ColorBlack[2])
	pdf.SetDrawColor(ColorBlack[0], ColorBlack[1], ColorBlack[2])
}

// WriteChapterDivider draws a chapter title block at the current position
// (no automatic page break — the caller decides whether to start a new
// page). Use it before each top-level section in long reports.
func WriteChapterDivider(pdf *gofpdf.Fpdf, number int, title string) {
	pageW, _ := pdf.GetPageSize()
	left, _, right, _ := pdf.GetMargins()
	usable := pageW - left - right

	y := pdf.GetY()

	// Number tile (filled square with white digits)
	tile := 14.0
	pdf.SetFillColor(ColorPrimary[0], ColorPrimary[1], ColorPrimary[2])
	pdf.Rect(left, y, tile, tile, "F")
	pdf.SetTextColor(ColorWhite[0], ColorWhite[1], ColorWhite[2])
	pdf.SetFont(FontFamilyLatin, "B", 12)
	pdf.SetXY(left, y+2.5)
	pdf.CellFormat(tile, 9, fmt.Sprintf("%02d", number), "", 0, "C", false, 0, "")

	// Chapter title beside the tile
	pdf.SetTextColor(ColorText[0], ColorText[1], ColorText[2])
	pdf.SetFont(FontFamilyCJK, "B", 18)
	pdf.SetXY(left+tile+5, y+1)
	pdf.CellFormat(usable-tile-5, 12, strings.TrimSpace(title), "", 1, "L", false, 0, "")

	// Underline
	pdf.SetDrawColor(ColorBorder[0], ColorBorder[1], ColorBorder[2])
	pdf.SetLineWidth(0.4)
	pdf.Line(left, y+tile+2, left+usable, y+tile+2)

	pdf.SetTextColor(ColorBlack[0], ColorBlack[1], ColorBlack[2])
	pdf.SetDrawColor(ColorBlack[0], ColorBlack[1], ColorBlack[2])
	pdf.SetLineWidth(0.2)
	pdf.SetY(y + tile + 6)
}

// drawVerticalGradient paints a top-to-bottom color gradient inside the
// rectangle (x,y,w,h) by stacking `bands` thin horizontal slices, each
// colored by linear interpolation between top and bottom.
func drawVerticalGradient(pdf *gofpdf.Fpdf, x, y, w, h float64, top, bottom Color, bands int) {
	if bands < 2 {
		bands = 2
	}
	bandH := h / float64(bands)
	for i := 0; i < bands; i++ {
		t := float64(i) / float64(bands-1)
		r := int(float64(top[0])*(1-t) + float64(bottom[0])*t)
		g := int(float64(top[1])*(1-t) + float64(bottom[1])*t)
		b := int(float64(top[2])*(1-t) + float64(bottom[2])*t)
		pdf.SetFillColor(r, g, b)
		// Overlap each band by 0.05mm to avoid hairline gaps at zoom levels
		// where PDF viewers anti-alias seams differently.
		pdf.Rect(x, y+float64(i)*bandH-0.05, w, bandH+0.1, "F")
	}
}

// drawDottedLine draws a horizontal dotted line between (x1,y) and (x2,y)
// using small filled circles. gofpdf doesn't expose dash patterns in the
// version pinned by this project (v1.4.3).
func drawDottedLine(pdf *gofpdf.Fpdf, x1, y, x2, _ float64, c Color) {
	if x2-x1 < 4 {
		return
	}
	pdf.SetFillColor(c[0], c[1], c[2])
	step := 1.6
	for x := x1; x <= x2; x += step {
		pdf.Circle(x, y, 0.25, "F")
	}
}
