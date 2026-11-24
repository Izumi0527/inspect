'use client'

import { TooltipWithBounds, defaultStyles } from '@visx/tooltip'
import type { NormalizedAggregatePoint } from './aggregateTrendHelpers'

interface AggregateTrendTooltipProps {
  tooltipData: NormalizedAggregatePoint
  tooltipLeft: number
  tooltipTop: number
  tooltipBg: string
  tooltipBorder: string
  showCpu: boolean
  showMemory: boolean
  canDrillDown?: boolean
  formatTimeLabel: (date: Date) => string
}

export function AggregateTrendTooltip({
  tooltipData,
  tooltipLeft,
  tooltipTop,
  tooltipBg,
  tooltipBorder,
  showCpu,
  showMemory,
  canDrillDown = false,
  formatTimeLabel,
}: AggregateTrendTooltipProps) {
  const showCpuPeak = showCpu && Boolean(tooltipData.peakDeviceName)
  const showMemoryPeak =
    showMemory &&
    Boolean(tooltipData.peakMemoryDeviceName) &&
    (tooltipData.peakMemoryDeviceName !== tooltipData.peakDeviceName || !showCpu)

  return (
    <TooltipWithBounds
      key={tooltipData.date.getTime()}
      top={tooltipTop}
      left={tooltipLeft}
      style={{
        ...defaultStyles,
        background: tooltipBg,
        border: `1px solid ${tooltipBorder}`,
        borderRadius: '8px',
        padding: '10px 12px',
        minWidth: '180px',
      }}
    >
      <p className="mb-1.5 text-xs text-muted-foreground tabular-nums">
        {formatTimeLabel(tooltipData.date)}
      </p>
      {showCpu && (
        <div className="space-y-0.5 text-xs tabular-nums">
          <div className="font-medium text-foreground">
            CPU 均值 {tooltipData.meanCpu.toFixed(1)}% · P95 {tooltipData.p95Cpu.toFixed(1)}% · 峰值 {tooltipData.maxCpu.toFixed(1)}%
          </div>
        </div>
      )}
      {showMemory && (
        <div className="mt-1 space-y-0.5 text-xs tabular-nums text-muted-foreground">
          <div>
            内存 均值 {tooltipData.meanMemory.toFixed(1)}% · P95 {tooltipData.p95Memory.toFixed(1)}% · 峰值 {tooltipData.maxMemory.toFixed(1)}%
          </div>
        </div>
      )}
      {(showCpuPeak || showMemoryPeak) && (
        <div className="mt-1.5 space-y-0.5 border-t border-border pt-1 text-xs text-primary">
          {showCpuPeak && <div>CPU 峰值设备：{tooltipData.peakDeviceName}</div>}
          {showMemoryPeak && <div>内存峰值设备：{tooltipData.peakMemoryDeviceName}</div>}
          {canDrillDown && (
            <div className="text-[11px] text-muted-foreground">点击查看峰值设备详情</div>
          )}
        </div>
      )}
    </TooltipWithBounds>
  )
}

interface AggregateTrendLegendProps {
  compareYesterday: boolean
  showCpu?: boolean
  showMemory?: boolean
}

export function AggregateTrendLegend({
  compareYesterday,
  showCpu = true,
  showMemory = true,
}: AggregateTrendLegendProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {showCpu && (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-brand" /> CPU 均值
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 border-t-2 border-dashed border-brand" /> CPU P95 分位
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm bg-brand/20" /> CPU Max 包络带
          </span>
        </>
      )}
      {showMemory && (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-info" /> 内存 均值
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 border-t-2 border-dashed border-info" /> 内存 P95 分位
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm bg-info/15" /> 内存 Max 包络带
          </span>
        </>
      )}
      {compareYesterday && (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 border-t-2 border-dashed border-ink-2" /> 昨日同期基线
        </span>
      )}
    </div>
  )
}
