import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Group } from '@visx/group'
import { AreaClosed, LinePath } from '@visx/shape'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridColumns, GridRows } from '@visx/grid'
import { scaleLinear, scaleTime } from '@visx/scale'
import { curveMonotoneX } from '@visx/curve'
import { localPoint } from '@visx/event'
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip'
import { LinearGradient } from '@visx/gradient'
import { resolveChartGridStyle, useDocumentDarkClass } from '@/lib/chart-theme'
import {
  formatBandwidthValue,
  resolveTimeAxisLabelFormatter,
} from '../../utils/monitoring'
import { buildTimeAxisTicks, nearestPointIndex, resolveTimeWindow, splitAtGaps } from '../../utils/timeSeries'
import type { NetworkTrafficDataPoint } from '../../types'

type TrafficSeriesKey = 'outbound' | 'inbound'

/**
 * 两条序列的固定顺序与配色（颜色 = 序列，不随数据变化）：
 * 上行 = outbound（绿 #16A34A）、下行 = inbound（蓝 #0284C7），与统计卡「上行/下行流量」口径一致；
 * 配色已通过 dataviz 校验脚本（light/dark 均 PASS，无对比度警告）。
 */
export const TRAFFIC_SERIES: ReadonlyArray<{ key: TrafficSeriesKey; label: string; color: string }> = [
  { key: 'outbound', label: '上行', color: '#16A34A' },
  { key: 'inbound', label: '下行', color: '#0284C7' },
]

interface ChartPoint {
  date: Date
  outbound: number
  inbound: number
}

interface InterfaceTrafficChartProps {
  /** 单位 Mbps（后端契约），图内换算为 bps 以自适应显示单位 */
  data: NetworkTrafficDataPoint[]
  height?: number
  className?: string
  /** 时间范围（用于 x 轴刻度/tooltip 时间格式优化） */
  timeRange?: string
}

/**
 * 接口流量图：上行/下行两条序列各自从 0 基线起的半透明面积 + 细线，不堆叠、无总流量。
 * 悬停时十字线吸附到最近采样点，tooltip 同时列出两条序列的值。
 */
export function InterfaceTrafficChart({
  data,
  height = 280,
  className,
  timeRange,
}: InterfaceTrafficChartProps) {
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

  // 订阅式主题探测：切换主题后网格、坐标轴、提示框颜色同步更新，不必刷新页面。
  // 网格与系统性能趋势、设备温度监控两张图共用 prominent 样式，同一页面观感一致。
  const isDark = useDocumentDarkClass()
  const gridStyle = resolveChartGridStyle('prominent', isDark)
  const axisColor = isDark ? '#9CA3AF' : '#6b7280'
  const surfaceColor = isDark ? '#111827' : '#ffffff'
  const tooltipBg = isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)'
  const tooltipBorder = isDark ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 0.5)'

  const margin = { top: 16, right: 24, bottom: 36, left: 72 }
  const innerWidth = Math.max(width - margin.left - margin.right, 100)
  const innerHeight = Math.max(height - margin.top - margin.bottom, 60)

  const formatTimeLabel = useMemo(() => resolveTimeAxisLabelFormatter(timeRange), [timeRange])

  // 横轴范围 = 所选时间窗口（与系统性能趋势、设备温度图一致），早于窗口起点的点不绘制；
  // 窗口终点取渲染时的当前时间，随数据刷新（data 变化）重新计算，窗口跟着向前滚动
  const { points, domain } = useMemo(() => {
    const dated = data
      .map((point) => ({
        date: new Date(point.timestamp),
        outbound: Math.max(0, point.outbound) * 1_000_000,
        inbound: Math.max(0, point.inbound) * 1_000_000,
      }))
      .filter((point) => !Number.isNaN(point.date.getTime()))
      .sort((a, b) => a.date.getTime() - b.date.getTime())
    const timeWindow = resolveTimeWindow(timeRange, Date.now(), dated.map((point) => point.date))
    return {
      points: dated.filter((point) => point.date.getTime() >= timeWindow[0].getTime()),
      domain: timeWindow,
    }
  }, [data, timeRange])

  // 数据缺口处断开曲线与面积（规则见 utils/timeSeries 的 TIME_SERIES_GAP_THRESHOLD_MS）
  const segments = useMemo(() => splitAtGaps(points), [points])

  const xScale = useMemo(
    () => scaleTime({ domain: [domain[0], domain[1]], range: [0, innerWidth] }),
    [domain, innerWidth]
  )

  const yScale = useMemo(() => {
    const maxValue = Math.max(...points.map((point) => Math.max(point.inbound, point.outbound)), 0)
    return scaleLinear({
      domain: [0, maxValue > 0 ? maxValue * 1.1 : 1],
      range: [innerHeight, 0],
      nice: true,
    })
  }, [points, innerHeight])

  // X 轴刻度：按时间范围取步长（1h→5min，以此类推），对齐到自然边界；过密时按倍数稀疏
  const xTickValues = useMemo(() => buildTimeAxisTicks(domain, timeRange, innerWidth), [domain, timeRange, innerWidth])

  const { showTooltip, hideTooltip, tooltipData, tooltipLeft = 0, tooltipTop = 0 } =
    useTooltip<ChartPoint>()

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGRectElement>) => {
      const point = localPoint(event)
      if (!point || points.length === 0) return
      const x = point.x - margin.left
      const datum = points[nearestPointIndex(points, xScale.invert(x))]
      showTooltip({
        tooltipData: datum,
        tooltipLeft: xScale(datum.date) + margin.left,
        tooltipTop: point.y,
      })
    },
    [points, xScale, margin.left, showTooltip]
  )

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-sm text-muted-foreground">暂无流量数据</p>
      </div>
    )
  }

  const hoverX = tooltipData ? xScale(tooltipData.date) : null

  return (
    <div className={className}>
      <div ref={containerRef} style={{ position: 'relative', width: '100%', height }}>
        <svg width={width} height={height} style={{ display: 'block' }} aria-label="接口流量图">
          <defs>
            {TRAFFIC_SERIES.map((series) => (
              <LinearGradient
                key={series.key}
                id={`traffic-area-${series.key}`}
                from={series.color}
                to={series.color}
                fromOpacity={0.28}
                toOpacity={0.02}
              />
            ))}
          </defs>

          <Group left={margin.left} top={margin.top}>
            <GridRows
              scale={yScale}
              width={innerWidth}
              stroke={gridStyle.stroke}
              strokeDasharray={gridStyle.dasharray}
              numTicks={5}
            />
            {/* 纵向网格与 X 轴刻度同位，刻度已按采样间隔对齐 */}
            <GridColumns
              scale={xScale}
              height={innerHeight}
              stroke={gridStyle.stroke}
              strokeDasharray={gridStyle.dasharray}
              tickValues={xTickValues}
            />

            {TRAFFIC_SERIES.flatMap((series) =>
              segments
                .map((segment, index) => ({ segment, index }))
                .filter(({ segment }) => segment.length > 1)
                .map(({ segment, index }) => (
                  <AreaClosed
                    key={`area-${series.key}-${index}`}
                    data-area={series.key}
                    data={segment}
                    x={(d) => xScale(d.date)}
                    y={(d) => yScale(d[series.key])}
                    yScale={yScale}
                    fill={`url(#traffic-area-${series.key})`}
                    curve={curveMonotoneX}
                  />
                ))
            )}

            {TRAFFIC_SERIES.flatMap((series) =>
              segments.map((segment, index) =>
                segment.length > 1 ? (
                  <LinePath
                    key={`line-${series.key}-${index}`}
                    data-series={series.key}
                    data={segment}
                    x={(d) => xScale(d.date)}
                    y={(d) => yScale(d[series.key])}
                    stroke={series.color}
                    strokeWidth={2}
                    curve={curveMonotoneX}
                  />
                ) : (
                  // 两侧都是缺口的孤立采样点：单点路径不可见，画成圆点
                  <circle
                    key={`dot-${series.key}-${index}`}
                    data-series={series.key}
                    cx={xScale(segment[0].date)}
                    cy={yScale(segment[0][series.key])}
                    r={2.5}
                    fill={series.color}
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
                {TRAFFIC_SERIES.map((series) => (
                  <circle
                    key={`marker-${series.key}`}
                    cx={hoverX}
                    cy={yScale(tooltipData[series.key])}
                    r={4}
                    fill={series.color}
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
              tickFormat={(value) => formatBandwidthValue(Number(value))}
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
              {TRAFFIC_SERIES.map((series) => (
                <div key={series.key} className="flex items-center gap-2 text-sm">
                  <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: series.color }} />
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatBandwidthValue(tooltipData[series.key])}
                  </span>
                  <span className="text-xs text-muted-foreground">{series.label}</span>
                </div>
              ))}
            </div>
          </TooltipWithBounds>
        )}
      </div>
    </div>
  )
}

/** 流量序列图例（放在卡片标题行右侧；颜色 = 序列） */
export function TrafficSeriesLegend() {
  return (
    <ul aria-label="流量序列图例" className="flex items-center gap-4">
      {TRAFFIC_SERIES.map((series) => (
        <li key={series.key} className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: series.color }} />
          <span className="text-xs text-muted-foreground">{series.label}</span>
        </li>
      ))}
    </ul>
  )
}
