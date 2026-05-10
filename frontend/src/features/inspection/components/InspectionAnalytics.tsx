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
import { SharedSelect } from '@/components/atoms/shared-select'
import { CompactPageToolbar, CompactStatCard } from '@/components/shared'
import {
  useInspectionTrends,
  useInspectionStats,
  useDeviceDistribution,
  useProblemDistribution
} from '../hooks/useInspection'
import type { InspectionExecution } from '../types'
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

const TIME_PERIOD_OPTIONS = [
  { value: 'day', label: '按天' },
  { value: 'week', label: '按周' },
  { value: 'month', label: '按月' },
] as const

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

const formatExecutionDate = (dateTime?: string): string => {
  if (!dateTime) return '-'
  const date = new Date(dateTime)
  if (Number.isNaN(date.getTime())) return dateTime
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

const formatExecutionTime = (dateTime?: string): string => {
  if (!dateTime) return '-'
  const date = new Date(dateTime)
  if (Number.isNaN(date.getTime())) return dateTime
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

const formatExecutionDuration = (duration?: number): string => {
  if (!duration || duration <= 0) return '-'
  const minutes = Math.floor(duration / 60)
  const seconds = duration % 60
  return `${minutes}分${seconds}秒`
}

const getExecutionStatusMeta = (status: InspectionExecution['status']) => {
  switch (status) {
    case 'completed':
      return {
        label: '已完成',
        className: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400',
      }
    case 'failed':
      return {
        label: '失败',
        className: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400',
      }
    case 'cancelled':
      return {
        label: '已取消',
        className: 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-400',
      }
    case 'running':
      return {
        label: '执行中',
        className: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400',
      }
    default:
      return {
        label: '等待中',
        className: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400',
      }
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

  const recentExecutions = useMemo(
    () => (stats?.recentExecutions ?? []).filter(item => !!item.endTime).slice(0, 7),
    [stats?.recentExecutions]
  )
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
        formatType: 'pdf',
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
      <CompactPageToolbar
        testIdPrefix="inspection-analytics-toolbar"
        customActions={(
          <SharedSelect
            value={timePeriod}
            onChange={handlePeriodChange}
            options={TIME_PERIOD_OPTIONS}
            ariaLabel="巡检分析时间周期"
            placeholder="时间周期"
            triggerClassName="w-32 h-9 rounded-lg px-3 border-border bg-card"
          />
        )}
        secondaryActions={[
          {
            key: 'refresh-analytics',
            label: '刷新',
            icon: <RefreshCw className="w-4 h-4" />,
            variant: 'outline',
            onClick: () => {
              void handleRefreshAll()
            },
          },
        ]}
        primaryActions={[
          {
            key: 'export-analytics',
            label: '导出报告',
            icon: <Download className="w-4 h-4" />,
            variant: 'outline',
            onClick: () => {
              void handleExportReport()
            },
          },
        ]}
      />

      {/* KPI 指标卡片 */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
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
            <CompactStatCard
              key={metric.title}
              title={metric.title}
              value={metric.value}
              change={metric.change}
              changeHint={comparisonBaselineLabel}
              trend="up"
              icon={metric.icon}
              iconClassName={colorClass.text600}
              iconBgClassName={`${colorClass.bg100} dark:bg-transparent`}
              valueClassName={colorClass.text600}
            />
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
                  <th className="text-left p-3 dark:text-gray-300">完成时间</th>
                  <th className="text-left p-3 dark:text-gray-300">策略名称</th>
                  <th className="text-left p-3 dark:text-gray-300">执行状态</th>
                  <th className="text-left p-3 dark:text-gray-300">巡检评分</th>
                  <th className="text-left p-3 dark:text-gray-300">问题情况</th>
                </tr>
              </thead>
              <tbody>
                {recentExecutions.length === 0 ? (
                  <tr>
                    <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                      当前筛选范围内暂无已完成的执行记录
                    </td>
                  </tr>
                ) : (
                  recentExecutions.map((item) => {
                    const statusMeta = getExecutionStatusMeta(item.status)
                    const issueCount = item.summary.failedChecks + item.summary.warningChecks
                    return (
                      <tr key={item.id} className="border-b dark:border-gray-700 hover:bg-muted/40">
                        <td className="p-3">
                          <div className="font-medium text-foreground">{formatExecutionDate(item.endTime)}</div>
                          <div className="text-xs text-muted-foreground">{formatExecutionTime(item.endTime)}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            耗时: {formatExecutionDuration(item.duration)}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-foreground">{item.strategyName || '-'}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {item.triggerType === 'scheduled' ? '定时触发' : '手动触发'}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${statusMeta.className}`}>
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className={`font-medium ${
                            item.summary.score >= 90 ? 'text-green-600' :
                            item.summary.score >= 70 ? 'text-yellow-600' :
                            'text-red-600'
                          }`}>
                            {item.summary.score.toFixed(1)}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            通过 {item.summary.passedChecks}/{item.summary.totalChecks}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className={`font-medium ${issueCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {issueCount} 个问题
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            失败 {item.summary.failedChecks} / 警告 {item.summary.warningChecks}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
