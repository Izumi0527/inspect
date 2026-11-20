'use client'

import { TooltipWithBounds, defaultStyles } from '@visx/tooltip'

export interface TimeSeriesPoint {
  date: Date
  value: number
}

export interface TimeSeriesLine {
  key: string
  name: string
  color: string
  strokeDasharray?: string
  points: TimeSeriesPoint[]
}

export interface ChartReferenceLine {
  key: string
  value: number
  label: string
  color: string
  strokeDasharray?: string
}

export interface HoverState {
  date: Date
  values: Array<{ line: TimeSeriesLine; value: number }>
}

interface TimeSeriesTooltipProps {
  tooltipData: HoverState
  tooltipLeft: number
  tooltipTop: number
  tooltipBg: string
  tooltipBorder: string
  formatTimeLabel: (date: Date) => string
  formatTooltipValue: (value: number) => string
}

export function TimeSeriesTooltip({
  tooltipData,
  tooltipLeft,
  tooltipTop,
  tooltipBg,
  tooltipBorder,
  formatTimeLabel,
  formatTooltipValue,
}: TimeSeriesTooltipProps) {
  return (
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
      <p className="mb-1.5 text-xs text-muted-foreground">
        {formatTimeLabel(tooltipData.date)}
      </p>
      <div className="space-y-1">
        {tooltipData.values.map(({ line, value }) => (
          <div key={line.key} className="flex items-center gap-2 text-sm">
            <svg width={12} height={4} className="shrink-0" aria-hidden="true">
              <line
                x1={0}
                x2={12}
                y1={2}
                y2={2}
                stroke={line.color}
                strokeWidth={2}
                strokeDasharray={line.strokeDasharray ? '3 2' : undefined}
              />
            </svg>
            <span className="font-semibold tabular-nums text-foreground">
              {formatTooltipValue(value)}
            </span>
            <span className="text-xs text-muted-foreground">{line.name}</span>
          </div>
        ))}
      </div>
    </TooltipWithBounds>
  )
}
