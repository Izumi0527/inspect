import { lazy, Suspense } from 'react'
import { ChartSkeleton } from '../charts/ChartSkeleton'
import type { PerformanceMetricKey } from '../charts/PerformanceMetricLegend'
import type {
  SystemPerformanceDataPoint,
  TemperatureDataPoint,
  NetworkTrafficDataPoint,
} from '../../types'

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
}

export function SystemPerformanceChartWrapper({
  data,
  height = 300,
  timeRange,
  hiddenMetrics,
}: SystemPerformanceChartWrapperProps) {
  return (
    <Suspense fallback={<ChartSkeleton height={height} />}>
      <LazySystemPerformanceChart
        data={data}
        height={height}
        timeRange={timeRange}
        hiddenMetrics={hiddenMetrics}
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
  temperatureThreshold?: number
  /** 时间范围（用于图表 x 轴刻度/标签格式优化） */
  timeRange?: string
}

export function TemperatureChartWrapper({
  data,
  height = 300,
  temperatureThreshold = 75,
  timeRange,
}: TemperatureChartWrapperProps) {
  return (
    <Suspense fallback={<ChartSkeleton height={height} />}>
      <LazyTemperatureChart
        data={data}
        height={height}
        temperatureThreshold={temperatureThreshold}
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
