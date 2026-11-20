'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Group } from '@visx/group'
import { Area, LinePath } from '@visx/shape'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridColumns, GridRows } from '@visx/grid'
import { scaleLinear, scaleTime } from '@visx/scale'
import { curveMonotoneX } from '@visx/curve'
import { localPoint } from '@visx/event'
import { useTooltip } from '@visx/tooltip'
import { resolveChartGridStyle, useDocumentDarkClass } from '@/lib/chart-theme'
import { resolveTimeAxisLabelFormatter } from '../../utils/monitoring'
import { buildTimeAxisTicks, findHoverPoint, resolveTimeWindow, splitAtGaps } from '../../utils/timeSeries'
import type { PerformanceMetricKey } from '../charts/PerformanceMetricLegend'
import type { SystemPerformanceDataPoint } from '../../types'
import type {
  AggregateTrendPoint,
  DashboardAnnotation,
  ThresholdSummary,
} from '../../types/zabbix-monitoring.types'
import { useSyncedCrosshair } from './SyncedCrosshairContext'
import { AggregateTrendLegend, AggregateTrendTooltip } from './AggregateTrendOverlay'
import {
  annotationColor,
  annotationLabel,
  computeYesterdayBaselineMeans,
  filterVisibleAnnotations,
  normalizeAggregatePoints,
  splitAggregateSegments,
  type NormalizedAggregatePoint,
} from './aggregateTrendHelpers'

interface AggregateTrendChartProps {
  data: AggregateTrendPoint[]
  yesterdayBaseline?: SystemPerformanceDataPoint[]
  annotations?: DashboardAnnotation[]
  thresholds?: ThresholdSummary
  hiddenMetrics?: ReadonlySet<PerformanceMetricKey>
  compareYesterday?: boolean
  canReadAlerts?: boolean
  timeRange?: string
  height?: number
  onSelectDevice?: (deviceId: number, deviceName?: string) => void
}

const MARGIN = { top: 16, right: 24, bottom: 36, left: 72 }
const EMPTY_HIDDEN: ReadonlySet<PerformanceMetricKey> = new Set()

export function AggregateTrendChart({
  data,
  yesterdayBaseline = [],
  annotations,
  thresholds,
  hiddenMetrics = EMPTY_HIDDEN,
  compareYesterday = false,
  canReadAlerts = true,
  timeRange,
  height = 280,
  onSelectDevice,
}: AggregateTrendChartProps) {
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
  const tooltipBg = isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)'
  const tooltipBorder = isDark ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 0.5)'

  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 100)
  const innerHeight = Math.max(height - MARGIN.top - MARGIN.bottom, 60)
  const formatTimeLabel = useMemo(() => resolveTimeAxisLabelFormatter(timeRange), [timeRange])

  const { domain, points, baselinePoints, visibleAnnotations } = useMemo(() => {
    const rawDates = data
      .map((pt) => new Date(pt.timestamp))
      .filter((d) => !Number.isNaN(d.getTime()))
    const timeWindow = resolveTimeWindow(timeRange, Date.now(), rawDates)
    const startMs = timeWindow[0].getTime()
    const endMs = timeWindow[1].getTime()
    return {
      domain: timeWindow,
      points: normalizeAggregatePoints(data, startMs, endMs),
      baselinePoints: compareYesterday
        ? computeYesterdayBaselineMeans(yesterdayBaseline, startMs, endMs)
        : [],
      visibleAnnotations: filterVisibleAnnotations(annotations, canReadAlerts, startMs, endMs),
    }
  }, [data, yesterdayBaseline, compareYesterday, annotations, canReadAlerts, timeRange])

  const showCpu = !hiddenMetrics.has('cpu')
  const showMemory = !hiddenMetrics.has('memory')
  const xScale = useMemo(
    () => scaleTime({ domain: [domain[0], domain[1]], range: [0, innerWidth] }),
    [domain, innerWidth]
  )
  const yScale = useMemo(() => {
    const maxVal = Math.max(
      100,
      thresholds?.cpu.crit ?? 0,
      ...points.map((pt) => Math.max(pt.maxCpu, pt.maxMemory))
    )
    return scaleLinear({ domain: [0, maxVal], range: [innerHeight, 0], nice: true })
  }, [points, thresholds, innerHeight])

  const xTickValues = useMemo(
    () => buildTimeAxisTicks(domain, timeRange, innerWidth),
    [domain, timeRange, innerWidth]
  )
  const segments = useMemo(() => splitAggregateSegments(points), [points])
  const baselineSegments = useMemo(() => splitAtGaps(baselinePoints), [baselinePoints])

  const { showTooltip, hideTooltip, tooltipData, tooltipLeft = 0, tooltipTop = 0 } =
    useTooltip<NormalizedAggregatePoint>()

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGRectElement>) => {
      const point = localPoint(event)
      if (!point) return
      const anchor = findHoverPoint(points, xScale.invert(point.x - MARGIN.left))
      if (!anchor) {
        hideTooltip()
        setHoveredTimestampMs(null)
        return
      }
      setHoveredTimestampMs(anchor.date.getTime())
      showTooltip({
        tooltipData: anchor,
        tooltipLeft: xScale(anchor.date) + MARGIN.left,
        tooltipTop: point.y,
      })
    },
    [points, xScale, showTooltip, hideTooltip, setHoveredTimestampMs]
  )

  const handleMouseLeave = useCallback(() => {
    hideTooltip()
    setHoveredTimestampMs(null)
  }, [hideTooltip, setHoveredTimestampMs])

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-sm text-muted-foreground">暂无全网聚合态势数据</p>
      </div>
    )
  }

  const activeCrosshairX = tooltipData
    ? xScale(tooltipData.date)
    : hoveredTimestampMs !== null &&
        hoveredTimestampMs >= domain[0].getTime() &&
        hoveredTimestampMs <= domain[1].getTime()
      ? xScale(new Date(hoveredTimestampMs))
      : null

  return (
    <div className="space-y-2">
      <div ref={containerRef} style={{ position: 'relative', width: '100%', height }}>
        <svg width={width} height={height} style={{ display: 'block' }} aria-label="全网聚合态势图">
          <Group left={MARGIN.left} top={MARGIN.top}>
            <GridRows scale={yScale} width={innerWidth} stroke={gridStyle.stroke} strokeDasharray={gridStyle.dasharray} numTicks={5} />
            <GridColumns scale={xScale} height={innerHeight} stroke={gridStyle.stroke} strokeDasharray={gridStyle.dasharray} tickValues={xTickValues} />

            {showCpu && segments.map((seg, idx) => seg.length > 1 ? (
              <Group key={`agg-cpu-${idx}`}>
                <Area
                  data-series="aggregate:cpu-envelope"
                  data={seg}
                  x={(d) => xScale(d.date)}
                  y0={(d) => yScale(d.meanCpu)}
                  y1={(d) => yScale(d.maxCpu)}
                  fill="var(--brand)"
                  fillOpacity={0.14}
                  curve={curveMonotoneX}
                />
                <LinePath data-series="aggregate:cpu-p95" data={seg} x={(d) => xScale(d.date)} y={(d) => yScale(d.p95Cpu)} stroke="var(--brand)" strokeWidth={1.75} strokeDasharray="6 4" curve={curveMonotoneX} />
                <LinePath data-series="aggregate:cpu-mean" data={seg} x={(d) => xScale(d.date)} y={(d) => yScale(d.meanCpu)} stroke="var(--brand)" strokeWidth={2.5} curve={curveMonotoneX} />
              </Group>
            ) : null)}

            {showMemory && segments.map((seg, idx) => seg.length > 1 ? (
              <Group key={`agg-mem-${idx}`}>
                <LinePath data-series="aggregate:memory-p95" data={seg} x={(d) => xScale(d.date)} y={(d) => yScale(d.p95Memory)} stroke="var(--info)" strokeWidth={1.5} strokeDasharray="6 4" curve={curveMonotoneX} />
                <LinePath data-series="aggregate:memory-mean" data={seg} x={(d) => xScale(d.date)} y={(d) => yScale(d.meanMemory)} stroke="var(--info)" strokeWidth={2} curve={curveMonotoneX} />
              </Group>
            ) : null)}

            {compareYesterday && baselineSegments.map((seg, idx) => seg.length > 1 ? (
              <Group key={`agg-yoy-${idx}`}>
                {showCpu && <LinePath data-series="aggregate:yesterday-cpu" data={seg} x={(d) => xScale(d.date)} y={(d) => yScale(d.meanCpu)} stroke="var(--ink-2)" strokeWidth={1.5} strokeDasharray="3 3" curve={curveMonotoneX} />}
                {showMemory && <LinePath data-series="aggregate:yesterday-memory" data={seg} x={(d) => xScale(d.date)} y={(d) => yScale(d.meanMemory)} stroke="var(--unknown)" strokeWidth={1.5} strokeDasharray="3 3" curve={curveMonotoneX} />}
              </Group>
            ) : null)}

            {visibleAnnotations.map((ann, idx) => (
              <circle
                key={`ann-${ann.type}-${ann.timestamp}-${idx}`}
                data-annotation-type={ann.type}
                aria-label={`${annotationLabel(ann.type)}事件: ${ann.title}`}
                cx={xScale(ann.date)}
                cy={innerHeight - 6}
                r={4.5}
                fill={annotationColor(ann.type)}
                stroke="var(--surface)"
                strokeWidth={1.5}
              />
            ))}

            {activeCrosshairX !== null && (
              <line data-testid="synced-crosshair-line" x1={activeCrosshairX} x2={activeCrosshairX} y1={0} y2={innerHeight} stroke={axisColor} strokeWidth={1} strokeDasharray="4 3" pointerEvents="none" />
            )}

            <rect
              x={0}
              y={0}
              width={innerWidth}
              height={innerHeight}
              fill="transparent"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onClick={() => {
                if (tooltipData?.peakDeviceId && onSelectDevice) {
                  onSelectDevice(tooltipData.peakDeviceId, tooltipData.peakDeviceName)
                }
              }}
            />

            <AxisBottom top={innerHeight} scale={xScale} stroke={axisColor} tickStroke={axisColor} tickValues={xTickValues} tickLabelProps={() => ({ fill: axisColor, fontSize: 11, textAnchor: 'middle' })} tickFormat={(value) => formatTimeLabel(value as Date)} />
            <AxisLeft scale={yScale} stroke={axisColor} tickStroke={axisColor} numTicks={5} tickLabelProps={() => ({ fill: axisColor, fontSize: 11, textAnchor: 'end', dx: -4 })} tickFormat={(value) => `${Number(value).toFixed(0)}%`} />
          </Group>
        </svg>

        {tooltipData && (
          <AggregateTrendTooltip
            tooltipData={tooltipData}
            tooltipLeft={tooltipLeft}
            tooltipTop={tooltipTop}
            tooltipBg={tooltipBg}
            tooltipBorder={tooltipBorder}
            showCpu={showCpu}
            showMemory={showMemory}
            formatTimeLabel={formatTimeLabel}
          />
        )}
      </div>

      <AggregateTrendLegend compareYesterday={compareYesterday} />
    </div>
  )
}
