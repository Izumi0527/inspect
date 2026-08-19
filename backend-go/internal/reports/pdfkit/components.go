package pdfkit

import (
	"fmt"
	"strings"

	"github.com/phpdave11/gofpdf"
)

// HeroBanner is the slim 35-40mm header that introduces a section/page
// (different from CoverPage which is a full A4 cover). Use it at the top
// of inspection / statistics / monitoring PDFs to set the visual tone.
type HeroBanner struct {
	Title    string
	Subtitle string
	Brand    string   // optional, defaults to "INSPECT"
	Tagline  string   // optional, e.g. "Report Center"
	Chips    []string // up to 4 short metric chips on the right side
}

// WriteHeroBanner draws the banner at the current cursor and advances Y
// past it. Banner height adapts (32mm without chips, 38mm with chips).
//
// 几何要点：
//   - 渐变跨度从 ColorHeroGradientTop（indigo-700）到 ColorHeroGradientBottom
//     （indigo-500），28 bands。先前 600→500 太接近，截图1 几乎看不出渐变。
//   - 左侧 5mm 暗色条 + 右下角 3 颗 indigo-300 圆点 + 左下角短折线，
//     补充几何细节让 hero 不再是大色块。
//   - 白徽章：圆角 5mm + 0.4mm primary 描边，宽 44mm，比旧版（38mm，
//     圆角 3mm，无描边）更醒目。
//   - 标题字号 18→22，副标题加 1.6mm 左色条与 SectionTitle 视觉呼应。
func WriteHeroBanner(pdf *gofpdf.Fpdf, hero HeroBanner) {
	pageW, _ := pdf.GetPageSize()
	left, _, right, _ := pdf.GetMargins()
	usableW := pageW - left - right
	x := left
	y := pdf.GetY()
	height := 38.0
	if len(hero.Chips) == 0 {
		height = 32.0
	}

	// 主渐变 + 左侧 5mm 强化色条
	drawVerticalGradient(pdf, x, y, usableW, height, ColorHeroGradientTop, ColorHeroGradientBottom, 28)
	pdf.SetFillColor(ColorIndigo700[0], ColorIndigo700[1], ColorIndigo700[2])
	pdf.Rect(x, y, 5, height, "F")

	// 装饰：右下角 3 颗错落圆点（indigo-300，模拟"轻量浮雕"效果）
	pdf.SetFillColor(ColorIndigo300[0], ColorIndigo300[1], ColorIndigo300[2])
	pdf.Circle(x+usableW-58, y+height-7, 1.6, "F")
	pdf.Circle(x+usableW-54, y+height-9.5, 2.2, "F")
	pdf.Circle(x+usableW-50, y+height-6.5, 1.2, "F")

	// 装饰：左下角微妙折线（3 段，0.3mm，indigo-400）
	pdf.SetDrawColor(ColorIndigo400[0], ColorIndigo400[1], ColorIndigo400[2])
	pdf.SetLineWidth(0.35)
	pdf.Line(x+10, y+height-3.5, x+15, y+height-1.8)
	pdf.Line(x+15, y+height-1.8, x+20, y+height-3.5)
	pdf.Line(x+20, y+height-3.5, x+25, y+height-1.8)
	pdf.SetLineWidth(0.2)

	// 右侧白色徽章（圆角 5mm + primary 描边）
	brand := strings.TrimSpace(hero.Brand)
	if brand == "" {
		brand = "巡检系统"
	}
	tagline := strings.TrimSpace(hero.Tagline)
	if tagline == "" {
		tagline = "报告中心"
	}
	badgeW := 44.0
	badgeX := x + usableW - badgeW - 3
	badgeY := y + 5
	badgeH := height - 10
	pdf.SetDrawColor(ColorPrimary[0], ColorPrimary[1], ColorPrimary[2])
	pdf.SetLineWidth(0.4)
	pdf.SetFillColor(ColorWhite[0], ColorWhite[1], ColorWhite[2])
	pdf.RoundedRect(badgeX, badgeY, badgeW, badgeH, 5, "0123", "FD")
	pdf.SetLineWidth(0.2)
	pdf.SetTextColor(ColorPrimaryStrong[0], ColorPrimaryStrong[1], ColorPrimaryStrong[2])
	// 徽章文案按内容选字体：FontFamilyLatin（Inter/Arial/DejaVu）没有 CJK
	// 码点，中文品牌名会整体渲染成 .notdef 方框。字号同时按徽章宽度自适应，
	// 汉字比等量拉丁字母宽得多，固定 15pt 会溢出白色圆角徽章。
	pdf.SetXY(badgeX, badgeY+badgeH/2-5.5)
	fitFontSize(pdf, brand, textFontFamily(brand), "B", 15, 9, badgeW-4)
	pdf.CellFormat(badgeW, 6.5, brand, "", 1, "C", false, 0, "")
	pdf.SetTextColor(ColorTextMuted[0], ColorTextMuted[1], ColorTextMuted[2])
	pdf.SetX(badgeX)
	fitFontSize(pdf, tagline, textFontFamily(tagline), "", 8, 6, badgeW-4)
	pdf.CellFormat(badgeW, 4, tagline, "", 0, "C", false, 0, "")

	// 标题（字号 22pt，CJK Bold）
	pdf.SetTextColor(ColorWhite[0], ColorWhite[1], ColorWhite[2])
	pdf.SetFont(FontFamilyCJK, "B", 22)
	pdf.SetXY(x+12, y+5.5)
	pdf.CellFormat(usableW-badgeW-22, 10, normalize(hero.Title, "报表"), "", 1, "L", false, 0, "")

	// 副标题（左侧 1.6mm 浅色短条 + 11pt 文字）
	if subtitle := strings.TrimSpace(hero.Subtitle); subtitle != "" {
		subY := y + 16.5
		pdf.SetFillColor(ColorIndigo300[0], ColorIndigo300[1], ColorIndigo300[2])
		pdf.Rect(x+12, subY+0.6, 1.6, 4.2, "F")
		pdf.SetFont(FontFamilyCJK, "", 11)
		pdf.SetTextColor(ColorWhite[0], ColorWhite[1], ColorWhite[2])
		pdf.SetXY(x+15, subY)
		pdf.CellFormat(usableW-badgeW-25, 6, subtitle, "", 1, "L", false, 0, "")
	}

	// Chips（仅在有 chips 时渲染，置于 hero 底部）。宽度用 GetStringWidth
	// 实测（旧版 24+runes*1.4 估算对「中文+长时间戳」严重偏大，导致
	// 「通过率」chip 被整个丢弃）。
	if len(hero.Chips) > 0 {
		chipY := y + height - 11
		chipX := x + 12
		pdf.SetFont(FontFamilyCJK, "", 8.5)
		for _, item := range hero.Chips {
			text := strings.TrimSpace(item)
			if text == "" {
				continue
			}
			w := pdf.GetStringWidth(text) + 8 // 左右各 4mm 内边距
			if chipX+w > x+usableW-badgeW-6 {
				break
			}
			pdf.SetFillColor(ColorWhite[0], ColorWhite[1], ColorWhite[2])
			pdf.RoundedRect(chipX, chipY, w, 7, 2, "0123", "F")
			pdf.SetXY(chipX, chipY+0.8)
			pdf.SetTextColor(ColorPrimaryStrong[0], ColorPrimaryStrong[1], ColorPrimaryStrong[2])
			pdf.CellFormat(w, 5.4, text, "", 0, "C", false, 0, "")
			chipX += w + 3
		}
	}

	pdf.SetTextColor(ColorBlack[0], ColorBlack[1], ColorBlack[2])
	pdf.SetDrawColor(ColorBlack[0], ColorBlack[1], ColorBlack[2])
	pdf.SetY(y + height + 2)
}

// SectionTitle writes a large section heading with an accent bar and a
// thin underline. Replaces the old writePDFSectionTitle visual.
func SectionTitle(pdf *gofpdf.Fpdf, title string) {
	pageW, _ := pdf.GetPageSize()
	left, _, right, _ := pdf.GetMargins()
	usable := pageW - left - right

	y := pdf.GetY()
	pdf.SetFillColor(ColorPrimary[0], ColorPrimary[1], ColorPrimary[2])
	pdf.Rect(left, y+1, 2.4, 7, "F")

	pdf.SetXY(left+5, y)
	pdf.SetFont(FontFamilyCJK, "B", 14)
	pdf.SetTextColor(ColorText[0], ColorText[1], ColorText[2])
	pdf.CellFormat(usable-5, 9, strings.TrimSpace(title), "", 1, "L", false, 0, "")

	pdf.SetDrawColor(ColorBorder[0], ColorBorder[1], ColorBorder[2])
	pdf.SetLineWidth(0.2)
	pdf.Line(left, y+10.5, left+usable, y+10.5)

	pdf.SetTextColor(ColorBlack[0], ColorBlack[1], ColorBlack[2])
	pdf.SetDrawColor(ColorBlack[0], ColorBlack[1], ColorBlack[2])
	pdf.SetY(y + 13)
}

// StatCard is a single big-number metric (e.g. "12 设备").
type StatCard struct {
	Label string
	Value string
	Hint  string // optional sub-label, like "+3 vs last week"
	Color Color  // top accent bar color; falls back to ColorPrimary when zero
}

// WriteStatCardRow renders a row of equal-width stat cards. Modern style:
// white card body + 3mm top accent bar + subtle border + Latin font for the
// big number (so digits look crisp regardless of CJK font choice).
//
// 卡片高度 22mm（旧 26mm），数字字号 16pt（旧 18pt），让 6 列窄卡（监控
// PDF 6 个 KPI 单行）下的纵横比保持协调；4 列宽卡时仍然不显得拥挤。
func WriteStatCardRow(pdf *gofpdf.Fpdf, cards []StatCard, columns int) {
	if len(cards) == 0 {
		return
	}
	if columns <= 0 {
		columns = 4
	}
	pageW, _ := pdf.GetPageSize()
	left, _, right, _ := pdf.GetMargins()
	usable := pageW - left - right
	gap := 4.0
	cardW := (usable - gap*float64(columns-1)) / float64(columns)
	cardH := 22.0
	startY := pdf.GetY()

	for idx, card := range cards {
		col := idx % columns
		row := idx / columns
		x := left + float64(col)*(cardW+gap)
		y := startY + float64(row)*(cardH+gap)
		accent := card.Color
		if IsZero(accent) {
			accent = ColorStatCardAccent
		}

		// Card body (white) + outline border
		pdf.SetFillColor(ColorSurface[0], ColorSurface[1], ColorSurface[2])
		pdf.SetDrawColor(ColorBorder[0], ColorBorder[1], ColorBorder[2])
		pdf.SetLineWidth(0.2)
		pdf.RoundedRect(x, y, cardW, cardH, 2.4, "0123", "FD")

		// Top accent bar (3mm)
		pdf.SetFillColor(accent[0], accent[1], accent[2])
		pdf.Rect(x+0.6, y+0.6, cardW-1.2, 2.6, "F")

		// Label
		pdf.SetXY(x+5, y+5)
		pdf.SetFont(FontFamilyCJK, "", 8.5)
		pdf.SetTextColor(ColorTextMuted[0], ColorTextMuted[1], ColorTextMuted[2])
		pdf.CellFormat(cardW-10, 4.5, strings.TrimSpace(card.Label), "", 1, "L", false, 0, "")

		// Big value — 按内容选字体（含 CJK 时不能用 Latin 面，Inter/Arial
		// 没有汉字字形，"3 秒" 会渲染成方框），并按卡宽自适应缩字号，
		// 避免长值（如完整时间戳）溢出卡片被右侧邻卡覆盖。
		value := fallback(card.Value, "-")
		pdf.SetX(x + 5)
		fitFontSize(pdf, value, textFontFamily(value), "B", 16, 9, cardW-10)
		pdf.SetTextColor(ColorText[0], ColorText[1], ColorText[2])
		pdf.CellFormat(cardW-10, 8, value, "", 1, "L", false, 0, "")

		// Hint
		if hint := strings.TrimSpace(card.Hint); hint != "" {
			pdf.SetX(x + 5)
			pdf.SetFont(FontFamilyCJK, "", 7.5)
			pdf.SetTextColor(ColorTextMuted[0], ColorTextMuted[1], ColorTextMuted[2])
			pdf.CellFormat(cardW-10, 3.5, hint, "", 0, "L", false, 0, "")
		}
	}

	rows := (len(cards) + columns - 1) / columns
	pdf.SetTextColor(ColorBlack[0], ColorBlack[1], ColorBlack[2])
	pdf.SetDrawColor(ColorBlack[0], ColorBlack[1], ColorBlack[2])
	pdf.SetY(startY + float64(rows)*cardH + float64(rows-1)*gap + 3)
}

// ProgressBar draws a labeled horizontal progress bar with a neutral track
// and a colored fill. The percent label sits centered over the fill.
func ProgressBar(pdf *gofpdf.Fpdf, label string, percent float64, fill Color) {
	if percent < 0 {
		percent = 0
	}
	if percent > 100 {
		percent = 100
	}
	if IsZero(fill) {
		fill = ColorPrimary
	}
	pageW, _ := pdf.GetPageSize()
	left, _, right, _ := pdf.GetMargins()
	usable := pageW - left - right

	// Caption row
	pdf.SetFont(FontFamilyCJK, "B", 10)
	pdf.SetTextColor(ColorText[0], ColorText[1], ColorText[2])
	pdf.CellFormat(usable*0.7, 5.5, strings.TrimSpace(label), "", 0, "L", false, 0, "")
	pdf.SetFont(FontFamilyLatin, "B", 10)
	pdf.SetTextColor(fill[0], fill[1], fill[2])
	pdf.CellFormat(usable*0.3, 5.5, fmt.Sprintf("%.1f%%", percent), "", 1, "R", false, 0, "")

	// Bar
	y := pdf.GetY() + 1
	barH := 6.5
	pdf.SetFillColor(ColorSurfacePanel[0], ColorSurfacePanel[1], ColorSurfacePanel[2])
	pdf.RoundedRect(left, y, usable, barH, 2.5, "0123", "F")
	if percent > 0 {
		pdf.SetFillColor(fill[0], fill[1], fill[2])
		pdf.RoundedRect(left, y, usable*percent/100, barH, 2.5, "0123", "F")
	}

	pdf.SetTextColor(ColorBlack[0], ColorBlack[1], ColorBlack[2])
	pdf.SetY(y + barH + 3)
}

// SoftTable is the modernized replacement for the boxy bordered table:
// it draws only top/bottom horizontal rules and a header underline (no
// per-cell vertical borders), and uses ColorSurfaceMuted for zebra.
type SoftTable struct {
	Headers      []string
	Rows         [][]string
	Widths       []float64 // per-column width in mm; must match Headers length
	Align        string    // body cell alignment: "L" / "C" / "R" — defaults to "L"
	HeaderAlign  string    // header alignment, defaults to Align
	HeaderHeight float64   // optional override (default 9)
	BodyHeight   float64   // optional override (default 7)
	HeaderColor  Color     // optional header text color override (default ColorPrimaryStrong)
	HeaderFill   Color     // optional header fill (default ColorSurfaceMuted)
}

// WriteSoftTable renders the table at the current cursor and advances Y
// past it. Returns the final Y position so callers can chain layout.
func WriteSoftTable(pdf *gofpdf.Fpdf, t SoftTable) float64 {
	if len(t.Headers) == 0 || len(t.Widths) == 0 {
		return pdf.GetY()
	}
	if t.HeaderHeight <= 0 {
		t.HeaderHeight = 9
	}
	if t.BodyHeight <= 0 {
		t.BodyHeight = 7
	}
	if strings.TrimSpace(t.Align) == "" {
		t.Align = "L"
	}
	if strings.TrimSpace(t.HeaderAlign) == "" {
		t.HeaderAlign = t.Align
	}
	if IsZero(t.HeaderColor) {
		t.HeaderColor = ColorPrimaryStrong
	}
	if IsZero(t.HeaderFill) {
		t.HeaderFill = ColorSurfaceMuted
	}

	pageW, _ := pdf.GetPageSize()
	left, _, right, _ := pdf.GetMargins()
	usable := pageW - left - right
	totalW := 0.0
	for _, w := range t.Widths {
		totalW += w
	}
	startX := left + (usable-totalW)/2

	prevLine := pdf.GetLineWidth()
	pdf.SetLineWidth(0.3)
	defer pdf.SetLineWidth(prevLine)

	// Top rule
	y := pdf.GetY()
	pdf.SetDrawColor(ColorBorderStrong[0], ColorBorderStrong[1], ColorBorderStrong[2])
	pdf.Line(startX, y, startX+totalW, y)

	// Header row (filled, no per-cell borders)
	pdf.SetFillColor(t.HeaderFill[0], t.HeaderFill[1], t.HeaderFill[2])
	pdf.Rect(startX, y, totalW, t.HeaderHeight, "F")
	pdf.SetTextColor(t.HeaderColor[0], t.HeaderColor[1], t.HeaderColor[2])
	pdf.SetFont(FontFamilyCJK, "B", 9.5)
	pdf.SetXY(startX, y)
	for i, h := range t.Headers {
		if i >= len(t.Widths) {
			break
		}
		pdf.CellFormat(t.Widths[i], t.HeaderHeight, h, "", 0, t.HeaderAlign, false, 0, "")
	}
	pdf.Ln(-1)

	// Header underline (primary color, slightly thicker)
	pdf.SetDrawColor(ColorPrimary[0], ColorPrimary[1], ColorPrimary[2])
	pdf.SetLineWidth(0.5)
	headerBottom := y + t.HeaderHeight
	pdf.Line(startX, headerBottom, startX+totalW, headerBottom)
	pdf.SetLineWidth(0.2)
	pdf.SetDrawColor(ColorBorder[0], ColorBorder[1], ColorBorder[2])

	// Body rows (zebra background, no vertical borders, thin row separators)
	pdf.SetFont(FontFamilyCJK, "", 9.5)
	pdf.SetTextColor(ColorText[0], ColorText[1], ColorText[2])
	for rowIdx, row := range t.Rows {
		rowY := pdf.GetY()
		if rowIdx%2 == 1 {
			pdf.SetFillColor(ColorSurfaceMuted[0], ColorSurfaceMuted[1], ColorSurfaceMuted[2])
			pdf.Rect(startX, rowY, totalW, t.BodyHeight, "F")
		}
		pdf.SetXY(startX, rowY)
		for i := range t.Headers {
			if i >= len(t.Widths) {
				break
			}
			val := ""
			if i < len(row) {
				val = row[i]
			}
			pdf.CellFormat(t.Widths[i], t.BodyHeight, val, "", 0, t.Align, false, 0, "")
		}
		pdf.Ln(-1)
	}

	// Bottom rule
	endY := pdf.GetY()
	pdf.SetDrawColor(ColorBorderStrong[0], ColorBorderStrong[1], ColorBorderStrong[2])
	pdf.Line(startX, endY, startX+totalW, endY)

	pdf.SetTextColor(ColorBlack[0], ColorBlack[1], ColorBlack[2])
	pdf.SetDrawColor(ColorBlack[0], ColorBlack[1], ColorBlack[2])
	pdf.SetY(endY + 2)
	return endY + 2
}

// EmptyState writes a centered "no data" notice on a soft tinted background.
// 旧签名保留以兼容已有调用点；新调用应优先使用 EmptyStateWithHint，可
// 在主提示后附加一行小灰字辅助说明（如"请扩大时间范围"），让空态更
// 像「友好提示」而不是「冷冰冰的占位」。
//
// 高度从 16mm 降到 12mm，让监控 PDF 的三段空态合计节省 ~12mm 垂直
// 空间（截图1 单页 50%+ 空白即由此造成）。
func EmptyState(pdf *gofpdf.Fpdf, message string) {
	EmptyStateWithHint(pdf, message, "")
}

// EmptyStateWithHint 是 EmptyState 的双参数版本：
//   - message：主提示（如"暂无系统性能数据"）
//   - hint：可选副提示，灰色小字，跟随在 message 后用 " · " 分隔
func EmptyStateWithHint(pdf *gofpdf.Fpdf, message, hint string) {
	pageW, _ := pdf.GetPageSize()
	left, _, right, _ := pdf.GetMargins()
	usable := pageW - left - right
	y := pdf.GetY()
	h := 12.0

	// 容器：浅灰底 + 1 像素描边 + 圆角，整体保持「卡片」气质
	pdf.SetFillColor(ColorSurfaceMuted[0], ColorSurfaceMuted[1], ColorSurfaceMuted[2])
	pdf.SetDrawColor(ColorBorder[0], ColorBorder[1], ColorBorder[2])
	pdf.SetLineWidth(0.2)
	pdf.RoundedRect(left, y, usable, h, 2, "0123", "FD")

	// 左侧 4mm 信息图标（圆形 + 中心竖线，纯几何模拟 lucide info）
	iconCX := left + 6
	iconCY := y + h/2
	pdf.SetFillColor(ColorPrimarySoft[0], ColorPrimarySoft[1], ColorPrimarySoft[2])
	pdf.Circle(iconCX, iconCY, 2.2, "F")
	pdf.SetFillColor(ColorPrimary[0], ColorPrimary[1], ColorPrimary[2])
	// 顶部小圆点
	pdf.Circle(iconCX, iconCY-1.0, 0.4, "F")
	// 下方竖线（用窄矩形模拟，宽 0.8mm 高 1.8mm）
	pdf.Rect(iconCX-0.4, iconCY-0.2, 0.8, 1.8, "F")

	// 文本：message + （可选）" · " + hint
	msg := strings.TrimSpace(message)
	hintText := strings.TrimSpace(hint)
	textX := left + 11
	pdf.SetXY(textX, y+h/2-2.5)
	pdf.SetFont(FontFamilyCJK, "B", 9.5)
	pdf.SetTextColor(ColorText[0], ColorText[1], ColorText[2])
	if hintText == "" {
		// 单行：message 居左，宽度铺满
		pdf.CellFormat(usable-12, 5, msg, "", 0, "L", false, 0, "")
	} else {
		// 主提示窄一点，让 hint 紧随其后
		msgW := pdf.GetStringWidth(msg) + 1
		pdf.CellFormat(msgW, 5, msg, "", 0, "L", false, 0, "")
		pdf.SetFont(FontFamilyCJK, "", 8)
		pdf.SetTextColor(ColorTextMuted[0], ColorTextMuted[1], ColorTextMuted[2])
		pdf.CellFormat(usable-12-msgW, 5, " · "+hintText, "", 0, "L", false, 0, "")
	}

	pdf.SetTextColor(ColorBlack[0], ColorBlack[1], ColorBlack[2])
	pdf.SetDrawColor(ColorBlack[0], ColorBlack[1], ColorBlack[2])
	pdf.SetY(y + h + 3)
}

// PageFooter draws a horizontal rule and a centered footer line at the
// bottom of the page. Use it inside a gofpdf SetFooterFunc closure.
//
// 必须使用 FontFamilyCJK 渲染整行：footer 文案含中文 "第 X 页"，而
// FontFamilyLatin（Inter/Arial/DejaVu）的字符表里没有 CJK 码点，会被
// gofpdf 渲染成 .notdef 方框（截图1 监控 PDF 即此现象）。CJK 字体的
// 拉丁字符设计虽不如专门的 sans 那么 crisp，但 8pt 小字号下视觉损耗
// 远低于"中文字符变方框"。
func PageFooter(pdf *gofpdf.Fpdf, brand string, pageNo int) {
	if strings.TrimSpace(brand) == "" {
		brand = "巡检系统 · 报告中心"
	}
	pageW, pageH := pdf.GetPageSize()
	left, _, right, _ := pdf.GetMargins()
	usable := pageW - left - right

	pdf.SetDrawColor(ColorBorder[0], ColorBorder[1], ColorBorder[2])
	pdf.SetLineWidth(0.2)
	pdf.Line(left, pageH-12, left+usable, pageH-12)

	pdf.SetY(-10)
	pdf.SetFont(FontFamilyCJK, "", 8)
	pdf.SetTextColor(ColorTextMuted[0], ColorTextMuted[1], ColorTextMuted[2])
	pdf.CellFormat(0, 5, fmt.Sprintf("%s · 第 %d 页", brand, pageNo), "", 0, "C", false, 0, "")
	pdf.SetTextColor(ColorBlack[0], ColorBlack[1], ColorBlack[2])
}

func normalize(value, fallbackValue string) string {
	v := strings.TrimSpace(value)
	if v == "" {
		return fallbackValue
	}
	return v
}

func fallback(value, fallbackValue string) string {
	v := strings.TrimSpace(value)
	if v == "" || v == "{}" {
		return fallbackValue
	}
	return v
}

// textFontFamily returns FontFamilyCJK when the text contains any codepoint
// beyond Latin-1 (CJK ideographs, fullwidth punctuation, dashes, …). The
// dedicated Latin faces (Inter / Arial / DejaVu) carry no CJK glyphs, so
// mixed strings like "3 秒" must be rendered with the CJK family to avoid
// .notdef boxes.
func textFontFamily(text string) string {
	for _, r := range text {
		if r > 0x00FF {
			return FontFamilyCJK
		}
	}
	return FontFamilyLatin
}

// fitFontSize steps the font size down (0.5pt at a time, floored at minSize)
// until text fits maxWidth with the given family/style. The font stays set
// at the returned size so callers can draw immediately afterwards.
func fitFontSize(pdf *gofpdf.Fpdf, text, family, style string, size, minSize, maxWidth float64) float64 {
	if minSize > size {
		minSize = size
	}
	for ; size > minSize; size -= 0.5 {
		pdf.SetFont(family, style, size)
		if maxWidth <= 0 || pdf.GetStringWidth(text) <= maxWidth {
			return size
		}
	}
	pdf.SetFont(family, style, minSize)
	return minSize
}
