import React, { useState, useEffect } from 'react'
import {
  TrendingUp,
  BarChart3,
  Activity,
  Target,
  Calendar,
  Download,
  RefreshCw
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  LineChartComponent,
  AreaChartComponent,
  BarChartComponent,
  PieChartComponent
} from '@/components/atoms'
import {
  useInspectionTrends,
  useInspectionStats,
  useDeviceDistribution,
  useProblemDistribution
} from '../hooks/useInspection'
import { exportAnalyticsReport } from '../api/inspection.api'
import toast from 'react-hot-toast'

export const InspectionAnalytics: React.FC = () => {
  const [timePeriod, setTimePeriod] = useState<'day' | 'week' | 'month'>('week')
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  })

  // 根据 timePeriod 自动更新 dateRange
  useEffect(() => {
    const now = new Date()
    const endDate = now.toISOString().split('T')[0]
    let startDate: string

    switch (timePeriod) {
      case 'day':
        // 按天显示最近7天数据
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        break
      case 'week':
        // 按周显示最近4周数据
        startDate = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        break
      case 'month':
        // 按月显示最近12个月数据
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        break
      default:
        startDate = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    }

    setDateRange({ startDate, endDate })
  }, [timePeriod])

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useInspectionStats()
  const { data: trends, isLoading: trendsLoading, refetch: refetchTrends } = useInspectionTrends({
    period: timePeriod,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate
  })
  const { data: deviceDistribution, isLoading: deviceLoading, refetch: refetchDevice } = useDeviceDistribution()
  const { data: problemDistribution, isLoading: problemLoading, refetch: refetchProblem } = useProblemDistribution()

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

  return (
    <div className="space-y-6">
      {/* 操作栏 */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold dark:text-gray-100">统计分析</h3>
          <p className="text-gray-600 dark:text-gray-400 text-sm">巡检数据的趋势分析和统计报告</p>
        </div>
        <div className="flex gap-2">
          <Select value={timePeriod} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-32">
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
            title: '总执行次数',
            value: stats?.todayExecutions || 0,
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
        ].map((metric) => (
          <Card key={metric.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{metric.title}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">{metric.value}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <TrendingUp className={`w-4 h-4 text-${metric.color}-500`} />
                    <span className={`text-sm font-medium text-${metric.color}-600`}>
                      {metric.change}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">vs 上周</span>
                  </div>
                </div>
                <div className={`p-3 bg-${metric.color}-100 rounded-lg`}>
                  <metric.icon className={`w-6 h-6 text-${metric.color}-600`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
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
              data={trends || []}
              xKey="date"
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
              data={trends || []}
              xKey="date"
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
                {(trends || []).slice(-7).map((item, index) => (
                  <tr key={index} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="p-3">{new Date(item.date).toLocaleDateString()}</td>
                    <td className="p-3">{item.executions}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        (item.success / item.executions * 100) >= 90
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                          : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400'
                      }`}>
                        {((item.success / item.executions) * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`font-medium ${
                        item.avgScore >= 90 ? 'text-green-600' :
                        item.avgScore >= 70 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {item.avgScore}
                      </span>
                    </td>
                    <td className="p-3">{item.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
