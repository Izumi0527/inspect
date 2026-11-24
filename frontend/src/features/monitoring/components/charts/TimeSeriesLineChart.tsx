import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Group } from '@visx/group'
import { LinePath } from '@visx/shape'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridColumns, GridRows } from '@visx/grid'
import { scaleLinear, scaleTime } from '@visx/scale'
import { curveMonotoneX } from '@visx/curve'
import { localPoint } from '@visx/event'
import { useTooltip } from '@visx/tooltip'
import { resolveChartGridStyle, useDocumentDarkClass } from '@/lib/chart-theme'
import { resolveTimeAxisLabelFormatter } from '../../utils/monitoring'
import { buildTimeAxisTicks, findHoverPoint, splitAtGaps } from '../../utils/timeSeries'
import type { DashboardAnnotation } from '../../types/zabbix-monitoring.types'
import { useSyncedCrosshair } from '../overview/SyncedCrosshairContext'
import { filterVisibleAnnotations } from '../overview/aggregateTrendHelpers'
import {
  AnnotationMarkers,
  AnnotationTooltip,
  ReferenceLineLayer,
  TimeSeriesTooltip,
  type ChartReferenceLine,
  type HoverState,
  type HoveredAnnotationState,
  type TimeSeriesLine,
  type TimeSeriesPoint,
} from './TimeSeriesOverlays'

export type { ChartReferenceLine, TimeSeriesLine, TimeSeriesPoint }

interface TimeSeriesLineChartProps {
  lines: TimeSeriesLine[]
  domain: readonly [Date, Date]
  timeRange?: string
  height?: number
  formatValue: (value: number) => string
  formatTooltipValue?: (value: number) => string
  ariaLabel: string
  referenceLines?: ChartReferenceLine[]
  annotations?: DashboardAnnotation[]
  canReadAlerts?: boolean
  onSelectDevice?: (deviceId: number, deviceName?: string) => void
}

const MARGIN = { top: 16, right: 24, bottom: 36, left: 72 }

export function TimeSeriesLineChart({
  lines,
  domain,
  timeRange,
  height = 300,
  formatValue,
  formatTooltipValue = formatValue,
  ariaLabel,
  referenceLines = [],
  annotations,
  canReadAlerts = true,
  onSelectDevice,
}: TimeSeriesLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const { hoveredTimestampMs, setHoveredTimestampMs } = useSyncedCrosshair()

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const updateWidth = () => setWidth(element.clientWidth || 800)
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
    const maxData = Math.max(0, ...lines.flatMap((line) => line.points.map((pt) => pt.value)))
    const maxRef = Math.max(0, ...referenceLines.map((ref) => ref.value))
    const ceiling = Math.max(maxData, maxRef)
    return scaleLinear({
      domain: [0, ceiling > 0 ? ceiling * 1.1 : 1],
      range: [innerHeight, 0],
      nice: true,
    })
  }, [lines, referenceLines, innerHeight])

  const xTickValues = useMemo(
    () => buildTimeAxisTicks(domain, timeRange, innerWidth),
    [domain, timeRange, innerWidth]
  )
  const segmentsByLine = useMemo(
    () => lines.map((line) => ({ line, segments: splitAtGaps(line.points) })),
    [lines]
  )
  const visibleAnnotations = useMemo(
    () =>
      filterVisibleAnnotations(
        annotations,
        canReadAlerts,
        domain[0].getTime(),
        domain[1].getTime()
      ),
    [annotations, canReadAlerts, domain]
  )

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

  const [hoveredAnnotation, setHoveredAnnotation] = useState<HoveredAnnotationState | null>(null)
  const { showTooltip, hideTooltip, tooltipData, tooltipLeft = 0, tooltipTop = 0 } =
    useTooltip<HoverState>()

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGRectElement>) => {
      setHoveredAnnotation(null)
      const point = localPoint(event)
      if (!point) return
      const anchor = findHoverPoint(anchors, xScale.invert(point.x - MARGIN.left))
      if (!anchor) {
        hideTooltip()
        setHoveredTimestampMs(null)
        return
      }
      const time = anchor.date.getTime()
      setHoveredTimestampMs(time)
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
    [anchors, lines, valueIndex, xScale, showTooltip, hideTooltip, setHoveredTimestampMs]
  )

  const handleMouseLeave = useCallback(() => {
    setHoveredAnnotation(null)
    hideTooltip()
    setHoveredTimestampMs(null)
  }, [hideTooltip, setHoveredTimestampMs])

  const hoverX = tooltipData
    ? xScale(tooltipData.date)
    : hoveredTimestampMs !== null &&
        hoveredTimestampMs >= domain[0].getTime() &&
        hoveredTimestampMs <= domain[1].getTime()
      ? xScale(new Date(hoveredTimestampMs))
      : null

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height }}>
      <svg width={width} height={height} style={{ display: 'block' }} aria-label={ariaLabel}>
        <Group left={MARGIN.left} top={MARGIN.top}>
          <GridRows scale={yScale} width={innerWidth} stroke={gridStyle.stroke} strokeDasharray={gridStyle.dasharray} numTicks={5} />
          <GridColumns scale={xScale} height={innerHeight} stroke={gridStyle.stroke} strokeDasharray={gridStyle.dasharray} tickValues={xTickValues} />

          <ReferenceLineLayer referenceLines={referenceLines} innerWidth={innerWidth} yScale={yScale} />

          {segmentsByLine.flatMap(({ line, segments }) =>
            segments.map((segment, index) =>
              segment.length > 1 ? (
                <LinePath key={`line-${line.key}-${index}`} data-series={line.key} data={segment} x={(d) => xScale(d.date)} y={(d) => yScale(d.value)} stroke={line.color} strokeWidth={2.5} strokeDasharray={line.strokeDasharray} curve={curveMonotoneX} />
              ) : (
                <circle key={`dot-${line.key}-${index}`} data-series={line.key} cx={xScale(segment[0].date)} cy={yScale(segment[0].value)} r={2.5} fill={line.color} />
              )
            )
          )}

          {hoverX !== null && (
            <g pointerEvents="none">
              <line data-testid="synced-crosshair-line" x1={hoverX} x2={hoverX} y1={0} y2={innerHeight} stroke={axisColor} strokeWidth={1} strokeDasharray={tooltipData ? undefined : '4 3'} strokeOpacity={0.7} />
              {tooltipData?.values.map(({ line, value }) => (
                <circle key={`marker-${line.key}`} cx={hoverX} cy={yScale(value)} r={4} fill={line.color} stroke={surfaceColor} strokeWidth={2} />
              ))}
            </g>
          )}

          <rect x={0} y={0} width={innerWidth} height={innerHeight} fill="transparent" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} />

          <AnnotationMarkers
            annotations={visibleAnnotations}
            xScale={xScale}
            cy={innerHeight - 6}
            radius={4}
            strokeColor={surfaceColor}
            marginLeft={MARGIN.left}
            marginTop={MARGIN.top}
            onHover={setHoveredAnnotation}
            onSelectDevice={onSelectDevice}
          />

          <AxisBottom top={innerHeight} scale={xScale} stroke={axisColor} tickStroke={axisColor} tickValues={xTickValues} tickLabelProps={() => ({ fill: axisColor, fontSize: 11, textAnchor: 'middle' })} tickFormat={(value) => formatTimeLabel(value as Date)} />
          <AxisLeft scale={yScale} stroke={axisColor} tickStroke={axisColor} numTicks={5} tickLabelProps={() => ({ fill: axisColor, fontSize: 11, textAnchor: 'end', dx: -4 })} tickFormat={(value) => formatValue(Number(value))} />
        </Group>
      </svg>

      {hoveredAnnotation ? (
        <AnnotationTooltip
          state={hoveredAnnotation}
          tooltipBg={tooltipBg}
          tooltipBorder={tooltipBorder}
          formatTimeLabel={formatTimeLabel}
          canDrillDown={Boolean(onSelectDevice)}
        />
      ) : tooltipData ? (
        <TimeSeriesTooltip
          tooltipData={tooltipData}
          tooltipLeft={tooltipLeft}
          tooltipTop={tooltipTop}
          tooltipBg={tooltipBg}
          tooltipBorder={tooltipBorder}
          formatTimeLabel={formatTimeLabel}
          formatTooltipValue={formatTooltipValue}
        />
      ) : null}
    </div>
  )
}
