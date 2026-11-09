import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Group } from '@visx/group'
import { LinePath } from '@visx/shape'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridColumns, GridRows } from '@visx/grid'
import { scaleLinear, scaleTime } from '@visx/scale'
import { curveMonotoneX } from '@visx/curve'
import { localPoint } from '@visx/event'
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip'
import { resolveChartGridStyle, useDocumentDarkClass } from '@/lib/chart-theme'
import { resolveTimeAxisLabelFormatter } from '../../utils/monitoring'
import {
  buildTimeAxisTicks,
  nearestPointIndex,
  splitAtGaps,
  TIME_SERIES_GAP_THRESHOLD_MS,
} from '../../utils/timeSeries'

export interface TimeSeriesPoint {
  date: Date
  value: number
}

/** 一条序列：只含真实采到的点（按时间升序），缺失时刻不补值，由缺口规则断线 */
export interface TimeSeriesLine {
  key: string
  name: string
  color: string
  strokeDasharray?: string
  points: TimeSeriesPoint[]
}

interface TimeSeriesLineChartProps {
  lines: TimeSeriesLine[]
  /** 横轴范围（通常为所选时间窗口，见 resolveTimeWindow） */
  domain: readonly [Date, Date]
  /** 时间范围（用于 x 轴刻度步长与标签格式） */
  timeRange?: string
  height?: number
  formatValue: (value: number) => string
  /** 提示框里的数值格式（如超阈值加标记）；缺省同 formatValue，不影响纵轴刻度 */
  formatTooltipValue?: (value: number) => string
  ariaLabel: string
}

interface HoverState {
  date: Date
  values: Array<{ line: TimeSeriesLine; value: number }>
}

/** 与接口流量图相同的边距：同页上下两张图的时间轴起止位置对齐 */
const MARGIN = { top: 16, right: 24, bottom: 36, left: 72 }

/**
 * 多序列时间轴折线图：横轴为真实时间，相邻两点超过两个采样周期即断线，孤立点画成圆点。
 * 悬停时十字线吸附到最近采样时刻；若最近时刻离光标超过缺口阈值（光标落在缺口里）则不提示。
 */
export function TimeSeriesLineChart({
  lines,
  domain,
  timeRange,
  height = 300,
  formatValue,
  formatTooltipValue = formatValue,
  ariaLabel,
}: TimeSeriesLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)

  // 容器宽度：优先用 ResizeObserver（侧边栏折叠等不触发 window resize 的布局变化也能跟随）
  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateWidth = () => setWidth(element.clientWidth)
    updateWidth()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateWidth)
      observer.observe(element)
      return () => observer.disconnect()
    }
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  const isDark = useDocumentDarkClass()
  const gridStyle = resolveChartGridStyle('prominent', isDark)
  const axisColor = isDark ? '#9CA3AF' : '#6b7280'
  const surfaceColor = isDark ? '#111827' : '#ffffff'
  const tooltipBg = isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)'
  const tooltipBorder = isDark ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 0.5)'

  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 100)
  const innerHeight = Math.max(height - MARGIN.top - MARGIN.bottom, 60)

  const formatTimeLabel = useMemo(() => resolveTimeAxisLabelFormatter(timeRange), [timeRange])

  const xScale = useMemo(
    () => scaleTime({ domain: [domain[0], domain[1]], range: [0, innerWidth] }),
    [domain, innerWidth]
  )

  const yScale = useMemo(() => {
    const maxValue = Math.max(0, ...lines.flatMap((line) => line.points.map((point) => point.value)))
    return scaleLinear({
      domain: [0, maxValue > 0 ? maxValue * 1.1 : 1],
      range: [innerHeight, 0],
      nice: true,
    })
  }, [lines, innerHeight])

  const xTickValues = useMemo(() => buildTimeAxisTicks(domain, timeRange, innerWidth), [domain, timeRange, innerWidth])

  const segmentsByLine = useMemo(
    () => lines.map((line) => ({ line, segments: splitAtGaps(line.points) })),
    [lines]
  )

  // 悬停锚点：所有序列采样时刻的并集（升序），以及每条序列按时刻索引的值
  const { anchors, valueIndex } = useMemo(() => {
    const times = new Set<number>()
    const index = new Map<string, Map<number, number>>()
    for (const line of lines) {
      const byTime = new Map<number, number>()
      for (const point of line.points) {
        const time = point.date.getTime()
        times.add(time)
        byTime.set(time, point.value)
      }
      index.set(line.key, byTime)
    }
    const sorted = Array.from(times)
      .sort((a, b) => a - b)
      .map((time) => ({ date: new Date(time) }))
    return { anchors: sorted, valueIndex: index }
  }, [lines])

  const { showTooltip, hideTooltip, tooltipData, tooltipLeft = 0, tooltipTop = 0 } = useTooltip<HoverState>()

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGRectElement>) => {
      const point = localPoint(event)
      if (!point || anchors.length === 0) return
      const target = xScale.invert(point.x - MARGIN.left)
      const anchor = anchors[nearestPointIndex(anchors, target)]
      if (Math.abs(anchor.date.getTime() - target.getTime()) > TIME_SERIES_GAP_THRESHOLD_MS) {
        hideTooltip()
        return
      }
      const time = anchor.date.getTime()
      const values = lines.flatMap((line) => {
        const value = valueIndex.get(line.key)?.get(time)
        return value === undefined ? [] : [{ line, value }]
      })
      showTooltip({
        tooltipData: { date: anchor.date, values },
        tooltipLeft: xScale(anchor.date) + MARGIN.left,
        tooltipTop: point.y,
      })
    },
    [anchors, lines, valueIndex, xScale, showTooltip, hideTooltip]
  )

  const hoverX = tooltipData ? xScale(tooltipData.date) : null

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height }}>
      <svg width={width} height={height} style={{ display: 'block' }} aria-label={ariaLabel}>
        <Group left={MARGIN.left} top={MARGIN.top}>
          <GridRows
            scale={yScale}
            width={innerWidth}
            stroke={gridStyle.stroke}
            strokeDasharray={gridStyle.dasharray}
            numTicks={5}
          />
          <GridColumns
            scale={xScale}
            height={innerHeight}
            stroke={gridStyle.stroke}
            strokeDasharray={gridStyle.dasharray}
            tickValues={xTickValues}
          />

          {segmentsByLine.flatMap(({ line, segments }) =>
            segments.map((segment, index) =>
              segment.length > 1 ? (
                <LinePath
                  key={`line-${line.key}-${index}`}
                  data-series={line.key}
                  data={segment}
                  x={(d) => xScale(d.date)}
                  y={(d) => yScale(d.value)}
                  stroke={line.color}
                  strokeWidth={2.5}
                  strokeDasharray={line.strokeDasharray}
                  curve={curveMonotoneX}
                />
              ) : (
                // 两侧都是缺口的孤立采样点：单点路径不可见，画成圆点
                <circle
                  key={`dot-${line.key}-${index}`}
                  data-series={line.key}
                  cx={xScale(segment[0].date)}
                  cy={yScale(segment[0].value)}
                  r={2.5}
                  fill={line.color}
                />
              )
            )
          )}

          {tooltipData && hoverX !== null && (
            <g pointerEvents="none">
              <line
                x1={hoverX}
                x2={hoverX}
                y1={0}
                y2={innerHeight}
                stroke={axisColor}
                strokeWidth={1}
                strokeOpacity={0.6}
              />
              {tooltipData.values.map(({ line, value }) => (
                <circle
                  key={`marker-${line.key}`}
                  cx={hoverX}
                  cy={yScale(value)}
                  r={4}
                  fill={line.color}
                  stroke={surfaceColor}
                  strokeWidth={2}
                />
              ))}
            </g>
          )}

          <rect
            x={0}
            y={0}
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onMouseMove={handleMouseMove}
            onMouseLeave={hideTooltip}
          />

          <AxisBottom
            top={innerHeight}
            scale={xScale}
            stroke={axisColor}
            tickStroke={axisColor}
            tickValues={xTickValues}
            tickLabelProps={() => ({ fill: axisColor, fontSize: 11, textAnchor: 'middle' })}
            tickFormat={(value) => formatTimeLabel(value as Date)}
          />
          <AxisLeft
            scale={yScale}
            stroke={axisColor}
            tickStroke={axisColor}
            numTicks={5}
            tickLabelProps={() => ({ fill: axisColor, fontSize: 11, textAnchor: 'end', dx: -4 })}
            tickFormat={(value) => formatValue(Number(value))}
          />
        </Group>
      </svg>

      {tooltipData && (
        <TooltipWithBounds
          key={tooltipData.date.getTime()}
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            ...defaultStyles,
            background: tooltipBg,
            backdropFilter: 'blur(10px)',
            border: `1px solid ${tooltipBorder}`,
            borderRadius: '8px',
            padding: '10px 12px',
            minWidth: '150px',
          }}
        >
          <p className="mb-1.5 text-xs text-muted-foreground">{formatTimeLabel(tooltipData.date)}</p>
          <div className="space-y-1">
            {tooltipData.values.map(({ line, value }) => (
              <div key={line.key} className="flex items-center gap-2 text-sm">
                <svg width={12} height={4} className="shrink-0" aria-hidden="true">
                  <line x1={0} x2={12} y1={2} y2={2} stroke={line.color} strokeWidth={2} strokeDasharray={line.strokeDasharray ? '3 2' : undefined} />
                </svg>
                <span className="font-semibold tabular-nums text-foreground">{formatTooltipValue(value)}</span>
                <span className="text-xs text-muted-foreground">{line.name}</span>
              </div>
            ))}
          </div>
        </TooltipWithBounds>
      )}
    </div>
  )
}
