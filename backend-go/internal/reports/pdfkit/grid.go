package pdfkit

import (
	"strings"

	"github.com/phpdave11/gofpdf"
)

// 网格式表格渲染器（原 reports 包的 writePDFTable 整体迁入）：完整边框、
// 斑马纹、行染色/行色条、WrapColumns 自动换行、普通列按宽度截断、跨页手工
// 分页（支持超长行分段续画）并重绘表头。与 SoftTable 并列成为 pdfkit 的
// 两种表格风格；两套共享 TruncateToWidth / SplitLines / SanitizeCellText
// 与颜色、字号令牌。

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
	// 行数增长，完整展示长文本；单行高度超过单页剩余空间时支持跨页
	// 分段续画。未列出的列保持单行 + 截断省略号。
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
	// gridAccentBarWidth 行强调条宽度（mm）。
	gridAccentBarWidth = 1.5
	// gridDefaultBottomMM 未指定 BottomMarginMM 时的兜底底部边距。
	gridDefaultBottomMM = 15.0
	// gridDefaultBodyHeightMM 未指定 BodyHeight 时的兜底行高（mm）。
	gridDefaultBodyHeightMM = 7.0
	// gridPageBreakEpsilonMM 分页判定容差（mm），避免浮点临界相等触发 gofpdf 自动换页。
	gridPageBreakEpsilonMM = 0.1
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

type gridRowContext struct {
	pdf        *gofpdf.Fpdf
	style      GridTableStyle
	colWidths  []float64
	startX     float64
	bodyBorder string
	bodyHeight float64
}

type gridRowChunk struct {
	startLine      int
	count          int
	centerVertical bool
}

// GridTable renders the table at the current cursor. Column widths are in mm;
// horizontal placement follows style.TableAlign.
func GridTable(pdf *gofpdf.Fpdf, headers []string, rows [][]string, colWidths []float64, style GridTableStyle) {
	if len(headers) == 0 || len(colWidths) == 0 {
		return
	}
	colCount := min(len(headers), len(colWidths))
	colWidths = colWidths[:colCount]
	totalWidth := 0.0
	for _, width := range colWidths {
		totalWidth += width
	}
	ctx := newGridRowContext(pdf, style, colWidths, totalWidth)
	prevLineWidth := pdf.GetLineWidth()
	pdf.SetLineWidth(GridTableLineMM)
	defer pdf.SetLineWidth(prevLineWidth)

	renderHeader := func() { ctx.drawHeader(headers) }
	renderHeader()

	wrapSet := make(map[int]bool, len(style.WrapColumns))
	for _, idx := range style.WrapColumns {
		wrapSet[idx] = true
	}
	newPage := style.PageBreak
	if newPage == nil {
		newPage = func(p *gofpdf.Fpdf) { p.AddPage() }
	}
	ctx.drawRows(rows, wrapSet, renderHeader, newPage)
	pdf.SetTextColor(ColorBlack[0], ColorBlack[1], ColorBlack[2])
	pdf.SetFont(FontFamilyCJK, "", FontBody)
}

func newGridRowContext(pdf *gofpdf.Fpdf, style GridTableStyle, colWidths []float64, totalWidth float64) gridRowContext {
	bodyBorder := style.BodyBorder
	if bodyBorder == "" {
		bodyBorder = "1"
	}
	bodyHeight := style.BodyHeight
	if bodyHeight <= 0 {
		bodyHeight = gridDefaultBodyHeightMM
	}
	return gridRowContext{
		pdf:        pdf,
		style:      style,
		colWidths:  colWidths,
		startX:     gridTableStartX(pdf, totalWidth, style.TableAlign),
		bodyBorder: bodyBorder,
		bodyHeight: bodyHeight,
	}
}

func (c gridRowContext) drawHeader(headers []string) {
	headerBorder := c.style.HeaderBorder
	if headerBorder == "" {
		headerBorder = "1"
	}
	// PageFooter 在分页回调中会把线宽改成 0.2mm，重绘表头前恢复表格线宽。
	c.pdf.SetLineWidth(GridTableLineMM)
	c.pdf.SetDrawColor(c.style.BorderColor[0], c.style.BorderColor[1], c.style.BorderColor[2])
	c.pdf.SetFont(FontFamilyCJK, c.style.Header.FontStyle, c.style.Header.FontSize)
	c.pdf.SetFillColor(c.style.Header.FillColor[0], c.style.Header.FillColor[1], c.style.Header.FillColor[2])
	c.pdf.SetTextColor(c.style.Header.TextColor[0], c.style.Header.TextColor[1], c.style.Header.TextColor[2])
	c.pdf.SetX(c.startX)
	for i, width := range c.colWidths {
		c.pdf.CellFormat(width, c.style.HeaderHeight, TruncateToWidth(c.pdf, headers[i], width-cellPadMM), headerBorder, 0, c.style.Header.Align, true, 0, "")
	}
	c.pdf.Ln(-1)
	c.pdf.SetFont(FontFamilyCJK, "", c.style.BodyFontSize)
	c.pdf.SetTextColor(c.style.BodyTextColor[0], c.style.BodyTextColor[1], c.style.BodyTextColor[2])
}

func (c gridRowContext) drawRows(rows [][]string, wrapSet map[int]bool, renderHeader func(), newPage func(*gofpdf.Fpdf)) {
	bottomMM := c.style.BottomMarginMM
	if bottomMM <= 0 {
		bottomMM = gridDefaultBottomMM
	}
	_, pageH := c.pdf.GetPageSize()
	_, topMargin, _, _ := c.pdf.GetMargins()
	breakLimit := pageH - bottomMM
	approxFreshBodyH := breakLimit - topMargin - c.style.HeaderHeight - gridPageBreakEpsilonMM
	atFreshPageTop := false

	for rowIndex, row := range rows {
		cellLines, maxLines := c.prepareRowLines(row, rowIndex, wrapSet)
		rowH := float64(maxLines) * c.bodyHeight
		if c.pdf.GetY()+rowH <= breakLimit-gridPageBreakEpsilonMM {
			c.drawChunk(cellLines, rowIndex, gridRowChunk{startLine: 0, count: maxLines, centerVertical: true})
			atFreshPageTop = false
			continue
		}
		if !atFreshPageTop && rowH <= approxFreshBodyH {
			newPage(c.pdf)
			renderHeader()
			atFreshPageTop = true
			if c.pdf.GetY()+rowH <= breakLimit-gridPageBreakEpsilonMM {
				c.drawChunk(cellLines, rowIndex, gridRowChunk{startLine: 0, count: maxLines, centerVertical: true})
				atFreshPageTop = false
				continue
			}
		}
		atFreshPageTop = c.drawSplitRow(cellLines, rowIndex, maxLines, breakLimit, renderHeader, newPage)
	}
}

func (c gridRowContext) drawSplitRow(cellLines [][]string, rowIndex, maxLines int, breakLimit float64, renderHeader func(), newPage func(*gofpdf.Fpdf)) bool {
	for lineOffset := 0; lineOffset < maxLines; {
		availLines := int((breakLimit - c.pdf.GetY() - gridPageBreakEpsilonMM) / c.bodyHeight)
		if availLines <= 0 {
			newPage(c.pdf)
			renderHeader()
			availLines = max(1, int((breakLimit-c.pdf.GetY()-gridPageBreakEpsilonMM)/c.bodyHeight))
		}
		chunkCount := min(maxLines-lineOffset, availLines)
		c.drawChunk(cellLines, rowIndex, gridRowChunk{startLine: lineOffset, count: chunkCount, centerVertical: false})
		lineOffset += chunkCount
	}
	return false
}

func (c gridRowContext) prepareRowLines(row []string, rowIndex int, wrapSet map[int]bool) ([][]string, int) {
	cellLines := make([][]string, len(c.colWidths))
	maxLines := 1
	for i, colW := range c.colWidths {
		value := ""
		if i < len(row) {
			value = row[i]
		}
		value = SanitizeCellText(value)
		indent := gridBodyCellTextIndent(c.style.RowAccents, rowIndex, i)
		textWidth := max(0.0, colW-indent-cellPadMM)
		if wrapSet[i] {
			split := SplitLines(c.pdf, value, textWidth)
			cellLines[i] = split
			if len(split) > maxLines {
				maxLines = len(split)
			}
			continue
		}
		cellLines[i] = []string{TruncateToWidth(c.pdf, value, textWidth)}
	}
	return cellLines, maxLines
}

func (c gridRowContext) drawChunk(cellLines [][]string, rowIndex int, chunk gridRowChunk) {
	rowY := c.pdf.GetY()
	chunkH := float64(chunk.count) * c.bodyHeight
	fill := gridRowFillColor(c.style, rowIndex)
	c.pdf.SetFillColor(fill[0], fill[1], fill[2])
	x := c.startX
	for i, colW := range c.colWidths {
		c.pdf.SetXY(x, rowY)
		c.pdf.CellFormat(colW, chunkH, "", c.bodyBorder, 0, "", true, 0, "")
		lines := sliceCellLines(cellLines[i], chunk.startLine, chunk.count)
		offsetY := 0.0
		if chunk.centerVertical {
			offsetY = (chunkH - float64(len(lines))*c.bodyHeight) / 2
		}
		indent := gridBodyCellTextIndent(c.style.RowAccents, rowIndex, i)
		for li, line := range lines {
			c.pdf.SetXY(x+indent, rowY+offsetY+float64(li)*c.bodyHeight)
			c.pdf.CellFormat(colW-indent, c.bodyHeight, line, "", 0, c.style.BodyAlign, false, 0, "")
		}
		x += colW
	}
	// 色条最后画，压在左侧单元格边框上，形成实心强调条。
	if accent, ok := gridRowTint(c.style.RowAccents, rowIndex); ok {
		c.pdf.SetFillColor(accent[0], accent[1], accent[2])
		c.pdf.Rect(c.startX, rowY, gridAccentBarWidth, chunkH, "F")
	}
	c.pdf.SetY(rowY + chunkH)
}

func sliceCellLines(lines []string, start, count int) []string {
	if start >= len(lines) || count <= 0 {
		return nil
	}
	end := min(len(lines), start+count)
	return lines[start:end]
}

func gridRowFillColor(style GridTableStyle, rowIndex int) [3]int {
	fill := style.BodyFillColor
	if rowIndex%2 == 1 && !IsZero(style.AlternateFillColor) {
		fill = style.AlternateFillColor
	}
	if tint, ok := gridRowTint(style.RowFills, rowIndex); ok {
		fill = tint
	}
	return fill
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
