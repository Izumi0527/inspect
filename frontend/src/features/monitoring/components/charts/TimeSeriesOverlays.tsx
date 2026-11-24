'use client'

import { TooltipWithBounds, defaultStyles } from '@visx/tooltip'
import type { DashboardAnnotation } from '../../types/zabbix-monitoring.types'
import { annotationColor, annotationLabel } from '../overview/aggregateTrendHelpers'

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

export interface HoveredAnnotationState {
  annotation: DashboardAnnotation & { date: Date }
  left: number
  top: number
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

interface ReferenceLineLayerProps {
  referenceLines: ChartReferenceLine[]
  innerWidth: number
  yScale: (value: number) => number
}

export function ReferenceLineLayer({
  referenceLines,
  innerWidth,
  yScale,
}: ReferenceLineLayerProps) {
  return (
    <>
      {referenceLines.map((refLine) => {
        const y = yScale(refLine.value)
        return (
          <g key={refLine.key} data-reference-line={refLine.key} pointerEvents="none">
            <line
              x1={0}
              x2={innerWidth}
              y1={y}
              y2={y}
              stroke={refLine.color}
              strokeWidth={1.5}
              strokeDasharray={refLine.strokeDasharray ?? '5 4'}
            />
            <text x={innerWidth - 4} y={y - 4} textAnchor="end" fontSize={10} fill={refLine.color}>
              {refLine.label}
            </text>
          </g>
        )
      })}
    </>
  )
}

interface AnnotationMarkersProps {
  annotations: Array<DashboardAnnotation & { date: Date }>
  xScale: (date: Date) => number
  cy: number
  radius?: number
  strokeColor: string
  marginLeft: number
  marginTop: number
  onHover: (state: HoveredAnnotationState | null) => void
  onSelectDevice?: (deviceId: number, deviceName?: string) => void
}

export function AnnotationMarkers({
  annotations,
  xScale,
  cy,
  radius = 4,
  strokeColor,
  marginLeft,
  marginTop,
  onHover,
  onSelectDevice,
}: AnnotationMarkersProps) {
  return (
    <>
      {annotations.map((ann, idx) => {
        const cx = xScale(ann.date)
        const clickable = typeof ann.device_id === 'number' && Boolean(onSelectDevice)
        return (
          <circle
            key={`ann-${ann.type}-${ann.timestamp}-${idx}`}
            data-annotation-type={ann.type}
            aria-label={`${annotationLabel(ann.type)}事件: ${ann.title}`}
            cx={cx}
            cy={cy}
            r={radius}
            fill={annotationColor(ann.type)}
            stroke={strokeColor}
            strokeWidth={1.5}
            style={{ cursor: clickable ? 'pointer' : undefined }}
            onMouseEnter={() =>
              onHover({
                annotation: ann,
                left: cx + marginLeft,
                top: cy + marginTop,
              })
            }
            onMouseLeave={() => onHover(null)}
            onClick={(event) => {
              if (typeof ann.device_id === 'number' && onSelectDevice) {
                event.stopPropagation()
                onSelectDevice(ann.device_id, ann.device_name)
              }
            }}
          />
        )
      })}
    </>
  )
}

interface AnnotationTooltipProps {
  state: HoveredAnnotationState
  tooltipBg: string
  tooltipBorder: string
  formatTimeLabel: (date: Date) => string
  canDrillDown?: boolean
}

export function AnnotationTooltip({
  state,
  tooltipBg,
  tooltipBorder,
  formatTimeLabel,
  canDrillDown = false,
}: AnnotationTooltipProps) {
  const { annotation, left, top } = state
  return (
    <TooltipWithBounds
      key={`ann-${annotation.type}-${annotation.timestamp}`}
      top={top}
      left={left}
      style={{
        ...defaultStyles,
        background: tooltipBg,
        border: `1px solid ${tooltipBorder}`,
        borderRadius: '8px',
        padding: '8px 10px',
        minWidth: '170px',
      }}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold" style={{ color: annotationColor(annotation.type) }}>
          {annotationLabel(annotation.type)}事件
        </span>
        <span className="text-muted-foreground tabular-nums">
          {formatTimeLabel(annotation.date)}
        </span>
      </div>
      <p className="mt-1 text-xs font-medium text-foreground">{annotation.title}</p>
      {annotation.device_name && (
        <p className="mt-1 text-xs text-muted-foreground">设备：{annotation.device_name}</p>
      )}
      {canDrillDown && typeof annotation.device_id === 'number' && (
        <p className="mt-0.5 text-[11px] text-primary">点击查看设备详情</p>
      )}
    </TooltipWithBounds>
  )
}
