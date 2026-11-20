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
  formatTimeLabel,
}: AggregateTrendTooltipProps) {
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
      {tooltipData.peakDeviceName && (
        <div className="mt-1.5 border-t border-border pt-1 text-xs text-primary">
          峰值设备：{tooltipData.peakDeviceName}
        </div>
      )}
    </TooltipWithBounds>
  )
}

export function AggregateTrendLegend({ compareYesterday }: { compareYesterday: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-4 bg-brand" /> 均值 (Mean)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-4 border-t-2 border-dashed border-brand" /> P95 分位
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-4 rounded-sm bg-brand/20" /> Max 包络带
      </span>
      {compareYesterday && (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 border-t-2 border-dashed border-ink-2" /> 昨日同期基线
        </span>
      )}
    </div>
  )
}
