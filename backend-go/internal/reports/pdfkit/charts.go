package pdfkit

import (
	"bytes"
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"io"
	"sort"
	"strings"
	"sync"

	"github.com/golang/freetype/truetype"
	"github.com/phpdave11/gofpdf"
	chart "github.com/wcharczuk/go-chart/v2"
	"github.com/wcharczuk/go-chart/v2/drawing"
)

// chartFontOnce/chartCJKFont cache the parsed CJK truetype font for chart
// rendering. go-chart's built-in default font (Roboto) has no CJK glyphs, so
// without this injection every Chinese chart title / slice label / legend
// entry renders as .notdef boxes.
var (
	chartFontOnce sync.Once
	chartCJKFont  *truetype.Font
)

// chartFont returns the parsed CJK font, or nil when no CJK font could be
// loaded — go-chart treats a nil Style.Font as "use default", so degraded
// environments keep producing charts (ASCII text intact, CJK boxed) instead
// of failing the whole report.
func chartFont() *truetype.Font {
	chartFontOnce.Do(func() {
		raw, err := CJKFontBytes()
		if err != nil {
			return
		}
		parsed, err := truetype.Parse(raw)
		if err != nil {
			return
		}
		chartCJKFont = parsed
	})
	return chartCJKFont
}

// Default render dimensions for chart PNGs. Chosen so that, when scaled
// down to ~70-90mm wide in the PDF, the resulting raster still looks crisp
// at 200% browser zoom (the upper end of typical PDF viewing).
const (
	defaultChartWidthPx  = 720
	defaultChartHeightPx = 420
)

// DonutSlice is one ring segment of a donut chart.
type DonutSlice struct {
	Label string
	Value float64
	Color Color
}

// DonutSpec describes a donut chart. ColorFallback is used for slices that
// have a zero color.
type DonutSpec struct {
	Title         string
	Slices        []DonutSlice
	ColorFallback Color
	WidthPx       int
	HeightPx      int
}

// RenderDonutChart renders the spec to a PNG byte slice, hitting the LRU
// cache so repeated calls with identical specs avoid the (~5-15ms) chart
// generation cost.
func RenderDonutChart(spec DonutSpec) ([]byte, error) {
	key := hashSpec("donut", spec)
	if cached, ok := cacheGet(key); ok {
		return cached, nil
	}

	w, h := spec.WidthPx, spec.HeightPx
	if w == 0 {
		w = defaultChartWidthPx
	}
	if h == 0 {
		h = defaultChartHeightPx
	}

	values := make([]chart.Value, 0, len(spec.Slices))
	for _, s := range spec.Slices {
		if s.Value <= 0 {
			continue
		}
		c := s.Color
		if IsZero(c) {
			c = spec.ColorFallback
		}
		if IsZero(c) {
			c = ColorPrimary
		}
		values = append(values, chart.Value{
			Label: s.Label,
			Value: s.Value,
			Style: chart.Style{
				FillColor:   toDrawing(c),
				StrokeColor: drawing.ColorWhite,
				StrokeWidth: 2,
				FontColor:   toDrawing(ColorText),
				FontSize:    12,
				Font:        chartFont(),
			},
		})
	}

	if len(values) == 0 {
		return nil, fmt.Errorf("donut chart: no positive-value slices")
	}

	donut := chart.DonutChart{
		Title:  spec.Title,
		Width:  w,
		Height: h,
		Font:   chartFont(),
		Background: chart.Style{
			Padding: chart.Box{Top: 12, Bottom: 12, Left: 12, Right: 12},
		},
		Values: values,
	}

	buf := bytes.NewBuffer(nil)
	if err := donut.Render(chart.PNG, buf); err != nil {
		return nil, fmt.Errorf("donut chart render: %w", err)
	}
	out := buf.Bytes()
	cachePut(key, out)
	return out, nil
}

// BarSpec describes a horizontal bar chart of categorical values.
type BarSpec struct {
	Title    string
	Bars     []DonutSlice // reuse DonutSlice — same {Label, Value, Color} shape
	BarColor Color        // applied when individual bar color is zero
	WidthPx  int
	HeightPx int
}

// RenderBarChart renders categorical bars. Suitable for "device type
// distribution" or "alerts by severity" — at most ~12 bars stay legible.
func RenderBarChart(spec BarSpec) ([]byte, error) {
	key := hashSpec("bar", spec)
	if cached, ok := cacheGet(key); ok {
		return cached, nil
	}

	w, h := spec.WidthPx, spec.HeightPx
	if w == 0 {
		w = defaultChartWidthPx
	}
	if h == 0 {
		h = defaultChartHeightPx
	}

	bars := make([]chart.Value, 0, len(spec.Bars))
	for _, b := range spec.Bars {
		if strings.TrimSpace(b.Label) == "" {
			continue
		}
		c := b.Color
		if IsZero(c) {
			c = spec.BarColor
		}
		if IsZero(c) {
			c = ColorPrimary
		}
		bars = append(bars, chart.Value{
			Label: b.Label,
			Value: b.Value,
			Style: chart.Style{
				FillColor:   toDrawing(c),
				StrokeColor: toDrawing(c),
				FontColor:   toDrawing(ColorText),
				FontSize:    11,
				Font:        chartFont(),
			},
		})
	}
	if len(bars) == 0 {
		return nil, fmt.Errorf("bar chart: no labeled bars")
	}

	bar := chart.BarChart{
		Title:  spec.Title,
		Width:  w,
		Height: h,
		Font:   chartFont(),
		Background: chart.Style{
			Padding: chart.Box{Top: 16, Bottom: 24, Left: 16, Right: 16},
		},
		XAxis: chart.Style{
			FontColor: toDrawing(ColorTextMuted),
			FontSize:  10,
			Font:      chartFont(),
		},
		YAxis: chart.YAxis{
			Style: chart.Style{
				FontColor: toDrawing(ColorTextMuted),
				FontSize:  10,
				Font:      chartFont(),
			},
		},
		Bars: bars,
	}

	buf := bytes.NewBuffer(nil)
	if err := bar.Render(chart.PNG, buf); err != nil {
		return nil, fmt.Errorf("bar chart render: %w", err)
	}
	out := buf.Bytes()
	cachePut(key, out)
	return out, nil
}

// LineSeries is one named line in a multi-series line chart.
type LineSeries struct {
	Name   string
	Color  Color
	Values []float64
	// DashArray 非空时按 SVG 语义绘制虚线（如 {6, 4}），用于同色系列区分指标
	DashArray []float64
}

// LineSpec describes a multi-series time-series line chart. XLabels gives
// the x-axis tick labels (typically timestamps); when empty, ticks are
// the integer indices 1..N.
type LineSpec struct {
	Title    string
	Series   []LineSeries
	XLabels  []string
	WidthPx  int
	HeightPx int
	// NoFill 关闭线下半透明面积填充；系列较多时填充互相遮盖反而降低可读性
	NoFill bool
}

// RenderLineChart renders the spec to PNG bytes. Suitable for performance
// trends (CPU/Mem over time, network throughput).
func RenderLineChart(spec LineSpec) ([]byte, error) {
	key := hashSpec("line", spec)
	if cached, ok := cacheGet(key); ok {
		return cached, nil
	}

	w, h := spec.WidthPx, spec.HeightPx
	if w == 0 {
		w = defaultChartWidthPx
	}
	if h == 0 {
		h = defaultChartHeightPx
	}

	if len(spec.Series) == 0 {
		return nil, fmt.Errorf("line chart: no series")
	}
	maxLen := 0
	for _, s := range spec.Series {
		if len(s.Values) > maxLen {
			maxLen = len(s.Values)
		}
	}
	if maxLen < 2 {
		return nil, fmt.Errorf("line chart: each series needs at least 2 values")
	}

	xValues := make([]float64, maxLen)
	for i := range xValues {
		xValues[i] = float64(i)
	}

	chartSeries := make([]chart.Series, 0, len(spec.Series))
	palette := []Color{ColorPrimary, ColorSuccess, ColorAmber500, ColorRose500, ColorIndigo300}
	for i, s := range spec.Series {
		c := s.Color
		if IsZero(c) {
			c = palette[i%len(palette)]
		}
		// Pad shorter series with their last value so chart axes align.
		ys := append([]float64(nil), s.Values...)
		for len(ys) < maxLen {
			if len(ys) == 0 {
				ys = append(ys, 0)
			} else {
				ys = append(ys, ys[len(ys)-1])
			}
		}
		style := chart.Style{
			StrokeColor:     toDrawing(c),
			StrokeWidth:     2.2,
			StrokeDashArray: s.DashArray,
			FontColor:       toDrawing(ColorText),
			FontSize:        11,
			Font:            chartFont(),
		}
		if !spec.NoFill {
			style.FillColor = toDrawingAlpha(c, 24)
		}
		chartSeries = append(chartSeries, chart.ContinuousSeries{
			Name:    s.Name,
			XValues: xValues,
			YValues: ys,
			Style:   style,
		})
	}

	xAxis := chart.XAxis{
		Style: chart.Style{
			FontColor: toDrawing(ColorTextMuted),
			FontSize:  9,
			Font:      chartFont(),
		},
	}
	if len(spec.XLabels) > 0 {
		ticks := make([]chart.Tick, 0, len(spec.XLabels))
		for i, label := range spec.XLabels {
			if i >= maxLen {
				break
			}
			// Show at most ~8 labels to avoid overlap on dense series.
			step := maxLen / 8
			if step <= 0 {
				step = 1
			}
			if i%step != 0 {
				continue
			}
			ticks = append(ticks, chart.Tick{Value: float64(i), Label: label})
		}
		xAxis.Ticks = ticks
	}

	legendStyle := chart.Style{
		FontColor: toDrawing(ColorText),
		FontSize:  10,
		Font:      chartFont(),
	}
	// 顶部内边距要容纳标题与换行图例：go-chart 把标题固定画在图片顶部，
	// 若绘图区紧贴其下，标题与图例会压在曲线上。
	topPadding := 24
	legendTop := 0
	if len(chartSeries) > 1 {
		probe, err := chart.PNG(w, h)
		if err != nil {
			return nil, fmt.Errorf("line chart legend probe: %w", err)
		}
		if spec.Title != "" {
			probe.SetFont(chartFont())
			probe.SetFontSize(chart.DefaultTitleFontSize)
			legendTop = chart.DefaultTitleTop + probe.MeasureText(spec.Title).Height() + legendRowGap
		} else {
			legendTop = legendRowGap
		}
		rows, rowHeight := measureLegendRows(probe, legendStyle, chartSeries, w-2*legendSidePadding)
		topPadding = legendTop + len(rows)*(rowHeight+legendRowGap) + legendRowGap
	}

	line := chart.Chart{
		Title:  spec.Title,
		Width:  w,
		Height: h,
		Font:   chartFont(),
		Background: chart.Style{
			Padding: chart.Box{Top: topPadding, Bottom: 30, Left: 24, Right: 24},
		},
		XAxis: xAxis,
		YAxis: chart.YAxis{
			Style: chart.Style{
				FontColor: toDrawing(ColorTextMuted),
				FontSize:  10,
				Font:      chartFont(),
			},
		},
		Series: chartSeries,
	}
	if len(chartSeries) > 1 {
		line.Elements = []chart.Renderable{legendWrapped(&line, legendTop, legendStyle)}
	}

	buf := bytes.NewBuffer(nil)
	if err := line.Render(chart.PNG, buf); err != nil {
		return nil, fmt.Errorf("line chart render: %w", err)
	}
	out := buf.Bytes()
	cachePut(key, out)
	return out, nil
}

// =========================================================================
// 换行图例：go-chart 自带的 LegendThin 单行不换行，系列多（如 5 台设备 × CPU/内存）
// 时会溢出右边界；Legend/LegendLeft 是画在绘图区内部的竖排框，会遮住数据。
// 这里把图例按宽度贪心换行，画在标题与绘图区之间预留的顶部内边距里。
// =========================================================================

const (
	legendSwatchLength = 24 // 色样线段长度（px）
	legendSwatchGap    = 6  // 色样与文字间距（px）
	legendItemGap      = 16 // 图例项之间的间距（px）
	legendRowGap       = 6  // 图例行间距（px）
	legendSidePadding  = 24 // 与图片左右边缘的距离（px），与绘图区左右内边距一致
)

// wrapLegendRows 按宽度贪心换行，返回每行包含的图例项下标；单项超宽独占一行，不丢弃。
func wrapLegendRows(itemWidths []int, maxWidth int, itemGap int) [][]int {
	rows := make([][]int, 0)
	current := make([]int, 0)
	used := 0
	for i, width := range itemWidths {
		if len(current) > 0 && used+itemGap+width > maxWidth {
			rows = append(rows, current)
			current = make([]int, 0)
			used = 0
		}
		if len(current) > 0 {
			used += itemGap
		}
		current = append(current, i)
		used += width
	}
	if len(current) > 0 {
		rows = append(rows, current)
	}
	return rows
}

// measureLegendRows 用真实字体量出每个图例项宽度并换行，返回行分组与单行文字高度。
func measureLegendRows(r chart.Renderer, style chart.Style, series []chart.Series, maxWidth int) ([][]int, int) {
	r.SetFont(style.GetFont())
	r.SetFontSize(style.GetFontSize())
	widths := make([]int, len(series))
	rowHeight := 0
	for i, s := range series {
		box := r.MeasureText(s.GetName())
		widths[i] = legendSwatchLength + legendSwatchGap + box.Width()
		if box.Height() > rowHeight {
			rowHeight = box.Height()
		}
	}
	return wrapLegendRows(widths, maxWidth, legendItemGap), rowHeight
}

// legendWrapped 返回自动换行的细图例：色样沿用系列的颜色与线型（虚线可辨），
// 从图片顶部 top 像素处逐行向下绘制，横向范围与绘图区对齐。
func legendWrapped(c *chart.Chart, top int, style chart.Style) chart.Renderable {
	return func(r chart.Renderer, cb chart.Box, _ chart.Style) {
		rows, rowHeight := measureLegendRows(r, style, c.Series, cb.Right-cb.Left)
		y := top
		for _, row := range rows {
			x := cb.Left
			baseline := y + rowHeight
			for _, idx := range row {
				s := c.Series[idx]
				lineStyle := s.GetStyle()
				r.SetStrokeColor(lineStyle.GetStrokeColor())
				r.SetStrokeWidth(lineStyle.GetStrokeWidth())
				r.SetStrokeDashArray(lineStyle.GetStrokeDashArray())
				swatchY := baseline - rowHeight/2
				r.MoveTo(x, swatchY)
				r.LineTo(x+legendSwatchLength, swatchY)
				r.Stroke()

				x += legendSwatchLength + legendSwatchGap
				r.SetFont(style.GetFont())
				r.SetFontSize(style.GetFontSize())
				r.SetFontColor(style.GetFontColor())
				r.Text(s.GetName(), x, baseline)
				x += r.MeasureText(s.GetName()).Width() + legendItemGap
			}
			y += rowHeight + legendRowGap
		}
	}
}

// EmbedChart registers and draws a PNG chart inside the PDF. The image is
// keyed by sha1(png) so repeated embedding of the same image reuses the
// already-registered resource. RegisterImageOptionsReader is internally
// idempotent (gofpdf v1.4.3 fpdf.go:3168-3171) so we don't need a separate
// "already registered?" check.
func EmbedChart(pdf *gofpdf.Fpdf, png []byte, x, y, w, h float64) error {
	if len(png) == 0 {
		return fmt.Errorf("embed chart: empty png")
	}
	sum := sha1.Sum(png)
	name := "chart-" + hex.EncodeToString(sum[:6])

	opts := gofpdf.ImageOptions{ImageType: "PNG", ReadDpi: false}
	pdf.RegisterImageOptionsReader(name, opts, bytes.NewReader(png))
	pdf.ImageOptions(name, x, y, w, h, false, opts, 0, "")
	return nil
}

// toDrawing converts a pdfkit Color to a drawing.Color (alpha = 255).
func toDrawing(c Color) drawing.Color {
	return drawing.Color{R: uint8(c[0]), G: uint8(c[1]), B: uint8(c[2]), A: 255}
}

// toDrawingAlpha returns the same RGB with a custom alpha (0-255). Useful
// for the soft fill below a line series.
func toDrawingAlpha(c Color, alpha uint8) drawing.Color {
	return drawing.Color{R: uint8(c[0]), G: uint8(c[1]), B: uint8(c[2]), A: alpha}
}

// =========================================================================
// PNG cache (bounded, no eviction policy beyond simple FIFO purge at cap).
// Charts are pure functions of their spec; once rendered, the same input
// produces the same bytes. Keeping ~64 of them in memory caps peak usage at
// roughly 4-6 MB for typical 720x420 PNGs.
// =========================================================================

const cacheMaxEntries = 64

var (
	cacheMu    sync.Mutex
	cacheStore = make(map[string][]byte, cacheMaxEntries)
	cacheOrder = make([]string, 0, cacheMaxEntries)
)

func cacheGet(key string) ([]byte, bool) {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	v, ok := cacheStore[key]
	return v, ok
}

func cachePut(key string, value []byte) {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	if _, ok := cacheStore[key]; ok {
		return
	}
	if len(cacheStore) >= cacheMaxEntries {
		// Drop the oldest 8 entries in one pass to avoid thrashing under load.
		drop := 8
		if drop > len(cacheOrder) {
			drop = len(cacheOrder)
		}
		for _, k := range cacheOrder[:drop] {
			delete(cacheStore, k)
		}
		cacheOrder = cacheOrder[drop:]
	}
	cacheStore[key] = value
	cacheOrder = append(cacheOrder, key)
}

// hashSpec returns a stable cache key for a chart spec. We rely on fmt's
// canonical %v rendering plus a kind prefix; different chart types with the
// same field layout never collide because they don't share the prefix.
func hashSpec(kind string, spec interface{}) string {
	h := sha1.New()
	io.WriteString(h, kind+"|")
	switch v := spec.(type) {
	case DonutSpec:
		fmt.Fprintf(h, "%s|%d|%d|%v|", v.Title, v.WidthPx, v.HeightPx, v.ColorFallback)
		// Stable order — slices already in user-defined order, no need to sort.
		for _, s := range v.Slices {
			fmt.Fprintf(h, "%s=%g/%v;", s.Label, s.Value, s.Color)
		}
	case BarSpec:
		fmt.Fprintf(h, "%s|%d|%d|%v|", v.Title, v.WidthPx, v.HeightPx, v.BarColor)
		for _, b := range v.Bars {
			fmt.Fprintf(h, "%s=%g/%v;", b.Label, b.Value, b.Color)
		}
	case LineSpec:
		fmt.Fprintf(h, "%s|%d|%d|nofill=%t|", v.Title, v.WidthPx, v.HeightPx, v.NoFill)
		labels := append([]string(nil), v.XLabels...)
		sort.Strings(labels)
		fmt.Fprintf(h, "labels=%v|", labels)
		for _, s := range v.Series {
			fmt.Fprintf(h, "%s/%v/dash=%v=%v;", s.Name, s.Color, s.DashArray, s.Values)
		}
	default:
		fmt.Fprintf(h, "%v", v)
	}
	return hex.EncodeToString(h.Sum(nil))
}
