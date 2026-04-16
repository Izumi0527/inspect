import React, { useState, useEffect, useMemo } from 'react'
import {
  TrendingUp,
  BarChart3,
  Activity,
  Target,
  Calendar,
  Download,
  RefreshCw,
  AlertCircle
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  LineChartComponent,
  AreaChartComponent,
  BarChartComponent,
  PieChartComponent
} from '@/components/atoms'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  useInspectionTrends,
  useInspectionStats,
  useDeviceDistribution,
  useProblemDistribution
} from '../hooks/useInspection'
import { exportAnalyticsReport } from '../api/inspection.api'
import { formatDateYMD } from '@/utils/formatters'
import toast from 'react-hot-toast'

// Tailwind 动态拼接 class 在生产构建可能被裁剪，这里用静态映射确保样式稳定
const METRIC_COLOR_CLASS = {
  blue: { bg100: 'bg-blue-100', text500: 'text-blue-500', text600: 'text-blue-600' },
  green: { bg100: 'bg-green-100', text500: 'text-green-500', text600: 'text-green-600' },
  purple: { bg100: 'bg-purple-100', text500: 'text-purple-500', text600: 'text-purple-600' },
  orange: { bg100: 'bg-orange-100', text500: 'text-orange-500', text600: 'text-orange-600' },
  gray: { bg100: 'bg-gray-100', text500: 'text-gray-500', text600: 'text-gray-600' }
} as const

type MetricColor = keyof typeof METRIC_COLOR_CLASS

const getMetricColorClass = (color?: string) => {
  if (!color) return METRIC_COLOR_CLASS.gray
  return METRIC_COLOR_CLASS[color as MetricColor] ?? METRIC_COLOR_CLASS.gray
}

// 格式化日期为友好的显示格式
const formatDateLabel = (dateStr: string, period: 'day' | 'week' | 'month'): string => {
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    
    switch (period) {
      case 'day':
        // 按天: 显示 MM/DD
        return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`
      case 'week':
        // 按周: 显示 MM/DD (周一)
        return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`
      case 'month':
        // 按月: 显示 YYYY/MM
        return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}`
      default:
        return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`
    }
  } catch {
    return dateStr
  }
}

export const InspectionAnalytics: React.FC = () => {
  const [timePeriod, setTimePeriod] = useState<'day' | 'week' | 'month'>('week')
  const [dateRange, setDateRange] = useState({
    startDate: formatDateYMD(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
    endDate: formatDateYMD(new Date())
  })

  // 根据 timePeriod 自动更新 dateRange
  useEffect(() => {
    const now = new Date()
    const endDate = formatDateYMD(now)
    let startDate: string

    switch (timePeriod) {
      case 'day':
        // 按天显示最近7天数据
        startDate = formatDateYMD(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))
        break
      case 'week':
        // 按周显示最近4周数据
        startDate = formatDateYMD(new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000))
        break
      case 'month':
        // 按月显示最近12个月数据
        startDate = formatDateYMD(new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000))
        break
      default:
        startDate = formatDateYMD(new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000))
    }

    setDateRange({ startDate, endDate })
  }, [timePeriod])

  const analyticsRange = {
    period: timePeriod,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate
  }

  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useInspectionStats(analyticsRange)
  const { data: trends, isLoading: trendsLoading, error: trendsError, refetch: refetchTrends } = useInspectionTrends(analyticsRange)
  const { data: deviceDistribution, isLoading: deviceLoading, error: deviceError, refetch: refetchDevice } = useDeviceDistribution(analyticsRange)
  const { data: problemDistribution, isLoading: problemLoading, error: problemError, refetch: refetchProblem } = useProblemDistribution(analyticsRange)

  // 格式化趋势数据的日期标签
  const formattedTrends = useMemo(() => {
    if (!trends || trends.length === 0) return []
    return trends.map(item => ({
      ...item,
      dateLabel: formatDateLabel(item.date, timePeriod)
    }))
  }, [trends, timePeriod])
  const handlePeriodChange = (value: string) => {
    if (value === 'day' || value === 'week' || value === 'month') {
      setTimePeriod(value)
    }
  }

  // 刷新所有统计数据
  const handleRefreshAll = async () => {
    await Promise.all([
      refetchStats(),
      refetchTrends(),
      refetchDevice(),
      refetchProblem()
    ])
  }

  // 导出分析报告
  const handleExportReport = async () => {
    try {
      toast.loading('正在生成报告...', { id: 'export-report' })

      await exportAnalyticsReport({
        period: timePeriod,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        formatType: 'excel', // 默认导出 Excel 格式
        includeCharts: true
      })

      toast.success('报告已开始下载', { id: 'export-report' })
    } catch (error) {
      console.error('导出报告失败:', error)
      toast.error('导出报告失败,请稍后重试', { id: 'export-report' })
    }
  }

  if (statsLoading || trendsLoading || deviceLoading || problemLoading) {
    return (
      <div className="space-y-6">
        {[...Array(4)].map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const analyticsError = statsError || trendsError || deviceError || problemError
  const comparisonBaselineLabel = {
    day: 'vs 前一日',
    week: 'vs 上周',
    month: 'vs 上月',
  }[timePeriod]

  if (analyticsError) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <AlertCircle className="w-12 h-12 text-red-500" />
            <div>
              <h3 className="text-lg font-medium text-foreground">加载失败</h3>
              <p className="text-muted-foreground mt-1">{analyticsError.message}</p>
            </div>
            <Button variant="outline" onClick={handleRefreshAll}>
              <RefreshCw className="w-4 h-4 mr-2" />
              重试
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* 操作栏 */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div></div>
        <div className="flex gap-2">
          <Select value={timePeriod} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-32" aria-label="巡检分析时间周期">
              <SelectValue placeholder="时间周期" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">按天</SelectItem>
              <SelectItem value="week">按周</SelectItem>
              <SelectItem value="month">按月</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleRefreshAll}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
          <Button variant="outline" onClick={handleExportReport}>
            <Download className="w-4 h-4 mr-2" />
            导出报告
          </Button>
        </div>
      </div>

      {/* KPI 指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          {
            title: '执行次数',
            value: stats?.executionCount ?? stats?.todayExecutions ?? 0,
            change: stats?.changes?.executionsChange || '0.0%',
            trend: 'up',
            icon: Activity,
            color: 'blue'
          },
          {
            title: '成功率',
            value: `${stats?.successRate?.toFixed(1) || 0}%`,
            change: stats?.changes?.successRateChange || '0.0%',
            trend: 'up',
            icon: Target,
            color: 'green'
          },
          {
            title: '平均评分',
            value: stats?.avgScore?.toFixed(1) || 0,
            change: stats?.changes?.avgScoreChange || '0.0%',
            trend: 'up',
            icon: TrendingUp,
            color: 'purple'
          },
          {
            title: '活跃策略',
            value: stats?.activeStrategies || 0,
            change: stats?.changes?.strategiesChange || '0',
            trend: 'up',
            icon: BarChart3,
            color: 'orange'
          }
        ].map((metric) => {
          const colorClass = getMetricColorClass(metric.color)
          return (
            <Card key={metric.title}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{metric.title}</p>
                    <p className="text-2xl font-bold text-foreground mt-2">{metric.value}</p>
                    <div className="flex items-center gap-1 mt-2">
                      <TrendingUp className={`w-4 h-4 ${colorClass.text500}`} />
                      <span className={`text-sm font-medium ${colorClass.text600}`}>
                        {metric.change}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">{comparisonBaselineLabel}</span>
                    </div>
                  </div>
                  <div className={`p-3 ${colorClass.bg100} rounded-lg`}>
                    <metric.icon className={`w-6 h-6 ${colorClass.text600}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* 执行趋势图表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 执行次数趋势 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              执行次数趋势
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AreaChartComponent
              data={formattedTrends}
              xKey="dateLabel"
              areas={[
                { key: 'executions', name: '总执行', color: '#3B82F6' },
                { key: 'success', name: '成功执行', color: '#10B981' }
              ]}
              height={300}
            />
          </CardContent>
        </Card>

        {/* 巡检评分趋势 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-600" />
              巡检评分趋势
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LineChartComponent
              data={formattedTrends}
              xKey="dateLabel"
              lines={[
                { key: 'avgScore', name: '平均评分', color: '#8B5CF6', strokeWidth: 3 }
              ]}
              height={300}
            />
          </CardContent>
        </Card>
      </div>

      {/* 设备分布和问题分析 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 设备类型分布 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-green-600" />
              设备类型分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PieChartComponent
              data={(deviceDistribution || []).map(item => ({
                name: item.name,
                value: item.value,
                color: item.color
              }))}
              height={300}
              innerRadius={60}
              outerRadius={100}
              formatter={(value) => `${value}台`}
            />
          </CardContent>
        </Card>

        {/* 问题分布统计 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-red-600" />
              常见问题分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarChartComponent
              data={problemDistribution || []}
              xKey="category"
              bars={[
                { key: 'count', name: '问题数量', color: '#F59E0B' }
              ]}
              height={300}
            />
          </CardContent>
        </Card>
      </div>

      {/* 详细数据表格 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            最近执行详情
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b dark:border-gray-700">
                  <th className="text-left p-3 dark:text-gray-300">日期</th>
                  <th className="text-left p-3 dark:text-gray-300">执行次数</th>
                  <th className="text-left p-3 dark:text-gray-300">成功率</th>
                  <th className="text-left p-3 dark:text-gray-300">平均评分</th>
                  <th className="text-left p-3 dark:text-gray-300">问题数</th>
                </tr>
              </thead>
              <tbody>
                {formattedTrends.slice(-7).map((item, index) => {
                  // 安全计算成功率，避免除以0
                  const successRate = item.executions > 0 
                    ? (item.success / item.executions * 100) 
                    : 0
                  return (
                  <tr key={index} className="border-b dark:border-gray-700 hover:bg-muted/40">
                    <td className="p-3">{new Date(item.date).toLocaleDateString()}</td>
                    <td className="p-3">{item.executions}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        successRate >= 90
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                          : item.executions === 0
                          ? 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-400'
                          : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400'
                      }`}>
                        {item.executions > 0 ? `${successRate.toFixed(1)}%` : '-'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`font-medium ${
                        item.avgScore >= 90 ? 'text-green-600' :
                        item.avgScore >= 70 ? 'text-yellow-600' : 
                        item.avgScore > 0 ? 'text-red-600' : 'text-gray-400'
                      }`}>
                        {item.avgScore > 0 ? item.avgScore : '-'}
                      </span>
                    </td>
                    <td className="p-3">{item.failed}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
