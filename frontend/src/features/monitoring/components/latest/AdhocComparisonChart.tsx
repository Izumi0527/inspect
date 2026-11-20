'use client'

import { useState } from 'react'
import { LineChart, X } from 'lucide-react'
import type { SelectedMetricSeries } from '../../hooks/useLatestData'
import type { AdhocGraphResponse } from '../../types/zabbix-monitoring.types'
import { AdhocMultiSeriesSvg, type AdhocScaleMode } from './AdhocMultiSeriesSvg'
import { COMPARISON_PALETTE } from './latestDataHelpers'

export interface AdhocComparisonChartProps {
  data?: AdhocGraphResponse
  selectedSeries: SelectedMetricSeries[]
  isLoading: boolean
  timeRange: string
  onTimeRangeChange: (range: string) => void
  onRemoveSeries: (id: string) => void
  onClearAll: () => void
}

const COMPARE_RANGES: readonly string[] = ['1h', '6h', '24h', '7d']

function ComparisonLegend({
  selectedSeries,
  onRemoveSeries,
}: {
  selectedSeries: SelectedMetricSeries[]
  onRemoveSeries: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selectedSeries.map((item, idx) => {
        const color = COMPARISON_PALETTE[idx % COMPARISON_PALETTE.length]
        return (
          <span
            key={item.id}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2/60 px-2 py-0.5 text-xs text-foreground"
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="max-w-48 truncate">{item.label}</span>
            <button
              type="button"
              aria-label={`移除对比 ${item.label}`}
              onClick={() => onRemoveSeries(item.id)}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )
      })}
    </div>
  )
}

export function AdhocComparisonChart({
  data,
  selectedSeries,
  isLoading,
  timeRange,
  onTimeRangeChange,
  onRemoveSeries,
  onClearAll,
}: AdhocComparisonChartProps) {
  const [mode, setMode] = useState<AdhocScaleMode>('raw')
  if (selectedSeries.length === 0) return null

  return (
    <section
      aria-label="多指标同图对比"
      className="space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <LineChart className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            多指标同图对比（{selectedSeries.length}/6）
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5 text-xs">
            <button
              type="button"
              aria-pressed={mode === 'raw'}
              onClick={() => setMode('raw')}
              className={`rounded-md px-2.5 py-1 font-medium ${
                mode === 'raw' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              原始值
            </button>
            <button
              type="button"
              aria-pressed={mode === 'normalized'}
              onClick={() => setMode('normalized')}
              className={`rounded-md px-2.5 py-1 font-medium ${
                mode === 'normalized' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              归一化 0~100%
            </button>
          </div>

          <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5 text-xs">
            {COMPARE_RANGES.map((range) => (
              <button
                key={range}
                type="button"
                aria-pressed={timeRange === range}
                onClick={() => onTimeRangeChange(range)}
                className={`rounded-md px-2 py-1 font-medium ${
                  timeRange === range ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                {range}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            清空对比
          </button>
        </div>
      </div>

      <ComparisonLegend selectedSeries={selectedSeries} onRemoveSeries={onRemoveSeries} />

      {isLoading ? (
        <div className="py-12 text-center text-xs text-muted-foreground">正在加载多指标时序曲线...</div>
      ) : !data || data.timestamps.length === 0 ? (
        <div className="py-12 text-center text-xs text-muted-foreground">所选时间范围内暂无历史对比点</div>
      ) : (
        <AdhocMultiSeriesSvg data={data} mode={mode} timeRange={timeRange} />
      )}
    </section>
  )
}
