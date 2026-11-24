import { lazy, Suspense } from 'react'
import { ChartSkeleton } from '../charts/ChartSkeleton'
import type { PerformanceMetricKey } from '../charts/PerformanceMetricLegend'
import type {
  SystemPerformanceDataPoint,
  TemperatureDataPoint,
  NetworkTrafficDataPoint,
} from '../../types'
import type { DashboardAnnotation } from '../../types/zabbix-monitoring.types'

/**
 * 懒加载图表组件
 *
 * @description
 * 使用 React.lazy 动态导入图表组件,实现代码分割
 * 每个图表组件将被打包为独立的 chunk,提升首屏加载速度
 */

// 系统性能图表(懒加载)
const LazySystemPerformanceChart = lazy(() =>
  import('../charts/SystemPerformanceChart').then((module) => ({
    default: module.SystemPerformanceChart,
  }))
)

// 温度监控图表(懒加载)
const LazyTemperatureChart = lazy(() =>
  import('../charts/TemperatureChart').then((module) => ({
    default: module.TemperatureChart,
  }))
)

// 接口流量图表(懒加载)
const LazyInterfaceTrafficChart = lazy(() =>
  import('../charts/InterfaceTrafficChart').then((module) => ({
    default: module.InterfaceTrafficChart,
  }))
)

/**
 * 系统性能图表包装器
 */
interface SystemPerformanceChartWrapperProps {
  data: SystemPerformanceDataPoint[]
  height?: number
  /** 时间范围（用于图表 x 轴刻度/标签格式优化） */
  timeRange?: string
  /** 被用户隐藏的指标（由卡片标题右侧的指标图例控制） */
  hiddenMetrics?: ReadonlySet<PerformanceMetricKey>
  annotations?: DashboardAnnotation[]
  canReadAlerts?: boolean
  yesterdayBaseline?: SystemPerformanceDataPoint[]
  compareYesterday?: boolean
  onSelectDevice?: (deviceId: number, deviceName?: string) => void
}

export function SystemPerformanceChartWrapper({
  data,
  height = 300,
  timeRange,
  hiddenMetrics,
  annotations,
  canReadAlerts,
  yesterdayBaseline,
  compareYesterday,
  onSelectDevice,
}: SystemPerformanceChartWrapperProps) {
  return (
    <Suspense fallback={<ChartSkeleton height={height} />}>
      <LazySystemPerformanceChart
        data={data}
        height={height}
        timeRange={timeRange}
        hiddenMetrics={hiddenMetrics}
        annotations={annotations}
        canReadAlerts={canReadAlerts}
        yesterdayBaseline={yesterdayBaseline}
        compareYesterday={compareYesterday}
        onSelectDevice={onSelectDevice}
      />
    </Suspense>
  )
}

/**
 * 温度监控图表包装器
 */
interface TemperatureChartWrapperProps {
  data: TemperatureDataPoint[]
  height?: number
  warnThreshold?: number
  critThreshold?: number
  annotations?: DashboardAnnotation[]
  canReadAlerts?: boolean
  /** 时间范围（用于图表 x 轴刻度/标签格式优化） */
  timeRange?: string
}

export function TemperatureChartWrapper({
  data,
  height = 300,
  warnThreshold,
  critThreshold,
  annotations,
  canReadAlerts,
  timeRange,
}: TemperatureChartWrapperProps) {
  return (
    <Suspense fallback={<ChartSkeleton height={height} />}>
      <LazyTemperatureChart
        data={data}
        height={height}
        warnThreshold={warnThreshold}
        critThreshold={critThreshold}
        annotations={annotations}
        canReadAlerts={canReadAlerts}
        timeRange={timeRange}
      />
    </Suspense>
  )
}

/**
 * 接口流量图表包装器
 */
interface InterfaceTrafficChartWrapperProps {
  data: NetworkTrafficDataPoint[]
  height?: number
  /** 时间范围（用于图表 x 轴刻度/标签格式优化） */
  timeRange?: string
  className?: string
}

export function InterfaceTrafficChartWrapper({
  data,
  height = 280,
  timeRange,
  className,
}: InterfaceTrafficChartWrapperProps) {
  return (
    <Suspense fallback={<ChartSkeleton height={height} />}>
      <LazyInterfaceTrafficChart data={data} height={height} timeRange={timeRange} className={className} />
    </Suspense>
  )
}
