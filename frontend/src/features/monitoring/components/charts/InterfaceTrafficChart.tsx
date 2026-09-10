import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Group } from '@visx/group'
import { AreaClosed, LinePath } from '@visx/shape'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridRows } from '@visx/grid'
import { scaleLinear, scaleTime } from '@visx/scale'
import { curveMonotoneX } from '@visx/curve'
import { localPoint } from '@visx/event'
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip'
import { LinearGradient } from '@visx/gradient'
import {
  formatBandwidthValue,
  resolveTickStepMinutes,
  resolveTimeAxisLabelFormatter,
} from '../../utils/monitoring'
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

/** 在按时间升序的点列中找离 target 最近的下标（十字线吸附） */
function nearestPointIndex(points: ChartPoint[], target: Date): number {
  const time = target.getTime()
  let low = 0
  let high = points.length - 1
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (points[mid].date.getTime() < time) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  if (low > 0 && time - points[low - 1].date.getTime() < points[low].date.getTime() - time) {
    return low - 1
  }
  return low
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

  const isDark =
    typeof window !== 'undefined' && document.documentElement.classList.contains('dark')
  const gridColor = isDark ? '#374151' : '#e5e7eb'
  const axisColor = isDark ? '#9CA3AF' : '#6b7280'
  const surfaceColor = isDark ? '#111827' : '#ffffff'
  const tooltipBg = isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)'
  const tooltipBorder = isDark ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 0.5)'

  const margin = { top: 16, right: 24, bottom: 36, left: 72 }
  const innerWidth = Math.max(width - margin.left - margin.right, 100)
  const innerHeight = Math.max(height - margin.top - margin.bottom, 60)

  const formatTimeLabel = useMemo(() => resolveTimeAxisLabelFormatter(timeRange), [timeRange])

  const points = useMemo<ChartPoint[]>(() => {
    return data
      .map((point) => ({
        date: new Date(point.timestamp),
        outbound: Math.max(0, point.outbound) * 1_000_000,
        inbound: Math.max(0, point.inbound) * 1_000_000,
      }))
      .filter((point) => !Number.isNaN(point.date.getTime()))
      .sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [data])

  const xScale = useMemo(() => {
    const times = points.map((point) => point.date.getTime())
    return scaleTime({
      domain: [new Date(Math.min(...times)), new Date(Math.max(...times))],
      range: [0, innerWidth],
    })
  }, [points, innerWidth])

  const yScale = useMemo(() => {
    const maxValue = Math.max(...points.map((point) => Math.max(point.inbound, point.outbound)), 0)
    return scaleLinear({
      domain: [0, maxValue > 0 ? maxValue * 1.1 : 1],
      range: [innerHeight, 0],
      nice: true,
    })
  }, [points, innerHeight])

  // X 轴刻度：按时间范围取步长（1h→5min，以此类推），对齐到自然边界；过密时按倍数稀疏
  const xTickValues = useMemo(() => {
    if (points.length < 2) return undefined
    const [minTime, maxTime] = xScale.domain()
    const stepMinutes = resolveTickStepMinutes(String(timeRange ?? '').trim() || '24h')

    const start = new Date(minTime)
    start.setSeconds(0, 0)
    if (stepMinutes >= 24 * 60) {
      start.setHours(0, 0, 0, 0)
    } else if (stepMinutes >= 60) {
      start.setMinutes(0)
    } else {
      start.setMinutes(Math.floor(start.getMinutes() / stepMinutes) * stepMinutes)
    }

    const ticks: Date[] = []
    const current = new Date(start)
    while (current.getTime() <= maxTime.getTime()) {
      if (current.getTime() >= minTime.getTime()) {
        ticks.push(new Date(current))
      }
      current.setMinutes(current.getMinutes() + stepMinutes)
    }

    const maxTicks = Math.max(Math.floor(innerWidth / 80), 4)
    if (ticks.length > maxTicks) {
      const step = Math.ceil(ticks.length / maxTicks)
      return ticks.filter((_, index) => index % step === 0)
    }
    return ticks
  }, [points.length, xScale, timeRange, innerWidth])

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
            <GridRows scale={yScale} width={innerWidth} stroke={gridColor} numTicks={5} />

            {TRAFFIC_SERIES.map((series) => (
              <AreaClosed
                key={`area-${series.key}`}
                data={points}
                x={(d) => xScale(d.date)}
                y={(d) => yScale(d[series.key])}
                yScale={yScale}
                fill={`url(#traffic-area-${series.key})`}
                curve={curveMonotoneX}
              />
            ))}

            {TRAFFIC_SERIES.map((series) => (
              <LinePath
                key={`line-${series.key}`}
                data-series={series.key}
                data={points}
                x={(d) => xScale(d.date)}
                y={(d) => yScale(d[series.key])}
                stroke={series.color}
                strokeWidth={2}
                curve={curveMonotoneX}
              />
            ))}

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
              stroke={gridColor}
              tickStroke={gridColor}
              tickValues={xTickValues}
              tickLabelProps={() => ({ fill: axisColor, fontSize: 11, textAnchor: 'middle' })}
              tickFormat={(value) => formatTimeLabel(value as Date)}
            />
            <AxisLeft
              scale={yScale}
              stroke={gridColor}
              tickStroke={gridColor}
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
