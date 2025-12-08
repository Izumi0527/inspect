import { useMemo } from 'react'
import { LineChartComponent } from '@/components/atoms/charts'
import type { SystemPerformanceDataPoint } from '../../types'

interface SystemPerformanceChartProps {
  data: SystemPerformanceDataPoint[]
  height?: number
  showLegend?: boolean
  className?: string
}

/**
 * 系统性能趋势图
 *
 * 显示 CPU/内存/网络 三个指标的历史趋势
 * - CPU: 紫色曲线 (0-100%)
 * - 内存: 蓝色曲线 (0-100%)
 * - 网络: 绿色曲线 (Mbps)
 */
export function SystemPerformanceChart({
  data,
  height = 300,
  showLegend = true,
  className,
}: SystemPerformanceChartProps) {
  // 数据转换:将timestamp格式化为更易读的格式
  const chartData = useMemo(() => {
    return data.map((point) => {
      const date = new Date(point.timestamp)
      const timeLabel = date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      })

      return {
        time: timeLabel,
        cpu: point.cpu,
        memory: point.memory,
        network: point.network,
      }
    })
  }, [data])

  // 自定义 tooltip 格式化
  const formatter = (value: number | string, name: string): string => {
    const numValue = Number(value)
    if (name === 'CPU' || name === '内存') {
      return `${numValue.toFixed(1)}%`
    }
    if (name === '网络') {
      return `${numValue.toFixed(1)} Mbps`
    }
    return String(value)
  }

  // 配置3条曲线
  const lines = [
    {
      key: 'cpu' as const,
      name: 'CPU',
      color: '#8B5CF6', // 紫色
      strokeWidth: 2,
    },
    {
      key: 'memory' as const,
      name: '内存',
      color: '#06B6D4', // 青色
      strokeWidth: 2,
    },
    {
      key: 'network' as const,
      name: '网络',
      color: '#10B981', // 绿色
      strokeWidth: 2,
    },
  ]

  // 图例组件
  const Legend = () => (
    <div className="mt-4 flex items-center justify-center gap-6">
      {lines.map((line) => (
        <div key={line.key} className="flex items-center gap-2">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: line.color }}
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">{line.name}</span>
        </div>
      ))}
    </div>
  )

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-gray-500 dark:text-gray-400">暂无性能数据</p>
      </div>
    )
  }

  return (
    <div className={className}>
      <LineChartComponent
        data={chartData}
        xKey="time"
        lines={lines}
        height={height}
        formatter={formatter}
      />
      {showLegend && <Legend />}
    </div>
  )
}
