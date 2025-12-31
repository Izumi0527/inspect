import { useMemo } from 'react'
import { PieChartComponent } from '@/components/atoms/charts'
import type { DeviceStatusDistribution } from '../../types'

interface DeviceStatusPieChartProps {
  data: DeviceStatusDistribution
  height?: number
  className?: string
  showLegend?: boolean
}

/**
 * 设备状态分布饼图
 *
 * 以饼图形式展示设备健康状态分布
 * - 健康: 绿色
 * - 警告: 黄色
 * - 严重: 红色
 * - 离线: 灰色
 */
export function DeviceStatusPieChart({
  data,
  height = 300,
  className,
  showLegend = true,
}: DeviceStatusPieChartProps) {
  // 转换数据格式并添加颜色
  const chartData = useMemo(() => {
    const statusConfig = [
      { key: 'healthy', label: '健康', color: '#22C55E' }, // 鲜绿色
      { key: 'warning', label: '警告', color: '#F59E0B' }, // 橙色
      { key: 'critical', label: '严重', color: '#EF4444' }, // 红色
      { key: 'offline', label: '离线', color: '#6B7280' }, // 灰色
    ]

    return statusConfig
      .map(({ key, label, color }) => ({
        name: label,
        value: data[key as keyof DeviceStatusDistribution],
        color,
      }))
      .filter((item) => item.value > 0) // 过滤掉数量为0的状态
  }, [data])

  // 计算总数和百分比
  const total = useMemo(() => {
    return chartData.reduce((sum, item) => sum + item.value, 0)
  }, [chartData])

  // 自定义 tooltip 格式化
  const formatter = (value: number | string, _name: string): string => {
    const numValue = Number(value)
    const percentage = total > 0 ? ((numValue / total) * 100).toFixed(1) : '0.0'
    return `${numValue} (${percentage}%)`
  }

  // 图例组件
  const Legend = () => (
    <div className="mt-4 grid grid-cols-2 gap-2">
      {chartData.map((item) => {
        const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0'
        return (
          <div key={item.name} className="flex items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-gray-600 dark:text-gray-400">{item.name}</span>
            </div>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {item.value} <span className="text-xs text-gray-500">({percentage}%)</span>
            </span>
          </div>
        )
      })}
    </div>
  )

  // 总数摘要
  const Summary = () => (
    <div className="mb-4 flex items-center justify-center">
      <div className="text-center">
        <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{total}</div>
        <div className="text-sm text-gray-500 dark:text-gray-400">设备总数</div>
      </div>
    </div>
  )

  if (total === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-gray-500 dark:text-gray-400">暂无设备数据</p>
      </div>
    )
  }

  return (
    <div className={className}>
      <Summary />
      <PieChartComponent
        data={chartData}
        height={height}
        formatter={formatter}
        innerRadius={60} // 环形图
        outerRadius={100}
      />
      {showLegend && <Legend />}
    </div>
  )
}
