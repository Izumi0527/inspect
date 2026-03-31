import React, { useState, useMemo } from 'react'
import { BarChart3, Users, Target, Activity, Filter, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  CardSkeleton,
  ChartSkeleton,
  TableSkeleton,
  ErrorAlert,
  DateRangePicker,
  QuickDateRangeButtons,
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

interface Props {
  searchText: string
}

const resolveTrendFromChange = (change: string): 'up' | 'down' | 'stable' => {
  if (change.trim().startsWith('+')) return 'up'
  if (change.trim().startsWith('-')) return 'down'
  return 'stable'
}

export const StatisticsReports: React.FC<Props> = ({ searchText }) => {
  const canCreate = usePermission(Permission.REPORTS_CREATE)
  // ==================== State Management ====================
  const [dateRange, setDateRange] = useState({
    startDate: formatDateYMD(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
    endDate: formatDateYMD(new Date())
  })
  const [showFilters, setShowFilters] = useState(false)
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

  // 设备类型分布数据（用于柱状图）
  const deviceTypeChartData = useMemo(() => {
    if (!statisticsData?.deviceDistribution?.byType) return []

    return Object.entries(statisticsData.deviceDistribution.byType).map(([name, count]) => {
      const online = Math.round(count * (overview.activeDevices / overview.totalDevices || 1))
      const offline = count - online
      return { name, count, online, offline }
    })
  }, [statisticsData, overview])

  // 性能评级分布数据（用于饼图）
  const performanceChartData = useMemo(() => {
    if (!statisticsData?.performanceStats?.byDevice) return []

    const scoreRanges = [
      { name: '优秀', min: 90, max: 100, color: '#10B981', count: 0 },
      { name: '良好', min: 75, max: 90, color: '#3B82F6', count: 0 },
      { name: '一般', min: 60, max: 75, color: '#F59E0B', count: 0 },
      { name: '较差', min: 0, max: 60, color: '#EF4444', count: 0 }
    ]

    statisticsData.performanceStats.byDevice.forEach((device: any) => {
      const availability = device.metrics?.availability || 0
      for (const range of scoreRanges) {
        if (availability >= range.min && availability < range.max) {
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

    return rankingsData.slice(0, 10).map((device: any, index: number) => ({
      rank: index + 1,
      name: device.deviceName || device.device_name || `Device-${device.deviceId}`,
      type: device.deviceType || device.device_type || '-',
      availability: device.metrics?.availability || 0,
      score: device.ranking || 0,
      status: device.metrics?.availability >= 98 ? '优秀' :
              device.metrics?.availability >= 95 ? '良好' : '一般'
    }))
  }, [rankingsData])

  // KPI 指标卡片数据
  const kpiCards = useMemo(() => {
    return [
      {
        title: '设备总数',
        value: String(overview.totalDevices),
        change: kpiData?.inspection_completion_rate_change || '+0',
        icon: Users,
        color: 'blue'
      },
      {
        title: '在线率',
        value: `${((overview.activeDevices / overview.totalDevices || 0) * 100).toFixed(1)}%`,
        change: kpiData?.device_availability_change || '+0%',
        icon: Activity,
        color: 'green'
      },
      {
        title: '平均评分',
        value: overview.avgScore.toFixed(1),
        change: kpiData?.avg_health_score_change || '+0',
        icon: Target,
        color: 'purple'
      },
      {
        title: '故障率',
        value: `${((overview.errorDevices / overview.totalDevices || 0) * 100).toFixed(1)}%`,
        change: kpiData?.severe_issue_count_change || '-0%',
        icon: BarChart3,
        color: 'red'
      }
    ]
  }, [overview, kpiData])

  // 颜色映射对象 - 解决动态类名问题
  const colorMap = {
    blue: {
      bg: 'bg-blue-100 dark:bg-blue-900/20',
      text: 'text-blue-600 dark:text-blue-400',
      icon: 'text-blue-600 dark:text-blue-400'
    },
    green: {
      bg: 'bg-green-100 dark:bg-green-900/20',
      text: 'text-green-600 dark:text-green-400',
      icon: 'text-green-600 dark:text-green-400'
    },
    purple: {
      bg: 'bg-purple-100 dark:bg-purple-900/20',
      text: 'text-purple-600 dark:text-purple-400',
      icon: 'text-purple-600 dark:text-purple-400'
    },
    red: {
      bg: 'bg-red-100 dark:bg-red-900/20',
      text: 'text-red-600 dark:text-red-400',
      icon: 'text-red-600 dark:text-red-400'
    }
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
    toast.success('数据已刷新')
  }

  const handleQuickDateRange = (startDate: string, endDate: string) => {
    setDateRange({ startDate, endDate })
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

  // ==================== Search Filter ====================
  const normalizedKeyword = searchText.trim().toLowerCase()

  const filteredDeviceChartData = normalizedKeyword
    ? deviceTypeChartData.filter((item) => item.name.toLowerCase().includes(normalizedKeyword))
    : deviceTypeChartData

  const filteredPerformanceChartData = normalizedKeyword
    ? performanceChartData.filter((item) => item.name.toLowerCase().includes(normalizedKeyword))
    : performanceChartData

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
      {/* 筛选面板 */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-4">
            {/* 筛选器标题栏 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-muted-foreground" />
                <h3 className="text-sm font-medium text-foreground">数据筛选</h3>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                {showFilters ? (
                  <>
                    <ChevronUp className="w-4 h-4 mr-1" />
                    收起
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4 mr-1" />
                    展开
                  </>
                )}
              </Button>
            </div>

            {/* 筛选器内容 */}
            {showFilters && (
              <div className="space-y-4 pt-4 border-t">
                {/* 日期范围选择 */}
                <div>
                  <DateRangePicker
                    startDate={dateRange.startDate}
                    endDate={dateRange.endDate}
                    onStartDateChange={(date) => setDateRange(prev => ({ ...prev, startDate: date }))}
                    onEndDateChange={(date) => setDateRange(prev => ({ ...prev, endDate: date }))}
                    label="日期范围"
                  />
                  <QuickDateRangeButtons
                    onRangeSelect={handleQuickDateRange}
                    className="mt-2"
                  />
                </div>

                {/* 设备类型筛选 */}
                {deviceTypeOptions.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-foreground/90 mb-2">
                      设备类型
                    </label>
                    <MultiSelect
                      options={deviceTypeOptions}
                      value={deviceTypes}
                      onChange={setDeviceTypes}
                      placeholder="选择设备类型（可多选）"
                    />
                  </div>
                )}

                {/* 位置筛选 */}
                {locationOptions.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-foreground/90 mb-2">
                      设备位置
                    </label>
                    <MultiSelect
                      options={locationOptions}
                      value={locations}
                      onChange={setLocations}
                      placeholder="选择设备位置（可多选）"
                    />
                  </div>
                )}

                {/* 筛选操作按钮 */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDeviceTypes([])
                      setLocations([])
                      setDateRange({
                        startDate: formatDateYMD(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
                        endDate: formatDateYMD(new Date())
                      })
                    }}
                  >
                    重置筛选
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefresh}
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    刷新数据
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 操作按钮 */}
      {canCreate ? (
        <div className="flex gap-2">
          <Button
            onClick={handleGenerateReport}
            disabled={generateReportMutation.isPending}
          >
            {generateReportMutation.isPending ? '生成中...' : '生成统计报表'}
          </Button>
          <Button
            variant="outline"
            onClick={handleExportData}
            disabled={exportExcelMutation.isPending}
          >
            {exportExcelMutation.isPending ? '导出中...' : '导出数据'}
          </Button>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          当前账号暂无生成/导出报表权限，请联系管理员开通。
        </div>
      )}

      {/* KPI 指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {kpiCards.map((kpi) => {
          const colors = colorMap[kpi.color as keyof typeof colorMap]
          return (
            <CompactStatCard
              key={kpi.title}
              title={kpi.title}
              value={kpi.value}
              change={kpi.change}
              changeHint="vs 上期"
              trend={resolveTrendFromChange(kpi.change)}
              icon={kpi.icon}
              iconClassName={colors.icon}
            />
          )
        })}
      </div>

      {/* 统计图表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                bars={[
                  { key: 'online', name: '在线', color: '#10B981', stackId: 'a' },
                  { key: 'offline', name: '离线', color: '#EF4444', stackId: 'a' }
                ]}
                height={300}
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
                    <th className="text-left p-3">性能评分</th>
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
                              ? 'bg-green-100 text-green-800'
                              : item.status === '良好'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-yellow-100 text-yellow-800'
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
