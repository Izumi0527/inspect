// Package pdfkit holds reusable PDF rendering primitives shared between
// the reports module and any other module that needs to emit PDFs
// (currently the monitoring report exporter). Keeping these primitives in a
// dedicated subpackage prevents the reports package from accumulating PDF
// helper files past the project-wide 8-file-per-folder budget and lets new
// callers depend on a small, focused surface.
package pdfkit

// Color is an RGB triplet (0-255 each), matching gofpdf's SetFillColor /
// SetTextColor / SetDrawColor signatures. Using a named alias instead of a
// distinct struct keeps tokens drop-in compatible with the existing
// [3]int call sites in report_render_pdf.go.
type Color = [3]int

// Tailwind v4 aligned color palette. These values mirror the default
// Tailwind palette used by the frontend (indigo / emerald / amber / rose /
// slate). PDF and web UI must stay in sync — when the frontend rebrands its
// primary color, update the corresponding token here too.
var (
	ColorIndigo50  = Color{238, 242, 255}
	ColorIndigo100 = Color{224, 231, 255}
	ColorIndigo300 = Color{165, 180, 252}
	ColorIndigo400 = Color{129, 140, 248}
	ColorIndigo500 = Color{99, 102, 241}
	ColorIndigo600 = Color{79, 70, 229}
	ColorIndigo700 = Color{67, 56, 202}

	ColorEmerald400 = Color{52, 211, 153}
	ColorEmerald500 = Color{16, 185, 129}
	ColorEmerald600 = Color{5, 150, 105}

	ColorAmber100 = Color{254, 243, 199}
	ColorAmber400 = Color{251, 191, 36}
	ColorAmber500 = Color{245, 158, 11}
	ColorAmber600 = Color{217, 119, 6}

	ColorRose100 = Color{255, 228, 230}
	ColorRose400 = Color{251, 113, 133}
	ColorRose500 = Color{244, 63, 94}
	ColorRose600 = Color{225, 29, 72}

	ColorEmerald50 = Color{236, 253, 245}

	ColorSlate50  = Color{248, 250, 252}
	ColorSlate100 = Color{241, 245, 249}
	ColorSlate200 = Color{226, 232, 240}
	ColorSlate300 = Color{203, 213, 225}
	ColorSlate400 = Color{148, 163, 184}
	ColorSlate500 = Color{100, 116, 139}
	ColorSlate600 = Color{71, 85, 105}
	ColorSlate700 = Color{51, 65, 85}
	ColorSlate800 = Color{30, 41, 59}
	ColorSlate900 = Color{15, 23, 42}

	ColorWhite = Color{255, 255, 255}
	ColorBlack = Color{0, 0, 0}
)

// Semantic role aliases. Components should reference these rather than the
// raw color names so future palette swaps stay localized.
var (
	ColorPrimary       = ColorIndigo500
	ColorPrimaryStrong = ColorIndigo600
	ColorPrimarySoft   = ColorIndigo100
	ColorAccent        = ColorIndigo400
	ColorSuccess       = ColorEmerald500
	ColorWarning       = ColorAmber500
	ColorDanger        = ColorRose500
	ColorText          = ColorSlate900
	ColorTextMuted     = ColorSlate500
	ColorBorder        = ColorSlate200
	ColorBorderStrong  = ColorSlate300
	ColorSurface       = ColorWhite
	ColorSurfaceMuted  = ColorSlate50
	ColorSurfacePanel  = ColorSlate100

	// Hero/Card 视觉别名 — 抽出作为独立 token 后，未来调整 hero 渐变跨度
	// 或 stat card 默认配色无需追改 components.go 内的硬编码引用。
	// Top 选 indigo-700 而不是 indigo-600，让顶/底渐变对比更明显（先前
	// 600→500 视觉上过于接近实色，截图1 可见 hero 几乎看不出渐变层次）。
	ColorHeroGradientTop    = ColorIndigo700
	ColorHeroGradientBottom = ColorIndigo500
	ColorStatCardAccent     = ColorIndigo500
)

// Spacing tokens expressed in millimeters (PDF native unit). Roughly aligned
// with Tailwind's 4/8/12/16/24 spacing scale (1 unit ≈ 0.5mm in print).
const (
	SpaceXS  = 2.0
	SpaceSM  = 4.0
	SpaceMD  = 8.0
	SpaceLG  = 12.0
	SpaceXL  = 16.0
	Space2XL = 24.0
)

// Font size tokens expressed in points. These are referenced by both the
// chrome (cover / TOC / chapter dividers) and the component layer (hero /
// cards / tables) so vertical rhythm stays consistent across reports.
const (
	FontHero    = 22.0
	FontTitle   = 18.0
	FontH1      = 16.0
	FontH2      = 13.0
	FontBody    = 11.0
	FontSmall   = 9.0
	FontCaption = 8.0
)

// PassRateColor returns the semantic status color for a pass-rate value
// (0-100). Mirrors the existing passRatePDFColor logic in report_render_pdf.go
// but routes through tokens so the thresholds and colors stay consistent
// with the rest of the design system.
func PassRateColor(rate float64) Color {
	switch {
	case rate >= 90:
		return ColorSuccess
	case rate >= 70:
		return ColorWarning
	default:
		return ColorDanger
	}
}

// MetricKindColor maps a metric semantic kind (success / failed / warning /
// neutral) to its presentation color. The reports package previously hard-
// coded these mappings inline; consolidating them here lets new metric types
// be themed in one place.
func MetricKindColor(kind string) Color {
	switch kind {
	case "success", "passed", "ok":
		return ColorSuccess
	case "failed", "error":
		return ColorDanger
	case "warning":
		return ColorWarning
	case "primary", "info":
		return ColorPrimary
	case "accent":
		return ColorAccent
	default:
		return ColorPrimary
	}
}

// IsZero reports whether c is the zero color {0,0,0}, useful for detecting
// uninitialized struct fields without confusing them with intentional black.
func IsZero(c Color) bool {
	return c == Color{}
}
