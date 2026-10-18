package pdfkit

import (
	"strings"

	"github.com/phpdave11/gofpdf"
)

// 网格式表格渲染器（原 reports 包的 writePDFTable 整体迁入）：完整边框、
// 斑马纹、行染色/行色条、WrapColumns 自动换行、普通列按宽度截断、跨页手工
// 分页并重绘表头。与 SoftTable 并列成为 pdfkit 的两种表格风格；两套共享
// TruncateToWidth / SplitLines / SanitizeCellText 与颜色、字号令牌。

// GridHeaderStyle 描述表头单元格的配色、字体与对齐。
type GridHeaderStyle struct {
	FillColor [3]int
	TextColor [3]int
	FontStyle string
	FontSize  float64
	Align     string
}

// GridTableStyle 描述整张网格表的样式与布局行为。
type GridTableStyle struct {
	Header             GridHeaderStyle
	BodyAlign          string
	BodyFillColor      [3]int
	AlternateFillColor [3]int
	BodyTextColor      [3]int
	BorderColor        [3]int
	BodyFontSize       float64
	HeaderHeight       float64
	BodyHeight         float64
	HeaderBorder       string
	BodyBorder         string
	TableAlign         string
	// WrapColumns 列出的列索引启用自动换行：单元格按列宽拆行、行高随
	// 行数增长（上限 gridMaxWrapLines），完整展示长文本；未列出的列保持
	// 单行 + 截断省略号。
	WrapColumns []int
	// RowFills 按行索引覆盖该行底色（零值回退斑马纹），RowAccents 在行
	// 左缘绘制一条竖色条。两者用于把「警告 / 失败 / 错误」行从通过行里
	// 视觉分离出来——只靠奇偶灰白，异常行和正常行权重完全一样。
	RowFills   [][3]int
	RowAccents [][3]int

	// PageBreak 在表格需要跨页时调用，调用方可借此注入带页眉偏移的分页
	// 逻辑（如 reports 的 addPDFPage）；nil 时直接 pdf.AddPage()。
	PageBreak func(*gofpdf.Fpdf)
	// BottomMarginMM 是判定「本行放不下」的底部边距（mm）；<=0 时取 15，
	// 与 reports 的 pdfBottomMM 一致。
	BottomMarginMM float64
}

const (
	// GridTableLineMM 网格线宽（mm）。
	GridTableLineMM = 0.14
	// gridMaxWrapLines 限制换行列单格最多展开的行数，防止异常超长的采集
	// 输出把一行撑到整页；到达上限后末行以省略号收尾。
	gridMaxWrapLines = 6
	// gridAccentBarWidth 行强调条宽度（mm）。
	gridAccentBarWidth = 1.5
	// gridDefaultBottomMM 未指定 BottomMarginMM 时的兜底底部边距。
	gridDefaultBottomMM = 15.0
)

// DefaultGridTableStyle 返回带设计令牌默认值的网格表样式。
func DefaultGridTableStyle(header GridHeaderStyle) GridTableStyle {
	return GridTableStyle{
		Header:             header,
		BodyAlign:          "L",
		BodyFillColor:      ColorWhite,
		AlternateFillColor: ColorSurfaceMuted,
		BodyTextColor:      ColorText,
		BorderColor:        ColorBorder,
		BodyFontSize:       FontTableBody,
		HeaderHeight:       8,
		BodyHeight:         7,
		HeaderBorder:       "1",
		BodyBorder:         "1",
		TableAlign:         "C",
	}
}

// GridTable renders the table at the current cursor. Column widths are in mm;
// horizontal placement follows style.TableAlign.
func GridTable(pdf *gofpdf.Fpdf, headers []string, rows [][]string, colWidths []float64, style GridTableStyle) {
	if len(headers) == 0 || len(colWidths) == 0 {
		return
	}
	bottomMM := style.BottomMarginMM
	if bottomMM <= 0 {
		bottomMM = gridDefaultBottomMM
	}
	newPage := style.PageBreak
	if newPage == nil {
		newPage = func(p *gofpdf.Fpdf) { p.AddPage() }
	}

	totalWidth := 0.0
	for _, width := range colWidths {
		totalWidth += width
	}
	startX := gridTableStartX(pdf, totalWidth, style.TableAlign)
	prevLineWidth := pdf.GetLineWidth()
	pdf.SetLineWidth(GridTableLineMM)
	defer pdf.SetLineWidth(prevLineWidth)

	headerBorder := style.HeaderBorder
	if headerBorder == "" {
		headerBorder = "1"
	}
	bodyBorder := style.BodyBorder
	if bodyBorder == "" {
		bodyBorder = "1"
	}

	// renderHeader also runs after every manual page break so multi-page
	// tables repeat their column headers instead of continuing "naked".
	renderHeader := func() {
		pdf.SetDrawColor(style.BorderColor[0], style.BorderColor[1], style.BorderColor[2])
		pdf.SetFont(FontFamilyCJK, style.Header.FontStyle, style.Header.FontSize)
		pdf.SetFillColor(style.Header.FillColor[0], style.Header.FillColor[1], style.Header.FillColor[2])
		pdf.SetTextColor(style.Header.TextColor[0], style.Header.TextColor[1], style.Header.TextColor[2])
		pdf.SetX(startX)
		for i, header := range headers {
			if i >= len(colWidths) {
				break
			}
			pdf.CellFormat(colWidths[i], style.HeaderHeight, TruncateToWidth(pdf, header, colWidths[i]-cellPadMM), headerBorder, 0, style.Header.Align, true, 0, "")
		}
		pdf.Ln(-1)
		pdf.SetFont(FontFamilyCJK, "", style.BodyFontSize)
		pdf.SetTextColor(style.BodyTextColor[0], style.BodyTextColor[1], style.BodyTextColor[2])
	}
	renderHeader()

	wrapSet := make(map[int]bool, len(style.WrapColumns))
	for _, idx := range style.WrapColumns {
		wrapSet[idx] = true
	}

	_, pageH := pdf.GetPageSize()
	breakLimit := pageH - bottomMM
	for rowIndex, row := range rows {
		// 先按列拆行并计算本行动态行高：换行列按列宽拆行（封顶
		// gridMaxWrapLines 行，超出末行加省略号），普通列单行截断。
		cellLines := make([][]string, len(headers))
		maxLines := 1
		for i := range headers {
			if i >= len(colWidths) {
				break
			}
			value := ""
			if i < len(row) {
				value = row[i]
			}
			value = SanitizeCellText(value)
			textWidth := colWidths[i] - cellPadMM
			if wrapSet[i] {
				split := SplitLines(pdf, value, textWidth)
				if len(split) > gridMaxWrapLines {
					last := split[gridMaxWrapLines-1]
					split = split[:gridMaxWrapLines]
					split[gridMaxWrapLines-1] = TruncateToWidth(pdf, last+"…", textWidth)
				}
				cellLines[i] = split
				if len(split) > maxLines {
					maxLines = len(split)
				}
			} else {
				cellLines[i] = []string{TruncateToWidth(pdf, value, textWidth)}
			}
		}
		rowH := float64(maxLines) * style.BodyHeight

		// 手动分页：整行放不下就先换页并重绘表头。否则 gofpdf 的自动分页
		// 会在绘制某个单元格时才触发，导致新页丢表头、居中表格的行首
		// 退回左边距，产生错位。
		if pdf.GetY()+rowH > breakLimit {
			newPage(pdf)
			renderHeader()
		}
		rowY := pdf.GetY()
		fill := style.BodyFillColor
		if rowIndex%2 == 1 && !IsZero(style.AlternateFillColor) {
			fill = style.AlternateFillColor
		}
		if tint, ok := gridRowTint(style.RowFills, rowIndex); ok {
			fill = tint
		}
		pdf.SetFillColor(fill[0], fill[1], fill[2])
		x := startX
		for i := range headers {
			if i >= len(colWidths) {
				break
			}
			// 先画整格底色+边框（空文本），再在格内逐行写字；单行内容在
			// 多行高度的行里垂直居中。
			pdf.SetXY(x, rowY)
			pdf.CellFormat(colWidths[i], rowH, "", bodyBorder, 0, "", true, 0, "")
			offsetY := (rowH - float64(len(cellLines[i]))*style.BodyHeight) / 2
			// 让开行强调条：条最后绘制且压在格上，首列文本不缩进会被裁掉半个字。
			indent := gridBodyCellTextIndent(style.RowAccents, rowIndex, i)
			for li, line := range cellLines[i] {
				pdf.SetXY(x+indent, rowY+offsetY+float64(li)*style.BodyHeight)
				pdf.CellFormat(colWidths[i]-indent, style.BodyHeight, line, "", 0, style.BodyAlign, false, 0, "")
			}
			x += colWidths[i]
		}
		// 色条最后画，压在左侧单元格边框上，形成实心强调条。
		if accent, ok := gridRowTint(style.RowAccents, rowIndex); ok {
			pdf.SetFillColor(accent[0], accent[1], accent[2])
			pdf.Rect(startX, rowY, gridAccentBarWidth, rowH, "F")
		}
		pdf.SetY(rowY + rowH)
	}
	pdf.SetTextColor(ColorBlack[0], ColorBlack[1], ColorBlack[2])
	pdf.SetFont(FontFamilyCJK, "", FontBody)
}

// gridRowTint 取第 index 行的语义色（底色或色条），越界或零值时返回 false。
func gridRowTint(list [][3]int, index int) ([3]int, bool) {
	if index < 0 || index >= len(list) || IsZero(list[index]) {
		return [3]int{}, false
	}
	return list[index], true
}

// gridTableStartX 按对齐方式计算表格起始 X。
func gridTableStartX(pdf *gofpdf.Fpdf, totalWidth float64, align string) float64 {
	pageWidth, _ := pdf.GetPageSize()
	left, _, right, _ := pdf.GetMargins()
	usableWidth := pageWidth - left - right
	if usableWidth <= 0 {
		return left
	}
	switch strings.ToUpper(strings.TrimSpace(align)) {
	case "C", "CENTER":
		return left + (usableWidth-totalWidth)/2
	case "R", "RIGHT":
		return left + usableWidth - totalWidth
	default:
		return left
	}
}

// gridBodyCellTextIndent 为带行色条的首列单元格让出条的宽度，避免文字被色条压掉。
func gridBodyCellTextIndent(accents [][3]int, rowIndex, colIndex int) float64 {
	if colIndex != 0 {
		return 0
	}
	if _, ok := gridRowTint(accents, rowIndex); !ok {
		return 0
	}
	return gridAccentBarWidth
}
