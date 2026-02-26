// @ts-nocheck
import React, { useState, useMemo } from 'react'
import { TrendingUp, Calendar, AlertTriangle } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, LineChartComponent } from '@/components/atoms'
import { useTrendAnalysis, useGenerateTrendReport } from '../hooks/useReports'
import { Loading } from '@/components/atoms/loading'
import toast from 'react-hot-toast'
import { downloadReport as fetchDownloadUrl } from '../api/reports.api'
import { downloadWithAuth } from '@/utils/download'

interface Props {
  searchText: string
}

export const TrendAnalysis: React.FC<Props> = ({ searchText }) => {
  const [timeRange, setTimeRange] = useState('7d')
  const [metric, setMetric] = useState('availability')

  // 计算日期范围
  const dateRange = useMemo(() => {
    const end = new Date()
    const start = new Date()

    switch (timeRange) {
      case '7d':
        start.setDate(end.getDate() - 7)
        break
      case '30d':
        start.setDate(end.getDate() - 30)
        break
      case '90d':
        start.setDate(end.getDate() - 90)
        break
      default:
        start.setDate(end.getDate() - 7)
    }

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString()
    }
  }, [timeRange])

  // 获取趋势分析数据
  const { data: trendData, isLoading, error } = useTrendAnalysis({
    metrics: ['availability', 'performance', 'errors'],
    dateRange,
    granularity: 'day'
  })

  // 生成报告 mutation
  const generateReportMutation = useGenerateTrendReport()

  // 处理生成报告
  const handleGenerateReport = async () => {
    try {
      const report = await generateReportMutation.mutateAsync({
        title: `趋势分析报告 - ${new Date().toLocaleDateString()}`,
        metrics: ['availability', 'performance', 'errors'],
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        format: 'pdf',
        includePredictions: true
      })

      try {
        const url = report?.downloadUrl || (await fetchDownloadUrl(report.id))
        if (!url) {
          toast.error('暂无可用的下载链接')
          return
        }

        const format = String(report.format || 'pdf').toLowerCase()
        const ext = format === 'excel' ? 'xlsx' : format === 'word' ? 'docx' : format
        const filename = `${report.title || 'trend-report'}.${ext}`
        await downloadWithAuth(url, filename)
        toast.success('趋势报告已生成并开始下载')
      } catch (err) {
        console.error('下载趋势报告失败:', err)
        toast.error('趋势报告生成成功，但下载失败')
      }
    } catch (error) {
      console.error('生成报告失败:', error)
      toast.error('生成趋势报告失败')
    }
  }

  // 转换后端数据为图表格式
  const chartData = useMemo(() => {
    if (!trendData?.metrics || !Array.isArray(trendData.metrics)) return []

    // 从 metrics 数组中提取数据点并合并
    const dataMap = new Map()

    trendData.metrics.forEach(metricData => {
      if (!metricData?.dataPoints || !Array.isArray(metricData.dataPoints)) return
      metricData.dataPoints.forEach(point => {
        if (!point?.timestamp) return
        const date = point.timestamp.split('T')[0] // 提取日期部分
        if (!dataMap.has(date)) {
          dataMap.set(date, { date })
        }
        // 使用 metricName 或 name 作为键（兼容性处理）
        const key = metricData.metricName || metricData.name
        dataMap.get(date)[key] = point.value
      })
    })

    return Array.from(dataMap.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [trendData])

  // 搜索过滤
  const normalizedKeyword = searchText.trim().toLowerCase()
  const filteredTrendData = normalizedKeyword
    ? chartData.filter((item) =>
        item.date.includes(normalizedKeyword) ||
        (item.availability?.toString().includes(normalizedKeyword)) ||
        (item.performance?.toString().includes(normalizedKeyword)) ||
        (item.errors?.toString().includes(normalizedKeyword))
      )
    : chartData

  // 加载状态
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loading />
      </div>
    )
  }

  // 错误状态
  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-red-600 dark:text-red-400">
            <AlertTriangle className="w-12 h-12 mx-auto mb-2" />
            <p className="text-lg font-medium">加载趋势分析数据失败</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{error instanceof Error ? error.message : '未知错误'}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* 控制面板 */}
      <div className="flex gap-4">
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">最近7天</SelectItem>
            <SelectItem value="30d">最近30天</SelectItem>
            <SelectItem value="90d">最近90天</SelectItem>
          </SelectContent>
        </Select>
        <Select value={metric} onValueChange={setMetric}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="availability">可用性</SelectItem>
            <SelectItem value="performance">性能</SelectItem>
            <SelectItem value="errors">错误数</SelectItem>
          </SelectContent>
        </Select>
        <Button
          onClick={handleGenerateReport}
          disabled={generateReportMutation.isPending}
        >
          {generateReportMutation.isPending ? '生成中...' : '生成趋势报告'}
        </Button>
      </div>

      {/* 趋势图表 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            设备性能趋势分析
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredTrendData.length > 0 ? (
            <LineChartComponent
              data={filteredTrendData}
              xKey="date"
              lines={[
                { key: 'availability', name: '可用性 (%)', color: '#10B981' },
                { key: 'performance', name: '性能评分', color: '#3B82F6' }
              ]}
              height={400}
              formatter={(value) => typeof value === 'number' ? value.toFixed(2) : value}
            />
          ) : (
            <div className="text-center text-gray-500 dark:text-gray-400 py-20">
              暂无数据
            </div>
          )}
        </CardContent>
      </Card>

      {/* 预测和告警 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              预测分析
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {trendData?.predictions && trendData.predictions.length > 0 ? (
                trendData.predictions.map((prediction, index) => (
                  <div key={index} className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <h4 className="font-medium text-blue-900 dark:text-blue-200">{prediction.metric} 预测</h4>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                      预测周期: {prediction.predictionPeriod}
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      置信水平: {(prediction.confidenceLevel * 100).toFixed(1)}%
                    </p>
                  </div>
                ))
              ) : (
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-400">暂无预测数据</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              趋势告警
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {trendData?.alerts && trendData.alerts.length > 0 ? (
                trendData.alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`flex items-center gap-3 p-3 rounded-lg ${
                      alert.severity === 'critical' ? 'bg-red-50 dark:bg-red-900/20' :
                      alert.severity === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900/20' :
                      'bg-blue-50 dark:bg-blue-900/20'
                    }`}
                  >
                    <AlertTriangle className={`w-5 h-5 ${
                      alert.severity === 'critical' ? 'text-red-600 dark:text-red-400' :
                      alert.severity === 'warning' ? 'text-yellow-600 dark:text-yellow-400' :
                      'text-blue-600 dark:text-blue-400'
                    }`} />
                    <div className="flex-1">
                      <div className={`text-sm font-medium ${
                        alert.severity === 'critical' ? 'text-red-900 dark:text-red-200' :
                        alert.severity === 'warning' ? 'text-yellow-900 dark:text-yellow-200' :
                        'text-blue-900 dark:text-blue-200'
                      }`}>
                        {alert.message}
                      </div>
                      <div className={`text-xs ${
                        alert.severity === 'critical' ? 'text-red-700 dark:text-red-300' :
                        alert.severity === 'warning' ? 'text-yellow-700 dark:text-yellow-300' :
                        'text-blue-700 dark:text-blue-300'
                      }`}>
                        {alert.description}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-sm text-green-700 dark:text-green-300">暂无趋势告警</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
