import { useMemo } from 'react'
import { format } from 'date-fns'
import { LineChartComponent } from '@/components/atoms/charts'
import type { TemperatureDataPoint } from '../../types'

interface TemperatureChartProps {
  data: TemperatureDataPoint[]
  height?: number
  showLegend?: boolean
  className?: string
  temperatureThreshold?: number // 温度阈值,超过此值高亮显示
  /** 时间范围（用于 x 轴标签格式优化） */
  timeRange?: string
}

/**
 * 设备温度监控图
 *
 * 显示多个设备的温度变化趋势
 * - 自动为每个设备分配不同颜色
 * - 超过阈值的温度点会高亮显示
 * - 支持最多显示5个设备(避免图表过于拥挤)
 */
export function TemperatureChart({
  data,
  height = 300,
  showLegend = true,
  className,
  temperatureThreshold = 75, // 默认75°C为阈值
  timeRange,
}: TemperatureChartProps) {
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

  // 预定义的设备颜色 - 更鲜艳的配色
  const deviceColors = [
    '#8B5CF6', // 紫色
    '#0EA5E9', // 天蓝色
    '#22C55E', // 绿色
    '#F59E0B', // 橙色
    '#EF4444', // 红色
  ]

  // 数据转换:将时间戳和设备温度展平
  const { chartData, deviceNames } = useMemo(() => {
    if (data.length === 0) {
      return { chartData: [], deviceNames: [] }
    }

    // 获取所有设备名称
    const allDeviceNames = Array.from(
      new Set(data.flatMap((point) => Object.keys(point.devices)))
    )

    // 限制最多显示5个设备
    const limitedDeviceNames = allDeviceNames.slice(0, 5)

    // 转换数据格式
    const transformed = data.map((point) => {
      const date = new Date(point.timestamp)
      const timeLabel = formatTimeLabel(date)

      const dataPoint: Record<string, string | number> = {
        time: timeLabel,
      }

      // 为每个设备添加温度数据
      limitedDeviceNames.forEach((deviceName) => {
        dataPoint[deviceName] = point.devices[deviceName] || 0
      })

      return dataPoint
    })

    return {
      chartData: transformed,
      deviceNames: limitedDeviceNames,
    }
  }, [data, formatTimeLabel])

  // 配置设备温度曲线
  const lines = useMemo(() => {
    return deviceNames.map((deviceName, index) => ({
      key: deviceName,
      name: deviceName,
      color: deviceColors[index % deviceColors.length],
      strokeWidth: 2.5,
    }))
  }, [deviceNames])

  // 自定义 tooltip 格式化
  const formatter = (value: number | string, _name: string): string => {
    const numValue = Number(value)
    const tempStr = `${numValue.toFixed(1)}°C`

    // 如果超过阈值,添加警告标识
    if (numValue >= temperatureThreshold) {
      return `${tempStr} [!]`
    }

    return tempStr
  }

  // 图例组件
  const Legend = () => (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
      {lines.map((line) => {
        // 检查该设备是否有温度超过阈值
        const hasHighTemp = chartData.some(
          (d) => Number(d[line.key]) >= temperatureThreshold
        )

        return (
          <div key={line.key} className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: line.color }} />
            <span className="text-sm text-muted-foreground">
              {line.name}
              {hasHighTemp && <span className="ml-1 text-xs font-semibold text-orange-500">[!]</span>}
            </span>
          </div>
        )
      })}
      {deviceNames.length === 5 && (
        <div className="mt-1 w-full text-center">
          <span className="text-xs text-muted-foreground">
            (最多显示5个设备)
          </span>
        </div>
      )}
    </div>
  )

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-muted-foreground">暂无温度数据</p>
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

      {/* 温度阈值提示 */}
      <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <span>温度阈值:</span>
          <span className="font-medium">{temperatureThreshold}°C</span>
        </div>
        <span>·</span>
        <div className="flex items-center gap-1">
          <span className="font-semibold text-orange-500">[!]</span>
          <span>超阈值警告</span>
        </div>
      </div>
    </div>
  )
}
