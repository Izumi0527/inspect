import React, { useState, useMemo } from 'react'
import { BarChart3, Users, Target, Activity, RefreshCw, Download, FileText } from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  CardSkeleton,
  ChartSkeleton,
  TableSkeleton,
  ErrorAlert,
  SmartDateRangePicker,
  BarChartComponent,
  PieChartComponent
} from '@/components/atoms'
import { MultiSelect } from '@/components/ui/select'
import { CompactStatCard } from '@/components/shared'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'
import { useStatistics, useKPIData, useRankings, useGenerateStatisticsReport, useExportToExcel } from '../hooks/useReports'
import toast from 'react-hot-toast'
import { downloadReport as fetchDownloadUrl } from '../api/reports.api'
import { downloadWithAuth } from '@/utils/download'
import { formatDateYMD } from '@/utils/formatters'
import { ReportsToolbar } from './shared/ReportsToolbar'

interface Props {
  searchText: string
  onSearchTextChange?: (value: string) => void
}

/**
 * 由变化量字符串推导数值方向（仅方向，不含好坏判断）。
 *
 * 好坏由调用方通过 CompactStatCard 的 sentiment 单独表达：
 * 这样「严重问题数 +332」可以照实显示为上升箭头，同时用红色标明是负面变化。
 */
const resolveTrendFromChange = (change: string): 'up' | 'down' | 'stable' => {
  const trimmed = change.trim()
  const isPositive = trimmed.startsWith('+')
  const isNegative = trimmed.startsWith('-')
  if (!isPositive && !isNegative) return 'stable'

  // 变化量为 0（如 "+0" / "-0.0%"）时按持平处理，避免无变化被读成有变化
  if (/^[+-]0+(\.0+)?%?$/.test(trimmed)) return 'stable'

  return isPositive ? 'up' : 'down'
}

/** 结合数值方向与指标极性，判断这次变化是正面还是负面 */
const resolveSentiment = (
  trend: 'up' | 'down' | 'stable',
  higherIsBetter: boolean
): 'positive' | 'negative' | 'neutral' => {
  if (trend === 'stable') return 'neutral'
  const rising = trend === 'up'
  return rising === higherIsBetter ? 'positive' : 'negative'
}

/** 设备状态的展示元数据；未知状态回退为原始值 + 中性色 */
const DEVICE_STATUS_META: Record<string, { label: string; color: string }> = {
  online: { label: '在线', color: '#10B981' },
  offline: { label: '离线', color: '#EF4444' },
  warning: { label: '告警', color: '#F59E0B' },
  error: { label: '故障', color: '#DC2626' },
  unknown: { label: '未知', color: '#6B7280' },
}

const resolveStatusLabel = (status: string) => DEVICE_STATUS_META[status]?.label ?? status
const resolveStatusColor = (status: string) => DEVICE_STATUS_META[status]?.color ?? '#6B7280'

/** 类型分布柱状图的一行：固定的名称/总数，外加按状态动态展开的分段列 */
type DeviceTypeChartRow = { name: string; count: number } & Record<string, string | number>

const getDefaultStatisticsDateRange = () => ({
  startDate: formatDateYMD(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
  endDate: formatDateYMD(new Date())
})

const getQuickStatisticsDateRange = (range: 'today' | 'week' | 'month') => {
  const endDate = new Date()
  const startDate = new Date(endDate)

  if (range === 'today') {
    return {
      startDate: formatDateYMD(startDate),
      endDate: formatDateYMD(endDate),
    }
  }

  if (range === 'week') {
    const weekday = startDate.getDay()
    const diff = weekday === 0 ? 6 : weekday - 1
    startDate.setDate(startDate.getDate() - diff)
    return {
      startDate: formatDateYMD(startDate),
      endDate: formatDateYMD(endDate),
    }
  }

  startDate.setDate(1)
  return {
    startDate: formatDateYMD(startDate),
    endDate: formatDateYMD(endDate),
  }
}

export const StatisticsReports: React.FC<Props> = ({
  searchText,
  onSearchTextChange = () => undefined,
}) => {
  const canCreate = usePermission(Permission.REPORTS_CREATE)
  // ==================== State Management ====================
  const defaultDateRange = useMemo(() => getDefaultStatisticsDateRange(), [])
  const [dateRange, setDateRange] = useState(defaultDateRange)
  const [deviceTypes, setDeviceTypes] = useState<string[]>([])
  const [locations, setLocations] = useState<string[]>([])

  // ==================== API Hooks ====================
  const {
    data: statisticsData,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats
  } = useStatistics({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    deviceTypes: deviceTypes.length > 0 ? deviceTypes : undefined,
    locations: locations.length > 0 ? locations : undefined,
    groupBy: 'day',
    includeTrends: true
  })

  const {
    data: kpiData,
    isLoading: kpiLoading,
    error: kpiError,
    refetch: refetchKpi
  } = useKPIData({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    deviceTypes: deviceTypes.length > 0 ? deviceTypes : undefined,
    locations: locations.length > 0 ? locations : undefined,
    comparisonPeriod: 'previous_period'
  })

  const {
    data: rankingsData,
    isLoading: rankingsLoading,
    error: rankingsError,
    refetch: refetchRankings
  } = useRankings({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    deviceTypes: deviceTypes.length > 0 ? deviceTypes : undefined,
    locations: locations.length > 0 ? locations : undefined,
    rankingType: 'performance',
    topN: 10,
    includeBottom: false
  })

  const generateReportMutation = useGenerateStatisticsReport()
  const exportExcelMutation = useExportToExcel()

  // ==================== Derived Data ====================
  const overview = statisticsData?.overview || {
    totalDevices: 0,
    activeDevices: 0,
    offlineDevices: 0,
    warningDevices: 0,
    errorDevices: 0,
    avgUptime: 0,
    totalExecutions: 0,
    avgScore: 0
  }

  // 设备类型分布数据
  //
  // 后端 by_type_status 提供「类型 × 状态」真实交叉分布，可直接堆叠展示；
  // 该字段缺失时（例如后端未升级）退化为总数单柱，
  // 绝不用全局在线率去摊分——那会造出并不存在的分布。
  const deviceTypeChartData = useMemo(() => {
    const byType = statisticsData?.deviceDistribution?.byType
    if (!byType) return []

    const byTypeStatus = statisticsData?.deviceDistribution?.byTypeStatus ?? {}

    return Object.entries(byType).map(([name, count]) => {
      const row: DeviceTypeChartRow = { name, count }
      Object.entries(byTypeStatus[name] ?? {}).forEach(([status, value]) => {
        row[status] = value
      })
      return row
    })
  }, [statisticsData])

  // 交叉分布中实际出现过的状态集合，决定堆叠柱的分段
  const deviceTypeStatusKeys = useMemo(() => {
    const byTypeStatus = statisticsData?.deviceDistribution?.byTypeStatus
    if (!byTypeStatus) return []

    const keys = new Set<string>()
    Object.values(byTypeStatus).forEach((statuses) => {
      Object.entries(statuses).forEach(([status, count]) => {
        if (count > 0) keys.add(status)
      })
    })
    return Array.from(keys).sort()
  }, [statisticsData])

  // 设备状态分布数据（后端 by_status 的真实值）
  const deviceStatusChartData = useMemo(() => {
    const byStatus = statisticsData?.deviceDistribution?.byStatus
    if (!byStatus) return []

    return Object.entries(byStatus)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => ({
        name: resolveStatusLabel(status),
        value: count,
        color: resolveStatusColor(status),
      }))
  }, [statisticsData])

  // 性能评级分布数据（用于饼图）
  const performanceChartData = useMemo(() => {
    if (!statisticsData?.performanceStats?.byDevice) return []

    const scoreRanges = [
      { name: '优秀', min: 90, max: 100, color: '#10B981', count: 0 },
      { name: '良好', min: 75, max: 90, color: '#3B82F6', count: 0 },
      { name: '一般', min: 60, max: 75, color: '#F59E0B', count: 0 },
      { name: '较差', min: 0, max: 60, color: '#EF4444', count: 0 }
    ]

    statisticsData.performanceStats.byDevice.forEach((device: { metrics?: { availability?: number } }) => {
      const availability = device.metrics?.availability || 0
      for (const range of scoreRanges) {
        // 末档（优秀）取闭区间：可用性恰为 100 的设备必须归入优秀，
        // 否则会因 `< 100` 落空而被静默丢弃，导致「后端有数据、饼图显示暂无数据」。
        const isTopRange = range.max === 100
        const matched = isTopRange
          ? availability >= range.min && availability <= range.max
          : availability >= range.min && availability < range.max
        if (matched) {
          range.count++
          break
        }
      }
    })

    return scoreRanges.filter(r => r.count > 0).map(({ name, color, count }) => ({
      name,
      value: count,
      color
    }))
  }, [statisticsData])

  // 设备排名数据
  const rankingTableData = useMemo(() => {
    if (!rankingsData || !Array.isArray(rankingsData)) return []

    // 排名接口的宽松响应结构（字段名存在 camel/snake 别名）
    interface DeviceRankingRaw {
      deviceId?: string | number
      deviceName?: string
      device_name?: string
      deviceType?: string
      device_type?: string
      ranking?: number
      metrics?: { availability?: number }
    }

    return rankingsData.slice(0, 10).map((device: DeviceRankingRaw, index: number) => {
      const availability = device.metrics?.availability ?? 0
      return {
        rank: index + 1,
        name: device.deviceName || device.device_name || `Device-${device.deviceId}`,
        type: device.deviceType || device.device_type || '-',
        availability,
        score: device.ranking || 0,
        status: availability >= 98 ? '优秀' : availability >= 95 ? '良好' : '一般'
      }
    })
  }, [rankingsData])

  // KPI 指标卡片数据
  //
  // 字段对齐说明：后端 /statistics/kpi 只返回 4 个变化量字段，
  // 且各自有明确语义。此处只把**语义匹配**的变化量贴到对应卡片上；
  // 无匹配变化量的卡片（如设备总数这类存量指标）不显示变化率，
  // 避免出现「1 台设备增长 50%」这类由字段错配产生的误导性数字。
  const kpiCards = useMemo(() => {
    return [
      {
        title: '设备总数',
        value: String(overview.totalDevices),
        // 存量指标，后端无对应变化量字段，不展示涨跌
        change: '',
        changeHint: '',
        higherIsBetter: true,
        icon: Users,
        color: 'blue'
      },
      {
        title: '在线率',
        value: `${((overview.activeDevices / overview.totalDevices || 0) * 100).toFixed(1)}%`,
        change: kpiData?.device_availability_change || '',
        changeHint: 'vs 上期',
        higherIsBetter: true,
        icon: Activity,
        color: 'green'
      },
      {
        // 该值来自 inspection_results.score 的均值，与排名表的「性能评分」
        // （由响应时间/可用性等指标算出）是两个不同概念，标题需写明以免被当成同一口径。
        title: '平均巡检评分',
        value: overview.avgScore.toFixed(1),
        change: kpiData?.avg_health_score_change || '',
        changeHint: 'vs 上期',
        higherIsBetter: true,
        icon: Target,
        color: 'purple'
      },
      {
        title: '故障率',
        value: `${((overview.errorDevices / overview.totalDevices || 0) * 100).toFixed(1)}%`,
        // 后端无「故障率变化」字段，此处展示的是严重问题数的变化，
        // 因此用 changeHint 显式标注量纲来源，避免与百分比主值混淆。
        change: kpiData?.severe_issue_count_change || '',
        changeHint: '严重问题数 vs 上期',
        // 故障相关指标越低越好，上升应显示为负面
        higherIsBetter: false,
        icon: BarChart3,
        color: 'red'
      }
    ]
  }, [overview, kpiData])

  // KPI 卡片图标配色映射（仅图标着色，卡片底色由 CompactStatCard 统一控制）
  const colorMap = {
    blue: { icon: 'text-blue-600 dark:text-blue-400' },
    green: { icon: 'text-green-600 dark:text-green-400' },
    purple: { icon: 'text-purple-600 dark:text-purple-400' },
    red: { icon: 'text-red-600 dark:text-red-400' }
  }

  // ==================== Event Handlers ====================
  const handleGenerateReport = async () => {
    if (!canCreate) {
      toast.error('暂无权限生成报表')
      return
    }
    try {
      const report = await generateReportMutation.mutateAsync({
        title: `统计报表_${dateRange.startDate}_${dateRange.endDate}`,
        description: '设备统计报表',
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        deviceTypes: deviceTypes.length > 0 ? deviceTypes : undefined,
        locations: locations.length > 0 ? locations : undefined,
        format: 'pdf',
        includeCharts: true,
        includeTrends: true,
        includeRankings: true
      })

      try {
        const url = report?.downloadUrl || (await fetchDownloadUrl(report.id))
        if (!url) {
          toast.error('暂无可用的下载链接')
          return
        }

        const format = String(report.format || 'pdf').toLowerCase()
        const ext = format === 'excel' ? 'xlsx' : format === 'word' ? 'docx' : format
        const filename = `${report.title || 'statistics-report'}.${ext}`
        await downloadWithAuth(url, filename)
        toast.success('统计报表已生成并开始下载')
      } catch (err) {
        console.error('下载统计报表失败:', err)
        toast.error('统计报表生成成功，但下载失败')
      }
    } catch {
      toast.error('生成报表失败')
    }
  }

  const handleExportData = async () => {
    if (!canCreate) {
      toast.error('暂无权限导出数据')
      return
    }
    if (!statisticsData) {
      toast.error('暂无可导出的统计数据')
      return
    }

    const title = `统计报表_${dateRange.startDate}_${dateRange.endDate}`

    const kpiRows = kpiCards.map((card) => ({
      metric: card.title,
      value: card.value,
      change: card.change
    }))

    const deviceTypeRows = deviceTypeChartData.map((item) => ({
      deviceType: item.name,
      count: item.count,
      percent: overview.totalDevices > 0
        ? Number(((item.count / overview.totalDevices) * 100).toFixed(2))
        : 0
    }))

    const performanceRows = performanceChartData.map((item) => ({
      level: item.name,
      count: item.value,
      percent: overview.totalDevices > 0
        ? Number(((item.value / overview.totalDevices) * 100).toFixed(2))
        : 0
    }))

    const rankingRows = rankingTableData.map((row) => ({
      rank: row.rank,
      name: row.name,
      type: row.type,
      availability: row.availability,
      score: row.score,
      status: row.status
    }))

    try {
      await exportExcelMutation.mutateAsync({
        title,
        sheets: [
          {
            name: '概览KPI',
            data: kpiRows,
            columns: [
              { header: '指标', key: 'metric' },
              { header: '数值', key: 'value' },
              { header: '变化', key: 'change' }
            ]
          },
          {
            name: '设备类型分布',
            data: deviceTypeRows,
            columns: [
              { header: '设备类型', key: 'deviceType' },
              { header: '数量', key: 'count' },
              { header: '占比(%)', key: 'percent' }
            ]
          },
          {
            name: '性能分布',
            data: performanceRows,
            columns: [
              { header: '等级', key: 'level' },
              { header: '数量', key: 'count' },
              { header: '占比(%)', key: 'percent' }
            ]
          },
          {
            name: '设备排行',
            data: rankingRows,
            columns: [
              { header: '排名', key: 'rank' },
              { header: '设备', key: 'name' },
              { header: '类型', key: 'type' },
              { header: '可用率', key: 'availability' },
              { header: '评分', key: 'score' },
              { header: '状态', key: 'status' }
            ]
          }
        ]
      })
    } catch (e) {
      console.error('导出失败:', e)
      // toast 由 mutation hook onError 统一处理
    }
  }

  const handleRefresh = () => {
    refetchStats()
    refetchKpi()
    refetchRankings()
    toast.success('数据已刷新')
  }

  const handleQuickDateRange = (range: 'today' | 'week' | 'month') => {
    setDateRange(getQuickStatisticsDateRange(range))
  }

  const handleResetFilters = () => {
    setDeviceTypes([])
    setLocations([])
    setDateRange(defaultDateRange)
  }

  // 可用的设备类型和位置选项
  const deviceTypeOptions = useMemo(() => {
    if (!statisticsData?.deviceDistribution?.byType) return []
    return Object.keys(statisticsData.deviceDistribution.byType).map(type => ({
      value: type,
      label: type
    }))
  }, [statisticsData])

  const locationOptions = useMemo(() => {
    if (!statisticsData?.deviceDistribution?.byLocation) return []
    return Object.keys(statisticsData.deviceDistribution.byLocation).map(location => ({
      value: location,
      label: location
    }))
  }, [statisticsData])

  const hasDateFilter =
    dateRange.startDate !== defaultDateRange.startDate ||
    dateRange.endDate !== defaultDateRange.endDate
  const filterCount =
    (deviceTypes.length > 0 ? 1 : 0) +
    (locations.length > 0 ? 1 : 0) +
    (hasDateFilter ? 1 : 0)
  const hasActiveFilters = filterCount > 0

  // ==================== Search Filter ====================
  const normalizedKeyword = searchText.trim().toLowerCase()

  const filteredDeviceChartData = normalizedKeyword
    ? deviceTypeChartData.filter((item) => item.name.toLowerCase().includes(normalizedKeyword))
    : deviceTypeChartData

  const filteredPerformanceChartData = normalizedKeyword
    ? performanceChartData.filter((item) => item.name.toLowerCase().includes(normalizedKeyword))
    : performanceChartData

  const filteredStatusChartData = normalizedKeyword
    ? deviceStatusChartData.filter((item) => item.name.toLowerCase().includes(normalizedKeyword))
    : deviceStatusChartData

  const filteredRankingData = normalizedKeyword
    ? rankingTableData.filter((item) =>
        item.name.toLowerCase().includes(normalizedKeyword) ||
        item.type.toLowerCase().includes(normalizedKeyword) ||
        item.status.toLowerCase().includes(normalizedKeyword)
      )
    : rankingTableData

  // ==================== Loading State ====================
  if (statsLoading || kpiLoading || rankingsLoading) {
    return (
      <div className="space-y-6">
        <div className="flex gap-2">
          <div className="h-10 w-32 bg-muted rounded animate-pulse"></div>
          <div className="h-10 w-24 bg-muted rounded animate-pulse"></div>
        </div>
        <CardSkeleton count={4} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
        <TableSkeleton rows={5} columns={6} />
      </div>
    )
  }

  // ==================== Error State ====================
  if (statsError || kpiError || rankingsError) {
    return (
      <div className="space-y-4">
        {statsError && (
          <ErrorAlert
            title="统计数据加载失败"
            message="无法加载统计数据，请检查网络连接或稍后重试"
            error={statsError}
            onRetry={refetchStats}
          />
        )}
        {kpiError && (
          <ErrorAlert
            title="KPI 数据加载失败"
            message="无法加载 KPI 指标数据"
            error={kpiError}
            variant="warning"
            onRetry={refetchKpi}
          />
        )}
        {rankingsError && (
          <ErrorAlert
            title="排名数据加载失败"
            message="无法加载设备排名数据"
            error={rankingsError}
            variant="warning"
            onRetry={refetchRankings}
          />
        )}
      </div>
    )
  }

  // ==================== Main Render ====================
  return (
    <div className="space-y-6">
      <ReportsToolbar
        search={{
          value: searchText,
          placeholder: '搜索设备类型、排名状态...',
          ariaLabel: '搜索统计报表',
          onChange: onSearchTextChange,
        }}
        filters={(
          <div className="flex flex-wrap items-center gap-2">
            <SmartDateRangePicker
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              onStartDateChange={(date) => setDateRange((prev) => ({ ...prev, startDate: date }))}
              onEndDateChange={(date) => setDateRange((prev) => ({ ...prev, endDate: date }))}
              onClear={() => setDateRange(defaultDateRange)}
              onQuickSelect={handleQuickDateRange}
              placeholder="选择日期范围"
            />

            {deviceTypeOptions.length > 0 && (
              <MultiSelect
                triggerId="statistics-device-types"
                ariaLabel="筛选设备类型"
                options={deviceTypeOptions}
                value={deviceTypes}
                onChange={setDeviceTypes}
                placeholder="设备类型"
                triggerClassName="h-9 min-w-[140px] rounded-md border-input bg-background px-3 py-2 text-sm shadow-sm backdrop-blur-none"
                dropdownClassName="rounded-md border-border bg-popover shadow-lg backdrop-blur-none"
              />
            )}

            {locationOptions.length > 0 && (
              <MultiSelect
                triggerId="statistics-locations"
                ariaLabel="筛选设备位置"
                options={locationOptions}
                value={locations}
                onChange={setLocations}
                placeholder="设备位置"
                triggerClassName="h-9 min-w-[140px] rounded-md border-input bg-background px-3 py-2 text-sm shadow-sm backdrop-blur-none"
                dropdownClassName="rounded-md border-border bg-popover shadow-lg backdrop-blur-none"
              />
            )}

            {hasActiveFilters && (
              <>
                <Badge variant="secondary" className="px-2 py-1 text-xs">
                  已应用 {filterCount} 个筛选
                </Badge>
                <Button variant="outline" onClick={handleResetFilters}>
                  重置筛选
                </Button>
              </>
            )}
          </div>
        )}
        secondaryActions={[
          {
            key: 'refresh-statistics',
            label: '刷新数据',
            icon: <RefreshCw className="mr-2 h-4 w-4" />,
            onClick: handleRefresh,
          },
        ]}
        primaryActions={
          canCreate
            ? [
                {
                  key: 'export-data',
                  label: '导出数据',
                  icon: <Download className="mr-2 h-4 w-4" />,
                  loading: exportExcelMutation.isPending,
                  onClick: () => void handleExportData(),
                },
                {
                  key: 'generate-statistics-report',
                  label: '生成统计报表',
                  icon: <FileText className="mr-2 h-4 w-4" />,
                  loading: generateReportMutation.isPending,
                  onClick: () => void handleGenerateReport(),
                },
              ]
            : []
        }
      />

      {!canCreate && (
        <div className="text-sm text-muted-foreground">
          当前账号暂无生成/导出报表权限，请联系管理员开通。
        </div>
      )}

      {/* KPI 指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {kpiCards.map((kpi) => {
          const colors = colorMap[kpi.color as keyof typeof colorMap]
          const trend = resolveTrendFromChange(kpi.change)
          return (
            <CompactStatCard
              key={kpi.title}
              title={kpi.title}
              value={kpi.value}
              change={kpi.change}
              changeHint={kpi.changeHint}
              trend={trend}
              sentiment={resolveSentiment(trend, kpi.higherIsBetter)}
              icon={kpi.icon}
              iconClassName={colors.icon}
            />
          )
        })}
      </div>

      {/* 统计图表：类型 / 状态 / 性能三个同级分布图并排，避免 2 列布局下末位单卡留白 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>设备类型分布</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredDeviceChartData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <BarChartComponent
                data={filteredDeviceChartData}
                xKey="name"
                bars={
                  deviceTypeStatusKeys.length > 0
                    ? deviceTypeStatusKeys.map((status) => ({
                        key: status,
                        name: resolveStatusLabel(status),
                        color: resolveStatusColor(status),
                        stackId: 'a',
                      }))
                    : [{ key: 'count', name: '设备数量', color: '#3B82F6' }]
                }
                height={300}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>设备状态分布</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredStatusChartData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <PieChartComponent
                data={filteredStatusChartData}
                height={300}
                outerRadius={100}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>性能评级分布</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredPerformanceChartData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <PieChartComponent
                data={filteredPerformanceChartData}
                height={300}
                outerRadius={100}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* 排名表格 */}
      <Card>
        <CardHeader>
          <CardTitle>设备性能排名</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredRankingData.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">暂无排名数据</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3">排名</th>
                    <th className="text-left p-3">设备名称</th>
                    <th className="text-left p-3">类型</th>
                    <th className="text-left p-3">可用性</th>
                    <th className="text-left p-3" title="由可用性、响应时间等运行指标综合计算，与「平均巡检评分」口径不同">
                      性能评分
                    </th>
                    <th className="text-left p-3">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRankingData.map((item) => (
                    <tr key={item.rank} className="border-b hover:bg-muted/40 dark:hover:bg-muted/60">
                      <td className="p-3 font-medium">#{item.rank}</td>
                      <td className="p-3">{item.name}</td>
                      <td className="p-3">{item.type}</td>
                      <td className="p-3">{item.availability.toFixed(1)}%</td>
                      <td className="p-3">{item.score.toFixed(1)}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            item.status === '优秀'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                              : item.status === '良好'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
