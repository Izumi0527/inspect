import { useMemo } from 'react'
import { format } from 'date-fns'
import { LineChartComponent } from '@/components/atoms/charts'
import type { SystemPerformanceDataPoint } from '../../types'

interface SystemPerformanceChartProps {
  data: SystemPerformanceDataPoint[]
  height?: number
  showLegend?: boolean
  className?: string
  /** 时间范围（用于 x 轴标签格式优化） */
  timeRange?: string
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
  timeRange,
}: SystemPerformanceChartProps) {
  const showDateOnAxis = useMemo(() => {
    const trimmed = String(timeRange ?? '').trim().toLowerCase()
    const match = /^(\d+)([hdw])$/.exec(trimmed)
    if (!match) return false
    const value = Number.parseInt(match[1], 10)
    const unit = match[2]
    if (!Number.isFinite(value) || value <= 0) return false
    return !(unit === 'h' && value <= 24)
  }, [timeRange])

  const formatTimeLabel = useMemo(() => {
    return (date: Date): string => {
      if (Number.isNaN(date.getTime())) return '-'
      if (!showDateOnAxis) {
        return format(date, 'HH:mm')
      }
      return format(date, 'MM-dd HH:mm')
    }
  }, [showDateOnAxis])

  // 数据转换:将timestamp格式化为更易读的格式
  const chartData = useMemo(() => {
    return data.map((point) => {
      const date = new Date(point.timestamp)
      const timeLabel = formatTimeLabel(date)

      return {
        time: timeLabel,
        cpu: point.cpu,
        memory: point.memory,
        network: point.network,
      }
    })
  }, [data, formatTimeLabel])

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
      color: '#0D9488', // teal-600
      strokeWidth: 2.5,
    },
    {
      key: 'memory' as const,
      name: '内存',
      color: '#0EA5E9', // 天蓝色
      strokeWidth: 2.5,
    },
    {
      key: 'network' as const,
      name: '网络',
      color: '#22C55E', // 绿色
      strokeWidth: 2.5,
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
          <span className="text-sm text-muted-foreground">{line.name}</span>
        </div>
      ))}
    </div>
  )

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-muted-foreground">暂无性能数据</p>
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
