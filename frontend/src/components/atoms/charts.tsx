'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Group } from '@visx/group'
import { Bar as VisxBar } from '@visx/shape'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridRows, GridColumns } from '@visx/grid'
import { scaleBand, scaleLinear } from '@visx/scale'
import { LinePath, Pie as VisxPie } from '@visx/shape'
import { curveMonotoneX } from '@visx/curve'
import { localPoint } from '@visx/event'
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip'
import { cn } from '@/utils/cn'

type ChartDatum = Record<string, string | number | null | undefined>
type TooltipFormatter = (value: number | string, name: string) => string

// 通用图表容器
interface ChartContainerProps {
  title?: string
  subtitle?: string
  className?: string
  children: React.ReactNode
  actions?: React.ReactNode
}

export const ChartContainer: React.FC<ChartContainerProps> = ({
  title,
  subtitle,
  className,
  children,
  actions
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={cn(
      'rounded-xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border border-gray-200/50 dark:border-gray-700/50 p-6',
      className
    )}
  >
    {(title || actions) && (
      <div className="flex items-center justify-between mb-4">
        <div>
          {title && (
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          )}
          {subtitle && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{subtitle}</p>
          )}
        </div>
        {actions && <div>{actions}</div>}
      </div>
    )}
    {children}
  </motion.div>
)

// 折线图组件
interface LineChartProps<TData extends ChartDatum> {
  data: TData[]
  xKey: keyof TData
  lines: Array<{
    key: keyof TData
    name?: string
    color?: string
    strokeWidth?: number
  }>
  height?: number
  title?: string
  subtitle?: string
  className?: string
  formatter?: TooltipFormatter
}

export const LineChartComponent = <TData extends ChartDatum>({
  data,
  xKey,
  lines,
  height = 300,
  title,
  subtitle,
  className,
  formatter
}: LineChartProps<TData>) => {
  // 容器引用和宽度状态 - 响应式宽度
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [width, setWidth] = React.useState(800)

  // 监听容器宽度变化
  React.useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setWidth(containerRef.current.clientWidth)
      }
    }

    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  const margin = { top: 20, right: 30, bottom: 40, left: 50 }
  const innerWidth = Math.max(width - margin.left - margin.right, 100)
  const innerHeight = height - margin.top - margin.bottom

  // 深色模式检测
  const isDark = typeof window !== 'undefined' && document.documentElement.classList.contains('dark')
  const gridColor = isDark ? '#374151' : '#e5e7eb'
  const axisColor = isDark ? '#9CA3AF' : '#6b7280'
  const tooltipBg = isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)'
  const tooltipBorder = isDark ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 0.5)'

  const {
    showTooltip,
    hideTooltip,
    tooltipData,
    tooltipLeft = 0,
    tooltipTop = 0,
  } = useTooltip<{ x: string; values: Array<{ name: string; value: number; color: string }> }>()

  // Scales
  const xScale = scaleBand({
    domain: data.map(d => String(d[xKey])),
    range: [0, innerWidth],
    padding: 0.1,
  })

  const allValues = lines.flatMap(line =>
    data.map(d => Number(d[line.key]) || 0)
  )
  // 确保 yScale 的最大值至少为 1，避免所有数据为 0 时图表无法显示
  const maxValue = Math.max(...allValues, 1)
  const yScale = scaleLinear({
    domain: [0, maxValue * 1.1],
    range: [innerHeight, 0],
  })

  const handleMouseMove = (event: React.MouseEvent<SVGRectElement>, datum: TData) => {
    const point = localPoint(event)
    if (!point) return

    const values = lines.map(line => ({
      name: line.name || String(line.key),
      value: Number(datum[line.key]) || 0,
      color: line.color || '#8B5CF6'
    }))

    showTooltip({
      tooltipData: { x: String(datum[xKey]), values },
      tooltipLeft: point.x,
      tooltipTop: point.y,
    })
  }

  // 如果没有数据，显示空状态提示
  if (!data || data.length === 0) {
    return (
      <ChartContainer title={title} subtitle={subtitle} className={className}>
        <div 
          ref={containerRef} 
          style={{ 
            position: 'relative', 
            width: '100%', 
            height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <p className="text-gray-400 dark:text-gray-500 text-sm">暂无数据</p>
        </div>
      </ChartContainer>
    )
  }

  return (
    <ChartContainer title={title} subtitle={subtitle} className={className}>
      <div ref={containerRef} style={{ position: 'relative', width: '100%', height }}>
        <svg width={width} height={height} style={{ display: 'block' }}>
          <Group left={margin.left} top={margin.top}>
            <GridRows scale={yScale} width={innerWidth} stroke={gridColor} strokeDasharray="3,3" />
            <GridColumns scale={xScale} height={innerHeight} stroke={gridColor} strokeDasharray="3,3" />

            {lines.map((line, idx) => {
              const lineKey = String(line.key)
              const color = line.color || `hsl(${idx * 60}, 70%, 50%)`

              return (
                <LinePath
                  key={lineKey}
                  data={data}
                  x={(d) => (xScale(String(d[xKey])) || 0) + xScale.bandwidth() / 2}
                  y={(d) => yScale(Number(d[line.key]) || 0)}
                  stroke={color}
                  strokeWidth={line.strokeWidth || 2}
                  curve={curveMonotoneX}
                />
              )
            })}

            {/* Invisible rects for hover */}
            {data.map((datum, i) => (
              <rect
                key={i}
                x={xScale(String(datum[xKey]))}
                y={0}
                width={xScale.bandwidth()}
                height={innerHeight}
                fill="transparent"
                onMouseMove={(e) => handleMouseMove(e, datum)}
                onMouseLeave={hideTooltip}
              />
            ))}

            <AxisBottom
              top={innerHeight}
              scale={xScale}
              stroke={axisColor}
              tickStroke={axisColor}
              tickLabelProps={() => ({ fill: axisColor, fontSize: 12, textAnchor: 'middle' })}
            />
            <AxisLeft
              scale={yScale}
              stroke={axisColor}
              tickStroke={axisColor}
              tickLabelProps={() => ({ fill: axisColor, fontSize: 12, textAnchor: 'end', dx: -4 })}
            />
          </Group>
        </svg>

        {tooltipData && (
          <TooltipWithBounds
            key={Math.random()}
            top={tooltipTop}
            left={tooltipLeft}
            style={{
              ...defaultStyles,
              background: tooltipBg,
              backdropFilter: 'blur(10px)',
              border: `1px solid ${tooltipBorder}`,
              borderRadius: '8px',
              padding: '12px',
            }}
          >
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">{tooltipData.x}</p>
            {tooltipData.values.map((entry, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-gray-600 dark:text-gray-400">{entry.name}:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {formatter ? formatter(entry.value, entry.name) : entry.value}
                </span>
              </div>
            ))}
          </TooltipWithBounds>
        )}
      </div>
    </ChartContainer>
  )
}

// 面积图组件
interface AreaChartProps<TData extends ChartDatum> {
  data: TData[]
  xKey: keyof TData
  areas: Array<{
    key: keyof TData
    name?: string
    color?: string
    stackId?: string
  }>
  height?: number
  title?: string
  subtitle?: string
  className?: string
  formatter?: TooltipFormatter
}

export const AreaChartComponent = <TData extends ChartDatum>({
  data,
  xKey,
  areas,
  height = 300,
  title,
  subtitle,
  className,
  formatter
}: AreaChartProps<TData>) => {
  // 简化实现：使用 LineChart 的逻辑但填充区域
  return (
    <LineChartComponent
      data={data}
      xKey={xKey}
      lines={areas.map(area => ({
        key: area.key,
        name: area.name,
        color: area.color,
        strokeWidth: 2
      }))}
      height={height}
      title={title}
      subtitle={subtitle}
      className={className}
      formatter={formatter}
    />
  )
}

// 柱状图组件
interface BarChartProps<TData extends ChartDatum> {
  data: TData[]
  xKey: keyof TData
  bars: Array<{
    key: keyof TData
    name?: string
    color?: string
    stackId?: string
  }>
  height?: number
  title?: string
  subtitle?: string
  className?: string
  formatter?: TooltipFormatter
}

export const BarChartComponent = <TData extends ChartDatum>({
  data,
  xKey,
  bars,
  height = 300,
  title,
  subtitle,
  className,
  formatter
}: BarChartProps<TData>) => {
  // 容器引用和宽度状态 - 响应式宽度
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [width, setWidth] = React.useState(800)

  // 监听容器宽度变化
  React.useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setWidth(containerRef.current.clientWidth)
      }
    }

    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  const margin = { top: 20, right: 30, bottom: 40, left: 50 }
  const innerWidth = Math.max(width - margin.left - margin.right, 100)
  const innerHeight = height - margin.top - margin.bottom

  // 深色模式检测
  const isDark = typeof window !== 'undefined' && document.documentElement.classList.contains('dark')
  const gridColor = isDark ? '#374151' : '#e5e7eb'
  const axisColor = isDark ? '#9CA3AF' : '#6b7280'
  const tooltipBg = isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)'
  const tooltipBorder = isDark ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 0.5)'

  const {
    showTooltip,
    hideTooltip,
    tooltipData,
    tooltipLeft = 0,
    tooltipTop = 0,
  } = useTooltip<{ x: string; values: Array<{ name: string; value: number; color: string }> }>()

  // 如果没有数据，显示空状态提示
  if (!data || data.length === 0) {
    return (
      <ChartContainer title={title} subtitle={subtitle} className={className}>
        <div 
          ref={containerRef} 
          style={{ 
            position: 'relative', 
            width: '100%', 
            height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <p className="text-gray-400 dark:text-gray-500 text-sm">暂无数据</p>
        </div>
      </ChartContainer>
    )
  }

  const xScale = scaleBand({
    domain: data.map(d => String(d[xKey])),
    range: [0, innerWidth],
    padding: 0.3,
  })

  const allValues = bars.flatMap(bar =>
    data.map(d => Number(d[bar.key]) || 0)
  )
  const yScale = scaleLinear({
    domain: [0, Math.max(...allValues) * 1.1],
    range: [innerHeight, 0],
  })

  const barWidth = xScale.bandwidth() / bars.length

  return (
    <ChartContainer title={title} subtitle={subtitle} className={className}>
      <div ref={containerRef} style={{ position: 'relative', width: '100%', height }}>
        <svg width={width} height={height} style={{ display: 'block' }}>
          <Group left={margin.left} top={margin.top}>
            <GridRows scale={yScale} width={innerWidth} stroke={gridColor} strokeDasharray="3,3" />

            {data.map((datum, i) => {
              const x = xScale(String(datum[xKey])) || 0

              return bars.map((bar, barIdx) => {
                const barKey = String(bar.key)
                const barValue = Number(datum[bar.key]) || 0
                const barColor = bar.color || `hsl(${barIdx * 60}, 70%, 50%)`

                return (
                  <VisxBar
                    key={`${i}-${barKey}`}
                    x={x + barIdx * barWidth}
                    y={yScale(barValue)}
                    width={barWidth}
                    height={innerHeight - yScale(barValue)}
                    fill={barColor}
                    rx={2}
                    onMouseMove={(e) => {
                      const point = localPoint(e)
                      if (!point) return

                      showTooltip({
                        tooltipData: {
                          x: String(datum[xKey]),
                          values: [{ name: bar.name || barKey, value: barValue, color: barColor }]
                        },
                        tooltipLeft: point.x,
                        tooltipTop: point.y,
                      })
                    }}
                    onMouseLeave={hideTooltip}
                  />
                )
              })
            })}

            <AxisBottom
              top={innerHeight}
              scale={xScale}
              stroke={axisColor}
              tickStroke={axisColor}
              tickLabelProps={() => ({ fill: axisColor, fontSize: 12, textAnchor: 'middle' })}
            />
            <AxisLeft
              scale={yScale}
              stroke={axisColor}
              tickStroke={axisColor}
              tickLabelProps={() => ({ fill: axisColor, fontSize: 12, textAnchor: 'end', dx: -4 })}
            />
          </Group>
        </svg>

        {tooltipData && (
          <TooltipWithBounds
            key={Math.random()}
            top={tooltipTop}
            left={tooltipLeft}
            style={{
              ...defaultStyles,
              background: tooltipBg,
              backdropFilter: 'blur(10px)',
              border: `1px solid ${tooltipBorder}`,
              borderRadius: '8px',
              padding: '12px',
            }}
          >
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">{tooltipData.x}</p>
            {tooltipData.values.map((entry, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-gray-600 dark:text-gray-400">{entry.name}:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {formatter ? formatter(entry.value, entry.name) : entry.value}
                </span>
              </div>
            ))}
          </TooltipWithBounds>
        )}
      </div>
    </ChartContainer>
  )
}

// 饼图组件
interface PieChartProps {
  data: Array<{ name: string; value: number; color?: string }>
  height?: number
  title?: string
  subtitle?: string
  className?: string
  formatter?: TooltipFormatter
  innerRadius?: number
  outerRadius?: number
  showLegend?: boolean
}

export const PieChartComponent: React.FC<PieChartProps> = ({
  data,
  height = 300,
  title,
  subtitle,
  className,
  formatter,
  innerRadius = 0,
  outerRadius = 80,
  showLegend = true
}) => {
  const colors = ['#8B5CF6', '#0EA5E9', '#22C55E', '#F59E0B', '#EF4444', '#EC4899']

  const dataWithColors = data.map((item, index) => ({
    ...item,
    color: item.color || colors[index % colors.length]
  }))

  // 计算总值用于百分比显示
  const total = dataWithColors.reduce((sum, item) => sum + item.value, 0)

  // 深色模式检测
  const isDark = typeof window !== 'undefined' && document.documentElement.classList.contains('dark')
  const tooltipBg = isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)'
  const tooltipBorder = isDark ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 0.5)'

  const {
    showTooltip,
    hideTooltip,
    tooltipData,
    tooltipLeft = 0,
    tooltipTop = 0,
  } = useTooltip<{ name: string; value: number; color: string }>()

  // 如果没有数据，显示空状态
  if (!data || data.length === 0 || total === 0) {
    return (
      <ChartContainer title={title} subtitle={subtitle} className={className}>
        <div 
          style={{ 
            position: 'relative', 
            width: '100%', 
            height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <p className="text-gray-400 dark:text-gray-500 text-sm">暂无数据</p>
        </div>
      </ChartContainer>
    )
  }

  // 计算图表和图例的布局
  const chartWidth = showLegend ? 200 : 300
  const centerX = chartWidth / 2
  const centerY = height / 2

  return (
    <ChartContainer title={title} subtitle={subtitle} className={className}>
      <div style={{ position: 'relative', width: '100%', height, display: 'flex', alignItems: 'center' }}>
        {/* 饼图区域 */}
        <div style={{ flex: showLegend ? '0 0 200px' : '1', display: 'flex', justifyContent: 'center' }}>
          <svg width={chartWidth} height={height}>
            <Group top={centerY} left={centerX}>
              <VisxPie
                data={dataWithColors}
                pieValue={(d) => d.value}
                outerRadius={outerRadius}
                innerRadius={innerRadius}
                padAngle={0.03}
              >
                {(pie) =>
                  pie.arcs.map((arc, i) => {
                    const { name, value, color } = arc.data
                    return (
                      <g
                        key={`pie-arc-${i}`}
                        onMouseMove={(e) => {
                          const point = localPoint(e)
                          if (!point) return
                          showTooltip({
                            tooltipData: { name, value, color },
                            tooltipLeft: point.x,
                            tooltipTop: point.y,
                          })
                        }}
                        onMouseLeave={hideTooltip}
                      >
                        <path d={pie.path(arc) || ''} fill={color} />
                      </g>
                    )
                  })
                }
              </VisxPie>
            </Group>
          </svg>
        </div>

        {/* 图例区域 */}
        {showLegend && (
          <div style={{ flex: 1, paddingLeft: '16px', overflow: 'auto', maxHeight: height }}>
            <div className="space-y-2">
              {dataWithColors.map((item, index) => {
                const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0'
                return (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-gray-700 dark:text-gray-300 truncate flex-1" title={item.name}>
                      {item.name}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">
                      {formatter ? formatter(item.value, item.name) : item.value}
                    </span>
                    <span className="text-gray-400 dark:text-gray-500 flex-shrink-0 text-xs">
                      ({percentage}%)
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tooltipData && (
          <TooltipWithBounds
            key={Math.random()}
            top={tooltipTop}
            left={tooltipLeft}
            style={{
              ...defaultStyles,
              background: tooltipBg,
              backdropFilter: 'blur(10px)',
              border: `1px solid ${tooltipBorder}`,
              borderRadius: '8px',
              padding: '12px',
            }}
          >
            <div className="flex items-center gap-2 text-sm">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: tooltipData.color }}
              />
              <span className="text-gray-600 dark:text-gray-400">{tooltipData.name}:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {formatter ? formatter(tooltipData.value, tooltipData.name) : tooltipData.value}
              </span>
            </div>
          </TooltipWithBounds>
        )}
      </div>
    </ChartContainer>
  )
}

// 环形进度条组件（保持不变，不依赖图表库）
interface CircularProgressProps {
  percentage: number
  size?: number
  strokeWidth?: number
  color?: string
  bgColor?: string
  title?: string
  subtitle?: string
  className?: string
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  percentage,
  size = 120,
  strokeWidth = 8,
  color = '#8B5CF6',
  bgColor = '#E5E7EB',
  title,
  subtitle,
  className
}) => {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const strokeDasharray = `${circumference} ${circumference}`
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  return (
    <ChartContainer title={title} subtitle={subtitle} className={className}>
      <div className="flex items-center justify-center">
        <div className="relative">
          <svg
            className="transform -rotate-90"
            width={size}
            height={size}
          >
            {/* 背景圆环 */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={bgColor}
              strokeWidth={strokeWidth}
              fill="none"
            />
            {/* 进度圆环 */}
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={strokeDasharray}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1, ease: "easeInOut" }}
              strokeLinecap="round"
            />
          </svg>
          {/* 中心文字 */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {Math.round(percentage)}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </ChartContainer>
  )
}

// 实时监控仪表盘（保持不变）
interface MetricCardProps {
  title: string
  value: string | number
  unit?: string
  trend?: 'up' | 'down' | 'stable'
  trendValue?: string | number
  color?: string
  className?: string
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  unit,
  trend,
  trendValue,
  color = 'purple',
  className
}) => {
  const colorClasses = {
    purple: 'text-purple-600 bg-purple-100',
    blue: 'text-blue-600 bg-blue-100',
    green: 'text-green-600 bg-green-100',
    yellow: 'text-yellow-600 bg-yellow-100',
    red: 'text-red-600 bg-red-100',
  }

  const trendColors = {
    up: 'text-green-600',
    down: 'text-red-600',
    stable: 'text-gray-600'
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'rounded-xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border border-gray-200/50 dark:border-gray-700/50 p-6',
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</h3>
        <div className={cn('w-2 h-2 rounded-full', colorClasses[color as keyof typeof colorClasses])} />
      </div>
      <div className="flex items-baseline justify-between">
        <div>
          <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</span>
          {unit && <span className="text-sm text-gray-600 dark:text-gray-400 ml-1">{unit}</span>}
        </div>
        {trend && trendValue && (
          <div className={cn('text-sm font-medium', trendColors[trend])}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
          </div>
        )}
      </div>
    </motion.div>
  )
}
