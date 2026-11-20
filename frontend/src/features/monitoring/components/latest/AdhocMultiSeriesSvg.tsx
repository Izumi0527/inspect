'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { curveMonotoneX } from '@visx/curve'
import { localPoint } from '@visx/event'
import { GridColumns, GridRows } from '@visx/grid'
import { Group } from '@visx/group'
import { scaleLinear, scaleTime } from '@visx/scale'
import { LinePath } from '@visx/shape'
import { TooltipWithBounds, defaultStyles, useTooltip } from '@visx/tooltip'
import { resolveChartGridStyle, useDocumentDarkClass } from '@/lib/chart-theme'
import type { AdhocGraphResponse } from '../../types/zabbix-monitoring.types'
import { resolveTimeAxisLabelFormatter } from '../../utils/monitoring'
import { buildTimeAxisTicks, findHoverPoint, resolveTimeWindow } from '../../utils/timeSeries'
import {
  COMPARISON_PALETTE,
  computeSeriesBounds,
  formatSeriesDisplayName,
  normalizeValue,
} from './latestDataHelpers'

export type AdhocScaleMode = 'raw' | 'normalized'

interface AlignedPoint {
  date: Date
  index: number
}

export function AdhocMultiSeriesSvg({
  data,
  mode,
  timeRange,
}: {
  data: AdhocGraphResponse
  mode: AdhocScaleMode
  timeRange: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(760)
  const height = 240
  const margin = { top: 14, right: 20, bottom: 32, left: 56 }
  const innerWidth = Math.max(width - margin.left - margin.right, 120)
  const innerHeight = height - margin.top - margin.bottom

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setWidth(el.clientWidth || 760)
    update()
    if (typeof ResizeObserver === 'undefined') return
    const obs = new ResizeObserver(update)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const isDark = useDocumentDarkClass()
  const gridStyle = resolveChartGridStyle('prominent', isDark)
  const axisColor = isDark ? '#9CA3AF' : '#6b7280'
  const tooltipBg = isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)'
  const tooltipBorder = isDark ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 0.5)'

  const alignedPoints = useMemo<AlignedPoint[]>(
    () =>
      data.timestamps
        .map((ts, index) => ({ date: new Date(ts), index }))
        .filter((pt) => !Number.isNaN(pt.date.getTime())),
    [data.timestamps]
  )

  const domain = useMemo(
    () => resolveTimeWindow(timeRange, Date.now(), alignedPoints.map((p) => p.date)),
    [timeRange, alignedPoints]
  )

  const boundsBySeries = useMemo(
    () => data.series.map((s) => computeSeriesBounds(s.values)),
    [data.series]
  )

  const seriesLines = useMemo(() => {
    return data.series.map((series, sIdx) => {
      const bounds = boundsBySeries[sIdx]
      const pts = alignedPoints
        .map((pt) => {
          const raw = series.values[pt.index] ?? null
          const yVal = mode === 'normalized' ? normalizeValue(raw, bounds) : raw
          if (yVal === null || !Number.isFinite(yVal)) return null
          return { date: pt.date, value: yVal, raw }
        })
        .filter((v): v is { date: Date; value: number; raw: number | null } => v !== null)
      return {
        series,
        color: COMPARISON_PALETTE[sIdx % COMPARISON_PALETTE.length],
        pts,
      }
    })
  }, [data.series, alignedPoints, mode, boundsBySeries])

  const xScale = useMemo(
    () => scaleTime({ domain: [domain[0], domain[1]], range: [0, innerWidth] }),
    [domain, innerWidth]
  )
  const yScale = useMemo(() => {
    if (mode === 'normalized') {
      return scaleLinear({ domain: [0, 100], range: [innerHeight, 0] })
    }
    const allVals = seriesLines.flatMap((s) => s.pts.map((p) => p.value))
    const minVal = allVals.length > 0 ? Math.min(0, ...allVals) : 0
    const maxVal = allVals.length > 0 ? Math.max(1, ...allVals) : 100
    return scaleLinear({
      domain: [minVal, maxVal * 1.1],
      range: [innerHeight, 0],
      nice: true,
    })
  }, [mode, seriesLines, innerHeight])

  const formatTime = useMemo(() => resolveTimeAxisLabelFormatter(timeRange), [timeRange])
  const xTicks = useMemo(
    () => buildTimeAxisTicks(domain, timeRange, innerWidth),
    [domain, timeRange, innerWidth]
  )

  const { showTooltip, hideTooltip, tooltipData, tooltipLeft = 0, tooltipTop = 0 } =
    useTooltip<AlignedPoint>()

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      const pt = localPoint(e)
      if (!pt) return
      const datum = findHoverPoint(alignedPoints, xScale.invert(pt.x - margin.left))
      if (!datum) {
        hideTooltip()
        return
      }
      showTooltip({
        tooltipData: datum,
        tooltipLeft: xScale(datum.date) + margin.left,
        tooltipTop: pt.y,
      })
    },
    [alignedPoints, xScale, margin.left, showTooltip, hideTooltip]
  )

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      <svg width={width} height={height} aria-label="多指标同图对比曲线图">
        <Group left={margin.left} top={margin.top}>
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
            tickValues={xTicks}
          />
          {seriesLines.map(({ series, color, pts }) => (
            <LinePath
              key={series.key}
              data={pts}
              data-series={series.key}
              x={(d) => xScale(d.date)}
              y={(d) => yScale(d.value)}
              stroke={color}
              strokeWidth={2}
              curve={curveMonotoneX}
            />
          ))}
          {tooltipData && (
            <line
              x1={xScale(tooltipData.date)}
              x2={xScale(tooltipData.date)}
              y1={0}
              y2={innerHeight}
              stroke={axisColor}
              strokeWidth={1}
              strokeOpacity={0.6}
            />
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
            tickValues={xTicks}
            tickLabelProps={() => ({ fill: axisColor, fontSize: 11, textAnchor: 'middle' })}
            tickFormat={(v) => formatTime(v as Date)}
          />
          <AxisLeft
            scale={yScale}
            stroke={axisColor}
            tickStroke={axisColor}
            numTicks={5}
            tickLabelProps={() => ({ fill: axisColor, fontSize: 11, textAnchor: 'end', dx: -4 })}
            tickFormat={(v) => (mode === 'normalized' ? `${Number(v).toFixed(0)}%` : String(v))}
          />
        </Group>
      </svg>

      {tooltipData && (
        <TooltipWithBounds
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            ...defaultStyles,
            background: tooltipBg,
            border: `1px solid ${tooltipBorder}`,
            borderRadius: '8px',
            padding: '8px 10px',
          }}
        >
          <p className="mb-1 text-xs text-muted-foreground">{formatTime(tooltipData.date)}</p>
          <div className="space-y-1 text-xs tabular-nums">
            {data.series.map((s, idx) => {
              const raw = s.values[tooltipData.index]
              const color = COMPARISON_PALETTE[idx % COMPARISON_PALETTE.length]
              return (
                <div key={s.key} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-foreground">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                    {formatSeriesDisplayName(s)}
                  </span>
                  <span className="font-semibold text-foreground">
                    {raw !== null && raw !== undefined ? `${raw} ${s.unit ?? ''}` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </TooltipWithBounds>
      )}
    </div>
  )
}
