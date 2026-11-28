import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  Download,
  PieChart as PieChartIcon,
  RefreshCw,
  Target,
  TrendingUp,
} from 'lucide-react'
import {
  AreaChartComponent,
  Button,
  Card,
  CardContent,
  LineChartComponent,
  PieChartComponent,
} from '@/components/atoms'
import { CompactPageToolbar } from '@/components/shared'
import { cn } from '@/utils/cn'
import toast from 'react-hot-toast'
import { exportAnalyticsReport } from '../api/inspection.api'
import {
  useDeviceDistribution,
  useInspectionStats,
  useInspectionTrends,
  useProblemDistribution,
} from '../hooks/useInspection'
import type { InspectionExecution } from '../types'
import {
  ANALYTICS_CHART_UNWRAPPED_CLASS,
  ANALYTICS_PERIOD_OPTIONS,
  AnalyticsPeriod,
  buildAnalyticsDateRange,
  formatAnalyticsDateLabel,
  getComparisonBaselineLabel,
  normalizeDeviceDistribution,
  normalizeProblemRanking,
  summarizeTrends,
} from '../utils/analyticsPresentation'
import { AnalyticsKpiStrip } from './AnalyticsKpiStrip'
import { AnalyticsProblemRanking } from './AnalyticsProblemRanking'
import { AnalyticsRecentExecutions } from './AnalyticsRecentExecutions'
import { ExecutionDetailModal } from './ExecutionDetailModal'

export const InspectionAnalytics: React.FC = () => {
  const [timePeriod, setTimePeriod] = useState<AnalyticsPeriod>('week')
  const [dateRange, setDateRange] = useState(() => buildAnalyticsDateRange('week'))
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [detailExecution, setDetailExecution] = useState<InspectionExecution | null>(null)
  const mountedRef = useRef(true)
  const refreshingRef = useRef(false)
  const exportingRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const analyticsRange = useMemo(
    () => ({
      period: timePeriod,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    }),
    [timePeriod, dateRange.startDate, dateRange.endDate]
  )

  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useInspectionStats(analyticsRange)
  const {
    data: trends,
    isLoading: trendsLoading,
    error: trendsError,
    refetch: refetchTrends,
  } = useInspectionTrends(analyticsRange)
  const {
    data: deviceDistribution,
    isLoading: deviceLoading,
    error: deviceError,
    refetch: refetchDevice,
  } = useDeviceDistribution(analyticsRange)
  const {
    data: problemDistribution,
    isLoading: problemLoading,
    error: problemError,
    refetch: refetchProblem,
  } = useProblemDistribution(analyticsRange)

  const handlePeriodChange = useCallback((nextPeriod: AnalyticsPeriod) => {
    setTimePeriod(nextPeriod)
    setDateRange(buildAnalyticsDateRange(nextPeriod))
  }, [])

  const formattedTrends = useMemo(() => {
    if (!trends || trends.length === 0) return []
    return trends.map((item) => ({
      ...item,
      dateLabel: formatAnalyticsDateLabel(item.date, timePeriod),
    }))
  }, [trends, timePeriod])

  const trendSummary = useMemo(() => summarizeTrends(trends), [trends])
  const deviceStats = useMemo(
    () => normalizeDeviceDistribution(deviceDistribution),
    [deviceDistribution]
  )
  const problemRanking = useMemo(
    () => normalizeProblemRanking(problemDistribution),
    [problemDistribution]
  )

  const recentExecutions = useMemo(
    () => (stats?.recentExecutions ?? []).filter((item) => Boolean(item.endTime)).slice(0, 7),
    [stats?.recentExecutions]
  )

  const comparisonBaselineLabel = getComparisonBaselineLabel(timePeriod)

  const handleRefreshAll = useCallback(async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    setIsRefreshing(true)
    try {
      await Promise.all([
        refetchStats(),
        refetchTrends(),
        refetchDevice(),
        refetchProblem(),
      ])
    } finally {
      refreshingRef.current = false
      if (mountedRef.current) {
        setIsRefreshing(false)
      }
    }
  }, [refetchStats, refetchTrends, refetchDevice, refetchProblem])

  const handleExportReport = useCallback(async () => {
    if (exportingRef.current) return
    exportingRef.current = true
    setIsExporting(true)
    try {
      toast.loading('正在生成报告...', { id: 'export-report' })
      await exportAnalyticsReport({
        period: timePeriod,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        formatType: 'pdf',
        includeCharts: true,
      })
      toast.success('报告已开始下载', { id: 'export-report' })
    } catch (error) {
      console.error('导出报告失败:', error)
      toast.error('导出报告失败,请稍后重试', { id: 'export-report' })
    } finally {
      exportingRef.current = false
      if (mountedRef.current) {
        setIsExporting(false)
      }
    }
  }, [timePeriod, dateRange.startDate, dateRange.endDate])

  if (statsLoading || trendsLoading || deviceLoading || problemLoading) {
    return (
      <div className="space-y-3 px-3 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3 py-1">
          <div className="flex items-center gap-3">
            <div className="h-9 w-48 rounded-lg bg-muted/60 animate-pulse" />
            <div className="h-9 w-52 rounded-lg bg-muted/60 animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-20 rounded-lg bg-muted/60 animate-pulse" />
            <div className="h-9 w-24 rounded-lg bg-muted/60 animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <div
              key={index}
              data-slot="stat-card"
              className="border p-3 space-y-2 animate-pulse"
            >
              <div className="h-3 w-16 rounded bg-muted" />
              <div className="h-6 w-20 rounded bg-muted" />
              <div className="h-3 w-24 rounded bg-muted/60" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {[...Array(4)].map((_, index) => (
            <div
              key={index}
              data-slot="card"
              className="border text-card-foreground p-4 space-y-3 animate-pulse"
            >
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-[240px] rounded bg-muted/40" />
            </div>
          ))}
        </div>
        <div
          data-slot="card"
          className="border text-card-foreground p-4 space-y-3 animate-pulse"
        >
          <div className="h-4 w-28 rounded bg-muted" />
          <div className="h-32 rounded bg-muted/40" />
        </div>
      </div>
    )
  }

  const analyticsError = statsError || trendsError || deviceError || problemError
  if (analyticsError) {
    return (
      <div className="px-3 pb-5">
        <Card>
          <CardContent className="p-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-danger-soft text-danger-soft-foreground flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-foreground">加载失败</h3>
                <p className="text-muted-foreground mt-1">{analyticsError.message}</p>
              </div>
              <Button variant="outline" onClick={() => void handleRefreshAll()} className="cursor-pointer">
                <RefreshCw className="w-4 h-4 mr-2" />
                重试
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3 px-3 pb-5">
        {/* 工具栏：左侧时间周期分段器 + 统计日期区间胶囊，右侧刷新与导出 */}
        <CompactPageToolbar
          layout="between"
          testIdPrefix="inspection-analytics-toolbar"
          filters={(
            <div className="flex flex-wrap items-center gap-2.5">
              <div
                role="group"
                aria-label="巡检分析时间周期"
                className="inline-flex h-9 items-center rounded-lg border border-border/70 bg-surface-2 p-[3px]"
              >
                {ANALYTICS_PERIOD_OPTIONS.map((option) => {
                  const isActive = timePeriod === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => handlePeriodChange(option.value)}
                      className={cn(
                        'inline-flex h-7 cursor-pointer items-center rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors duration-150',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                        isActive
                          ? 'bg-card text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>

              <div
                data-testid="analytics-date-range"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs text-muted-foreground"
              >
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span className="tabular-nums">
                  {dateRange.startDate} ~ {dateRange.endDate}
                </span>
              </div>
            </div>
          )}
          secondaryActions={[
            {
              key: 'refresh-analytics',
              label: isRefreshing ? '刷新中…' : '刷新',
              icon: <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />,
              variant: 'outline',
              disabled: isRefreshing,
              onClick: () => {
                void handleRefreshAll()
              },
            },
          ]}
          primaryActions={[
            {
              key: 'export-analytics',
              label: isExporting ? '导出中…' : '导出报告',
              icon: <Download className="w-4 h-4" />,
              variant: 'outline',
              disabled: isExporting,
              onClick: () => {
                void handleExportReport()
              },
            },
          ]}
        />

        {/* 4 张原版样式 KPI 统计卡片 */}
        <AnalyticsKpiStrip
          stats={stats}
          comparisonBaselineLabel={comparisonBaselineLabel}
        />

        {/* 2×2 无套娃语义图表矩阵（接入 data-slot="card" 原生阴影与三皮肤体系） */}
        <div
          data-testid="analytics-charts-section"
          className="grid grid-cols-1 lg:grid-cols-2 gap-3.5"
        >
          {/* 执行次数趋势 */}
          <section data-slot="card" className="border text-card-foreground overflow-hidden flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-surface-2/40 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-info" />
                <h3 className="text-sm font-semibold text-foreground">执行次数趋势</h3>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-info" />
                  总执行
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-success" />
                  成功
                </span>
                <span>
                  {trendSummary.totalFailed > 0
                    ? `共 ${trendSummary.totalExecutions} 次 · 失败 ${trendSummary.totalFailed} 次`
                    : `共 ${trendSummary.totalExecutions} 次`}
                </span>
              </div>
            </div>
            <div className="p-4">
              <AreaChartComponent
                data={formattedTrends}
                xKey="dateLabel"
                areas={[
                  { key: 'executions', name: '总执行', color: 'var(--info)' },
                  { key: 'success', name: '成功执行', color: 'var(--success)' },
                ]}
                height={240}
                className={ANALYTICS_CHART_UNWRAPPED_CLASS}
              />
            </div>
          </section>

          {/* 巡检评分趋势 */}
          <section data-slot="card" className="border text-card-foreground overflow-hidden flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-surface-2/40 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">巡检评分趋势</h3>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {trendSummary.hasScorePoints
                  ? `均值 ${trendSummary.avgScore.toFixed(1)} · 区间 ${Math.round(trendSummary.minScore)}–${Math.round(trendSummary.maxScore)}`
                  : '暂无评分样本'}
              </span>
            </div>
            <div className="p-4">
              <LineChartComponent
                data={formattedTrends}
                xKey="dateLabel"
                lines={[
                  { key: 'avgScore', name: '平均评分', color: 'var(--brand)', strokeWidth: 3 },
                ]}
                height={240}
                className={ANALYTICS_CHART_UNWRAPPED_CLASS}
              />
            </div>
          </section>

          {/* 设备类型分布 */}
          <section data-slot="card" className="border text-card-foreground overflow-hidden flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-surface-2/40 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-success" />
                <h3 className="text-sm font-semibold text-foreground">设备类型分布</h3>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                共 {deviceStats.totalDevices} 台
              </span>
            </div>
            <div className="p-4">
              <PieChartComponent
                data={deviceStats.items}
                height={240}
                innerRadius={56}
                outerRadius={88}
                formatter={(value) => `${value}台`}
                className={ANALYTICS_CHART_UNWRAPPED_CLASS}
              />
            </div>
          </section>

          {/* 常见问题分布 */}
          <section data-slot="card" className="border text-card-foreground overflow-hidden flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-surface-2/40 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                <h3 className="text-sm font-semibold text-foreground">常见问题分布</h3>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                共 {problemRanking.totalProblems} 项
              </span>
            </div>
            <div className="p-4">
              <AnalyticsProblemRanking
                items={problemRanking.items}
                total={problemRanking.totalProblems}
              />
            </div>
          </section>
        </div>

        {/* 最近执行详情（支持点击下钻） */}
        <AnalyticsRecentExecutions
          executions={recentExecutions}
          onSelectExecution={setDetailExecution}
        />
      </div>

      {/* 按需条件挂载执行详情弹窗，避免在未下钻时触发额外请求 */}
      {detailExecution && (
        <ExecutionDetailModal
          open
          onClose={() => setDetailExecution(null)}
          execution={detailExecution}
        />
      )}
    </>
  )
}
