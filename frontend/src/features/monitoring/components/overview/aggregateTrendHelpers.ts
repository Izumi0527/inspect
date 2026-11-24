import { splitAtGaps } from '../../utils/timeSeries'
import type { SystemPerformanceDataPoint } from '../../types'
import type {
  AggregateTrendPoint,
  DashboardAnnotation,
} from '../../types/zabbix-monitoring.types'

export interface NormalizedAggregatePoint {
  date: Date
  meanCpu: number
  p95Cpu: number
  maxCpu: number
  meanMemory: number
  p95Memory: number
  maxMemory: number
  peakDeviceId?: number
  peakDeviceName?: string
  peakMemoryDeviceId?: number
  peakMemoryDeviceName?: string
}

export interface BaselineMeanPoint {
  date: Date
  meanCpu: number
  meanMemory: number
}

export function normalizeAggregatePoints(
  data: AggregateTrendPoint[],
  windowStart: number,
  windowEnd: number
): NormalizedAggregatePoint[] {
  return data
    .map((pt) => ({
      date: new Date(pt.timestamp),
      meanCpu: pt.mean_cpu,
      p95Cpu: pt.p95_cpu,
      maxCpu: pt.max_cpu,
      meanMemory: pt.mean_memory,
      p95Memory: pt.p95_memory,
      maxMemory: pt.max_memory,
      peakDeviceId: pt.peak_device_id,
      peakDeviceName: pt.peak_device_name,
      peakMemoryDeviceId: pt.peak_memory_device_id,
      peakMemoryDeviceName: pt.peak_memory_device_name,
    }))
    .filter(
      (pt) =>
        !Number.isNaN(pt.date.getTime()) &&
        pt.date.getTime() >= windowStart &&
        pt.date.getTime() <= windowEnd
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

export function computeYesterdayBaselineMeans(
  baseline: SystemPerformanceDataPoint[],
  windowStart: number,
  windowEnd: number
): BaselineMeanPoint[] {
  return baseline
    .map((pt) => {
      const date = new Date(pt.timestamp)
      const vals = Object.values(pt.devices)
      if (Number.isNaN(date.getTime()) || vals.length === 0) return null
      const cpuSum = vals.reduce((acc, item) => acc + item.cpu, 0)
      const memSum = vals.reduce((acc, item) => acc + item.memory, 0)
      return {
        date,
        meanCpu: Math.round((cpuSum / vals.length) * 100) / 100,
        meanMemory: Math.round((memSum / vals.length) * 100) / 100,
      }
    })
    .filter(
      (pt): pt is BaselineMeanPoint =>
        pt !== null &&
        pt.date.getTime() >= windowStart &&
        pt.date.getTime() <= windowEnd
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

export function filterVisibleAnnotations(
  annotations: DashboardAnnotation[] | undefined,
  canReadAlerts: boolean,
  windowStart: number,
  windowEnd: number
): Array<DashboardAnnotation & { date: Date }> {
  if (!annotations || annotations.length === 0) return []
  return annotations
    .filter((ann) => canReadAlerts || ann.type !== 'alert')
    .map((ann) => ({ ...ann, date: new Date(ann.timestamp) }))
    .filter(
      (ann) =>
        !Number.isNaN(ann.date.getTime()) &&
        ann.date.getTime() >= windowStart &&
        ann.date.getTime() <= windowEnd
    )
}

export function annotationColor(type: DashboardAnnotation['type']): string {
  switch (type) {
    case 'alert':
      return 'var(--danger)'
    case 'reboot':
      return 'var(--brand)'
    case 'maintenance':
      return 'var(--info)'
    default:
      return 'var(--warning)'
  }
}

export function annotationLabel(type: DashboardAnnotation['type']): string {
  switch (type) {
    case 'alert':
      return '告警'
    case 'reboot':
      return '重启'
    case 'maintenance':
      return '维护'
    default:
      return '事件'
  }
}

export function splitAggregateSegments(points: NormalizedAggregatePoint[]) {
  return splitAtGaps(points)
}

export function resolvePeakDeviceTarget(
  point: NormalizedAggregatePoint | undefined,
  showCpu: boolean,
  showMemory: boolean
): { deviceId?: number; deviceName?: string } {
  if (!point) return {}
  if (!showCpu && showMemory) {
    return {
      deviceId: point.peakMemoryDeviceId,
      deviceName: point.peakMemoryDeviceName,
    }
  }
  if (point.peakDeviceId !== undefined) {
    return {
      deviceId: point.peakDeviceId,
      deviceName: point.peakDeviceName,
    }
  }
  return {
    deviceId: point.peakMemoryDeviceId,
    deviceName: point.peakMemoryDeviceName ?? point.peakDeviceName,
  }
}
