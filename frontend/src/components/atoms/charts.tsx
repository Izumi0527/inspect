import * as React from 'react'
import { motion } from 'framer-motion'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  TooltipProps
} from 'recharts'
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
      'rounded-xl bg-white/80 backdrop-blur-lg border border-gray-200/50 p-6',
      className
    )}
  >
    {(title || actions) && (
      <div className="flex items-center justify-between mb-4">
        <div>
          {title && (
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          )}
          {subtitle && (
            <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
          )}
        </div>
        {actions && <div>{actions}</div>}
      </div>
    )}
    {children}
  </motion.div>
)

// 自定义工具提示组件
const CustomTooltip: React.FC<{
  active?: boolean
  payload?: TooltipProps<number | string, string>['payload']
  label?: string
  formatter?: TooltipFormatter
}> = ({ active, payload, label, formatter }) => {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="bg-white/95 backdrop-blur-lg border border-gray-200/50 rounded-lg p-3 shadow-lg">
      <p className="text-sm font-medium text-gray-900 mb-2">{label}</p>
      {payload.map((entry, index) => (
        entry && (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-600">{entry.name}:</span>
            <span className="font-medium text-gray-900">
              {formatter
                ? formatter(entry.value as number | string, String(entry.name))
                : entry.value}
            </span>
          </div>
        )
      ))}
    </div>
  )
}

// 折线图组件
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
}: LineChartProps<TData>) => (
  <ChartContainer title={title} subtitle={subtitle} className={className}>
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis 
          dataKey={xKey as string} 
          stroke="#6b7280"
          fontSize={12}
        />
        <YAxis stroke="#6b7280" fontSize={12} />
        <Tooltip content={<CustomTooltip formatter={formatter} />} />
        <Legend />
        {lines.map((line, index) => {
          const lineKey = String(line.key)
          return (
            <Line
              key={lineKey}
              type="monotone"
              dataKey={lineKey}
              name={line.name || lineKey}
              stroke={line.color || `hsl(${index * 60}, 70%, 50%)`}
              strokeWidth={line.strokeWidth || 2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          )
        })}
      </LineChart>
    </ResponsiveContainer>
  </ChartContainer>
)

// 面积图组件
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
}: AreaChartProps<TData>) => (
  <ChartContainer title={title} subtitle={subtitle} className={className}>
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          {areas.map((area, index) => {
            const areaKey = String(area.key)
            const color = area.color || `hsl(${index * 60}, 70%, 50%)`
            return (
              <linearGradient key={areaKey} id={`gradient-${areaKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={color} stopOpacity={0}/>
              </linearGradient>
            )
          })}
        </defs>
        <XAxis dataKey={xKey as string} stroke="#6b7280" fontSize={12} />
        <YAxis stroke="#6b7280" fontSize={12} />
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <Tooltip content={<CustomTooltip formatter={formatter} />} />
        <Legend />
        {areas.map((area, index) => {
          const areaKey = String(area.key)
          return (
            <Area
              key={areaKey}
              type="monotone"
              dataKey={areaKey}
              name={area.name || areaKey}
              stackId={area.stackId}
              stroke={area.color || `hsl(${index * 60}, 70%, 50%)`}
              fill={`url(#gradient-${areaKey})`}
            />
          )
        })}
      </AreaChart>
    </ResponsiveContainer>
  </ChartContainer>
)

// 柱状图组件
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
}: BarChartProps<TData>) => (
  <ChartContainer title={title} subtitle={subtitle} className={className}>
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey={xKey as string} stroke="#6b7280" fontSize={12} />
        <YAxis stroke="#6b7280" fontSize={12} />
        <Tooltip content={<CustomTooltip formatter={formatter} />} />
        <Legend />
        {bars.map((bar, index) => {
          const barKey = String(bar.key)
          return (
            <Bar
              key={barKey}
              dataKey={barKey}
              name={bar.name || barKey}
              stackId={bar.stackId}
              fill={bar.color || `hsl(${index * 60}, 70%, 50%)`}
              radius={[2, 2, 0, 0]}
            />
          )
        })}
      </BarChart>
    </ResponsiveContainer>
  </ChartContainer>
)

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
}

export const PieChartComponent: React.FC<PieChartProps> = ({
  data,
  height = 300,
  title,
  subtitle,
  className,
  formatter,
  innerRadius = 0,
  outerRadius = 80
}) => {
  const colors = ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#8B5A2B']
  
  const dataWithColors = data.map((item, index) => ({
    ...item,
    color: item.color || colors[index % colors.length]
  }))

  return (
    <ChartContainer title={title} subtitle={subtitle} className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={dataWithColors}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            dataKey="value"
          >
            {dataWithColors.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip formatter={formatter} />} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}

// 环形进度条组件
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
              <div className="text-2xl font-bold text-gray-900">
                {Math.round(percentage)}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </ChartContainer>
  )
}

// 实时监控仪表盘
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
        'rounded-xl bg-white/80 backdrop-blur-lg border border-gray-200/50 p-6',
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-600">{title}</h3>
        <div className={cn('w-2 h-2 rounded-full', colorClasses[color as keyof typeof colorClasses])} />
      </div>
      <div className="flex items-baseline justify-between">
        <div>
          <span className="text-2xl font-bold text-gray-900">{value}</span>
          {unit && <span className="text-sm text-gray-600 ml-1">{unit}</span>}
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
