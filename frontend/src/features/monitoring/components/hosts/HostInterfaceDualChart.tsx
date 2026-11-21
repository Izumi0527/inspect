'use client'

import { useMemo } from 'react'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { curveMonotoneX } from '@visx/curve'
import { GridColumns, GridRows } from '@visx/grid'
import { Group } from '@visx/group'
import { scaleLinear, scaleTime } from '@visx/scale'
import { LinePath } from '@visx/shape'
import { resolveChartGridStyle, useDocumentDarkClass } from '@/lib/chart-theme'
import { useDeviceInterfaceTraffic } from '../../hooks/useDeviceInterfaceTraffic'
import type { HostInterfaceDetail } from '../../types/zabbix-monitoring.types'
import {
  formatBandwidthValue,
  resolveTimeAxisLabelFormatter,
} from '../../utils/monitoring'
import { buildTimeAxisTicks, resolveTimeWindow } from '../../utils/timeSeries'
import {
  resolveHostInterfaceDescription,
  resolveHostInterfaceDisplayName,
} from './hostDisplayHelpers'

export interface HostInterfaceDualChartProps {
  deviceId: number
  iface: HostInterfaceDetail
  timeRange?: string
}

function DualTrafficSvg({
  points,
  timeRange,
}: {
  points: Array<{ date: Date; inboundBps: number; outboundBps: number }>
  timeRange: string
}) {
  const isDark = useDocumentDarkClass()
  const gridStyle = resolveChartGridStyle('prominent', isDark)
  const axisColor = isDark ? '#9CA3AF' : '#6b7280'
  const width = 620
  const height = 190
  const margin = { top: 12, right: 16, bottom: 28, left: 68 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  const domain = useMemo(
    () => resolveTimeWindow(timeRange, Date.now(), points.map((p) => p.date)),
    [timeRange, points]
  )
  const xScale = useMemo(
    () => scaleTime({ domain: [domain[0], domain[1]], range: [0, innerWidth] }),
    [domain, innerWidth]
  )
  const yScale = useMemo(() => {
    const maxVal = Math.max(
      1,
      ...points.map((p) => Math.max(p.inboundBps, p.outboundBps))
    )
    return scaleLinear({
      domain: [0, maxVal * 1.1],
      range: [innerHeight, 0],
      nice: true,
    })
  }, [points, innerHeight])

  const formatTime = useMemo(() => resolveTimeAxisLabelFormatter(timeRange), [timeRange])
  const xTicks = useMemo(
    () => buildTimeAxisTicks(domain, timeRange, innerWidth),
    [domain, timeRange, innerWidth]
  )

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-48 w-full"
      aria-label="端口上行与下行速率双轨图"
    >
      <Group left={margin.left} top={margin.top}>
        <GridRows
          scale={yScale}
          width={innerWidth}
          stroke={gridStyle.stroke}
          strokeDasharray={gridStyle.dasharray}
          numTicks={4}
        />
        <GridColumns
          scale={xScale}
          height={innerHeight}
          stroke={gridStyle.stroke}
          strokeDasharray={gridStyle.dasharray}
          tickValues={xTicks}
        />
        <LinePath
          data={points}
          data-series="outbound"
          x={(d) => xScale(d.date)}
          y={(d) => yScale(d.outboundBps)}
          stroke="#16A34A"
          strokeWidth={2}
          curve={curveMonotoneX}
        />
        <LinePath
          data={points}
          data-series="inbound"
          x={(d) => xScale(d.date)}
          y={(d) => yScale(d.inboundBps)}
          stroke="#0284C7"
          strokeWidth={2}
          curve={curveMonotoneX}
        />
        <AxisBottom
          top={innerHeight}
          scale={xScale}
          stroke={axisColor}
          tickStroke={axisColor}
          tickValues={xTicks}
          tickLabelProps={() => ({ fill: axisColor, fontSize: 10, textAnchor: 'middle' })}
          tickFormat={(v) => formatTime(v as Date)}
        />
        <AxisLeft
          scale={yScale}
          stroke={axisColor}
          tickStroke={axisColor}
          numTicks={4}
          tickLabelProps={() => ({ fill: axisColor, fontSize: 10, textAnchor: 'end', dx: -4 })}
          tickFormat={(v) => formatBandwidthValue(Number(v))}
        />
      </Group>
    </svg>
  )
}

export function HostInterfaceDualChart({
  deviceId,
  iface,
  timeRange = '1h',
}: HostInterfaceDualChartProps) {
  const portName = resolveHostInterfaceDisplayName(iface)
  const portDescription = resolveHostInterfaceDescription(iface)
  const chartTitle =
    portDescription !== ''
      ? `端口双轨观测：${portName || '—'} · ${portDescription}`
      : `端口双轨观测：${portName || '—'}`

  const trafficQuery = useDeviceInterfaceTraffic({
    deviceId,
    timeRange,
    interfaceName: iface.name,
    enablePolling: false,
  })

  const points = useMemo(() => {
    return (trafficQuery.data?.points ?? [])
      .map((pt) => ({
        date: new Date(pt.timestamp),
        inboundBps: Math.max(0, pt.inbound) * 1_000_000,
        outboundBps: Math.max(0, pt.outbound) * 1_000_000,
      }))
      .filter((pt) => !Number.isNaN(pt.date.getTime()))
      .sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [trafficQuery.data?.points])

  return (
    <div className="rounded-xl border border-border bg-card p-3.5 text-xs">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-semibold text-foreground">{chartTitle}</h4>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            错包：入 {iface.in_errors} / 出 {iface.out_errors} · 丢包：入{' '}
            {iface.in_discards} / 出 {iface.out_discards}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-0.5 w-3 rounded-full bg-[#16A34A]" />
            上行速率
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-0.5 w-3 rounded-full bg-[#0284C7]" />
            下行速率
          </span>
        </div>
      </div>

      {trafficQuery.isLoading ? (
        <div className="py-10 text-center text-muted-foreground">正在加载端口双轨趋势...</div>
      ) : points.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground">该端口近 1 小时暂无流量采样点</div>
      ) : (
        <DualTrafficSvg points={points} timeRange={timeRange} />
      )}
    </div>
  )
}
