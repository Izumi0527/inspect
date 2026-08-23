import React, { useState, useMemo } from 'react'
import { formatDateYMD } from '@/utils/formatters'
import { TrendingUp, Calendar, AlertTriangle, RefreshCw, FileText } from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  LineChartComponent
} from '@/components/atoms'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'
import { useTrendAnalysis, useGenerateTrendReport } from '../hooks/useReports'
import { Loading } from '@/components/atoms/loading'
import toast from 'react-hot-toast'
import { downloadReport as fetchDownloadUrl } from '../api/reports.api'
import { downloadWithAuth } from '@/utils/download'
import { ReportsToolbar } from './shared/ReportsToolbar'

interface Props {
  searchText: string
  onSearchTextChange?: (value: string) => void
}

type TrendChartRow = { date: string } & Record<string, number | string>

interface TrendMetricOption {
  value: string
  label: string
  color: string
  /** 图例名称，附带单位便于读图 */
  legend: string
}

/**
 * 趋势指标选项。
 *
 * 口径说明：这里只暴露后端确实有序列数据的指标。
 * - `performance` 映射后端 `response_time`，该指标当前未被采集，恒返回空序列，故不再提供；
 * - `availability` 依赖 device_status_history，该表为空时后端会退化成单点快照，
 *   因此保留选项但不作为默认值，避免用户首屏看到无法成图的单点。
 */
const TREND_METRIC_OPTIONS: TrendMetricOption[] = [
  { value: 'capacity', label: '容量使用', color: '#8B5CF6', legend: '容量使用 (%)' },
  { value: 'cpu_usage', label: 'CPU使用率', color: '#3B82F6', legend: 'CPU使用率 (%)' },
  { value: 'memory_usage', label: '内存使用率', color: '#0EA5E9', legend: '内存使用率 (%)' },
  { value: 'errors', label: '错误数', color: '#EF4444', legend: '错误数' },
  { value: 'availability', label: '可用性', color: '#10B981', legend: '可用性 (%)' },
]

const DEFAULT_TREND_METRIC = TREND_METRIC_OPTIONS[0].value

/** 后端 timeframe 取值到中文的映射，避免直接把 week/quarter 等英文枚举暴露给用户 */
const PREDICTION_PERIOD_LABELS: Record<string, string> = {
  day: '未来 1 天',
  week: '未来 1 周',
  month: '未来 1 个月',
  quarter: '未来 1 季度',
  year: '未来 1 年',
}

export const TrendAnalysis: React.FC<Props> = ({
  searchText,
  onSearchTextChange = () => undefined,
}) => {
  const canCreate = usePermission(Permission.REPORTS_CREATE)
  const [timeRange, setTimeRange] = useState('7d')
  const [metric, setMetric] = useState(DEFAULT_TREND_METRIC)

  // 指标下拉为单选：确保选择项真实影响请求与展示，避免“UI 变了但数据不变”
  const selectedMetrics = useMemo(() => [metric], [metric])

  const activeMetricOption = useMemo(
    () => TREND_METRIC_OPTIONS.find((option) => option.value === metric) ?? TREND_METRIC_OPTIONS[0],
    [metric]
  )

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
  const { data: trendData, isLoading, error, refetch } = useTrendAnalysis({
    metrics: selectedMetrics,
    dateRange,
    granularity: 'day'
  })

  // 生成报告 mutation
  const generateReportMutation = useGenerateTrendReport()

  // 处理生成报告
  const handleGenerateReport = async () => {
    if (!canCreate) {
      toast.error('暂无权限生成报表')
      return
    }
    try {
      const report = await generateReportMutation.mutateAsync({
        title: `趋势分析报告 - ${formatDateYMD(new Date())}`,
        metrics: selectedMetrics,
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

    // ⚠️ 时区口径：timestamp 可能为 ISO(UTC) 或带时区偏移，不能直接 split('T')[0]，否则跨时区会出现“跨天偏移”。
    // 本实现按“浏览器本地日期”聚合展示；如需与后端 UTC 日桶严格一致，可改为 UTC 口径。
    const pad2 = (value: number) => String(value).padStart(2, '0')
    const toLocalDateKey = (timestamp: string) => {
      if (!timestamp) return ''
      // date-only 字符串按原值返回，避免 JS 将其按 UTC 解析导致负时区偏移一天
      if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) return timestamp
      const date = new Date(timestamp)
      if (Number.isNaN(date.getTime())) return String(timestamp).split('T')[0]
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
    }

    // 从 metrics 数组中提取数据点并合并
    const dataMap = new Map<string, TrendChartRow>()

    trendData.metrics.forEach(metricData => {
      if (!metricData?.dataPoints || !Array.isArray(metricData.dataPoints)) return
      metricData.dataPoints.forEach(point => {
        if (!point?.timestamp) return
        const date = toLocalDateKey(point.timestamp)
        let row = dataMap.get(date)
        if (!row) {
          row = { date }
          dataMap.set(date, row)
        }
        // 使用 metricName 或 name 作为键（兼容性处理）
        const key = metricData.metricName || metricData.name
        row[key] = point.value
      })
    })

    return Array.from(dataMap.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [trendData])

  // 搜索过滤
  const normalizedKeyword = searchText.trim().toLowerCase()
  const filteredTrendData = normalizedKeyword
    ? chartData.filter((item) => {
        if (item.date.includes(normalizedKeyword)) return true
        return selectedMetrics.some((key) =>
          item?.[key]?.toString().includes(normalizedKeyword)
        )
      })
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
            <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : '未知错误'}</p>
            <Button variant="outline" className="mt-4" onClick={() => refetch()}>
              重试
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <ReportsToolbar
        search={{
          value: searchText,
          placeholder: '搜索趋势数据...',
          ariaLabel: '搜索趋势分析',
          onChange: onSearchTextChange,
        }}
        filters={(
          <div className="flex flex-wrap items-center gap-2">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="h-9 w-[110px] text-sm" aria-label="趋势时间范围">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">最近7天</SelectItem>
                <SelectItem value="30d">最近30天</SelectItem>
                <SelectItem value="90d">最近90天</SelectItem>
              </SelectContent>
            </Select>
            <Select value={metric} onValueChange={setMetric}>
              <SelectTrigger className="h-9 w-[130px] text-sm" aria-label="趋势指标">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TREND_METRIC_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        secondaryActions={[
          {
            key: 'refresh-trends',
            label: '刷新',
            icon: <RefreshCw className="mr-2 h-4 w-4" />,
            onClick: () => void refetch(),
          },
        ]}
        primaryActions={
          canCreate
            ? [
                {
                  key: 'generate-trend-report',
                  label: '生成趋势报告',
                  icon: <FileText className="mr-2 h-4 w-4" />,
                  loading: generateReportMutation.isPending,
                  onClick: () => void handleGenerateReport(),
                },
              ]
            : []
        }
      />

      {/* 趋势图表 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            设备性能趋势分析
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredTrendData.length >= 2 ? (
            <LineChartComponent
              data={filteredTrendData}
              xKey="date"
              lines={[
                {
                  key: activeMetricOption.value,
                  name: activeMetricOption.legend,
                  color: activeMetricOption.color,
                },
              ]}
              height={400}
              formatter={(value) => typeof value === 'number' ? value.toFixed(2) : value}
            />
          ) : filteredTrendData.length === 1 ? (
            // 单点无法构成折线：明确告知原因，避免用户把空白坐标系误判为系统故障
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
              <TrendingUp className="h-10 w-10 text-muted-foreground/60" />
              <p className="text-sm font-medium text-foreground">数据点不足，暂时无法呈现趋势</p>
              <p className="text-xs text-muted-foreground">
                当前区间内「{activeMetricOption.label}」仅有 1 个采样点，至少需要 2 个点才能绘制趋势线。
                可尝试拉长时间范围，或等待下一轮采集完成。
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
              <TrendingUp className="h-10 w-10 text-muted-foreground/60" />
              <p className="text-sm font-medium text-foreground">暂无数据</p>
              <p className="text-xs text-muted-foreground">
                当前区间内没有「{activeMetricOption.label}」的采样记录。
              </p>
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
                trendData.predictions.map((prediction, index) => {
                  const label =
                    TREND_METRIC_OPTIONS.find((option) => option.value === prediction.metric)?.label
                    ?? prediction.metric
                  const confidence = prediction.confidenceLevel ?? prediction.confidence
                  const formatValue = (value?: number) =>
                    typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '—'

                  return (
                    <div key={index} className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <h4 className="font-medium text-blue-900 dark:text-blue-200">{label} 预测</h4>

                      {/* 预测的核心是“会变成多少”，当前值与预测值必须同时呈现才有参考意义 */}
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-sm text-blue-700 dark:text-blue-300">
                          {formatValue(prediction.currentValue)}
                        </span>
                        <span className="text-blue-500 dark:text-blue-400">→</span>
                        <span className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                          {formatValue(prediction.predictedValue)}
                        </span>
                      </div>

                      {prediction.recommendation && (
                        <p className="text-sm text-blue-700 dark:text-blue-300 mt-2">
                          {prediction.recommendation}
                        </p>
                      )}

                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                        预测周期: {
                          prediction.predictionPeriod
                            ? PREDICTION_PERIOD_LABELS[prediction.predictionPeriod] ?? prediction.predictionPeriod
                            : '—'
                        }
                        {typeof confidence === 'number' && Number.isFinite(confidence)
                          ? ` · 置信水平: ${(confidence * 100).toFixed(1)}%`
                          : ''}
                      </p>
                    </div>
                  )
                })
              ) : (
                <div className="p-4 bg-muted/40 rounded-lg">
                  <p className="text-sm text-muted-foreground">暂无预测数据</p>
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
              ) : trendData?.alertsMeta && !trendData.alertsMeta.evaluated ? (
                // 采样点不足时后端会跳过异常检测；此处必须与「已检测且无异常」区分开，
                // 否则用户会把「没检测」读成「一切正常」。
                <div className="p-3 bg-muted/40 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    采样点不足，尚未执行异常检测
                  </p>
                  <p className="text-xs text-muted-foreground/80 mt-1">
                    当前区间最多 {trendData.alertsMeta.actualPoints} 个采样点，
                    需至少 {trendData.alertsMeta.minPointsRequired} 个才能进行波动分析。
                    可切换到更长的时间范围。
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-sm text-green-700 dark:text-green-300">未检测到趋势异常</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
