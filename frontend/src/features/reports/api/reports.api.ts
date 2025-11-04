import { api } from '@/lib/api-client'
import {
  AggregatedPerformanceStats,
  ChartConfig,
  ComplianceIssue,
  CustomReportConfig,
  DevicePerformanceStats,
  DeviceReportResult,
  ExecutionTrendData,
  FilterConfig,
  InspectionReportData,
  IssueData,
  LayoutConfig,
  PeriodStats,
  PerformanceMetrics,
  PerformanceMetricsResult,
  PredictionData,
  ProblemAnalysisData,
  RecommendationData,
  Report,
  ReportParameters,
  ReportSchedule,
  ReportStats,
  ReportStyles,
  ReportTemplate,
  StatisticsData,
  TableConfig,
  TemplateSection,
  TrendAlertData,
  TrendAnalysisData,
  TrendMetric
} from '../types'

type UnknownRecord = Record<string, unknown>
const REPORT_TYPES = ['inspection', 'trend', 'statistics', 'custom'] as const
const REPORT_CATEGORIES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'] as const
const REPORT_STATUSES = ['generating', 'completed', 'failed', 'scheduled'] as const
const REPORT_FORMATS = ['pdf', 'excel', 'html', 'word'] as const
const SCHEDULE_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const
const PERFORMANCE_TREND_VALUES = ['up', 'down', 'stable'] as const
const PERFORMANCE_BENCHMARK_STATUS = ['met', 'warning', 'critical'] as const
const ISSUE_TYPES = ['connectivity', 'performance', 'security', 'configuration'] as const
const ISSUE_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const
const ISSUE_STATUS = ['active', 'resolved', 'ignored'] as const
const RECOMMENDATION_TYPES = ['optimization', 'security', 'maintenance', 'capacity'] as const
const RECOMMENDATION_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
const TREND_DIRECTIONS = PERFORMANCE_TREND_VALUES
const TREND_ALERT_TYPES = ['threshold_breach', 'anomaly', 'capacity_warning', 'downtime_risk'] as const
const TREND_ALERT_SEVERITIES = ['info', 'warning', 'error', 'critical'] as const
const TREND_ALERT_STATUS = ['active', 'acknowledged', 'resolved'] as const
const DEVICE_STATUSES = ['online', 'offline', 'warning', 'error'] as const
const TEMPLATE_TYPES = ['standard', 'custom'] as const
const TEMPLATE_SECTION_TYPES = ['header', 'summary', 'chart', 'table', 'text', 'recommendations'] as const
const CHART_TYPES = ['line', 'bar', 'pie', 'area', 'scatter', 'heatmap'] as const
const TABLE_COLUMN_TYPES = ['text', 'number', 'date', 'status', 'progress'] as const
const FILTER_TYPES = ['date', 'select', 'multiselect', 'text', 'number'] as const
const LAYOUT_SECTION_TYPES = ['chart', 'table', 'text', 'metric'] as const
const REPORT_THEMES = ['light', 'dark', 'professional'] as const
const COMPLIANCE_STATUS = ['open', 'in_progress', 'resolved'] as const

type PerformanceTrend = typeof PERFORMANCE_TREND_VALUES[number]

interface ReportsApiEnvelope<T> {
  success?: boolean
  data?: T
  message?: string
}

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toRecord = (value: unknown): UnknownRecord => (isRecord(value) ? value : {})

const toStringSafe = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

const toOptionalString = (value: unknown): string | undefined => {
  const result = toStringSafe(value).trim()
  return result ? result : undefined
}

const toNumberSafe = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

const toOptionalNumber = (value: unknown): number | undefined => {
  const parsed = toNumberSafe(value, Number.NaN)
  return Number.isFinite(parsed) ? parsed : undefined
}

const toBooleanSafe = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value === 'true' || value === '1'
  return fallback
}

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(item => toStringSafe(item)).filter(item => item !== '') : []

const mapRecordArray = <T>(value: unknown, mapper: (item: unknown) => T): T[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map(item => mapper(item))
}

const toNumberRecord = (value: unknown): Record<string, number> => {
  if (!isRecord(value)) {
    return {}
  }

  return Object.entries(value).reduce<Record<string, number>>((acc, [key, val]) => {
    const num = toNumberSafe(val, Number.NaN)
    if (Number.isFinite(num)) {
      acc[key] = num
    }
    return acc
  }, {})
}

const toPrimitiveValue = (value: unknown): string | number | boolean | undefined => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  return undefined
}

const toPrimitiveArray = (value: unknown): Array<string | number> | undefined => {
  if (!Array.isArray(value)) {
    return undefined
  }

  const normalized = value
    .map(item => (typeof item === 'string' || typeof item === 'number' ? item : undefined))
    .filter((item): item is string | number => item !== undefined)

  return normalized.length > 0 ? normalized : undefined
}

const toEnumValue = <T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T[number]) : fallback

const generateTempId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `temp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

const createDefaultReportParameters = (): ReportParameters => ({
  dateRange: { startDate: '', endDate: '' },
  devices: [],
  deviceGroups: [],
  strategies: [],
  templates: [],
  includeCharts: true,
  includeDetailData: true,
  includeRecommendations: true,
})

const transformReportParameters = (input: unknown): ReportParameters => {
  const data = toRecord(input)
  const range = toRecord(data.dateRange ?? data['date_range'])
  const devices = toStringArray(data.devices ?? data['device_ids'])
  const deviceGroups = toStringArray(data.deviceGroups ?? data['device_groups'])
  const strategies = toStringArray(data.strategies ?? data['strategy_ids'])
  const templates = toStringArray(data.templates ?? data['template_ids'])

  return {
    dateRange: {
      startDate: toStringSafe(range.startDate ?? range['start_date']),
      endDate: toStringSafe(range.endDate ?? range['end_date']),
    },
    devices,
    deviceGroups,
    strategies,
    templates,
    includeCharts: toBooleanSafe(data.includeCharts ?? data['include_charts'], true),
    includeDetailData: toBooleanSafe(data.includeDetailData ?? data['include_detail_data'], true),
    includeRecommendations: toBooleanSafe(data.includeRecommendations ?? data['include_recommendations'], true),
    customFields: isRecord(data.customFields ?? data['custom_fields'])
      ? toRecord(data.customFields ?? data['custom_fields'])
      : undefined,
  }
}

const transformReportSchedule = (input: unknown): ReportSchedule => {
  const data = toRecord(input)
  return {
    enabled: toBooleanSafe(data.enabled, false),
    frequency: toEnumValue(data.frequency ?? data['frequency'], SCHEDULE_FREQUENCIES, 'daily'),
    dayOfWeek: toOptionalNumber(data.dayOfWeek ?? data['day_of_week']),
    dayOfMonth: toOptionalNumber(data.dayOfMonth ?? data['day_of_month']),
    time: toStringSafe(data.time ?? data['time']),
    recipients: toStringArray(data.recipients ?? data['recipients']),
    lastRun: toOptionalString(data.lastRun ?? data['last_run']),
    nextRun: toOptionalString(data.nextRun ?? data['next_run']),
  }
}

const transformReportData = (input: unknown): Report => {
  const data = toRecord(input)
  const parameters = data.parameters !== undefined
    ? transformReportParameters(data.parameters)
    : createDefaultReportParameters()
  const scheduleValue = data.schedule ?? data['schedule']
  const createdAt = toOptionalString(data.createdAt ?? data['created_at']) ?? new Date().toISOString()
  const updatedAt = toOptionalString(data.updatedAt ?? data['updated_at']) ?? createdAt
  const fileSize = toOptionalNumber(data.fileSize ?? data['file_size'])

  return {
    id: toStringSafe(data.id ?? data['report_id'], generateTempId()),
    title: toStringSafe(data.title ?? data['name'], '未命名报表'),
    description: toStringSafe(data.description),
    type: toEnumValue(data.type, REPORT_TYPES, 'custom'),
    category: toEnumValue(data.category, REPORT_CATEGORIES, 'custom'),
    status: toEnumValue(data.status, REPORT_STATUSES, 'generating'),
    format: toEnumValue(data.format, REPORT_FORMATS, 'pdf'),
    createdAt,
    updatedAt,
    generatedBy: toStringSafe(
      data.generatedBy ?? data['generated_by'] ?? data['created_by'] ?? data['creator'],
      '系统'
    ),
    filePath: toOptionalString(data.filePath ?? data['file_path']),
    fileSize: fileSize === undefined ? undefined : fileSize,
    downloadUrl: toOptionalString(data.downloadUrl ?? data['download_url']),
    parameters,
    schedule: scheduleValue ? transformReportSchedule(scheduleValue) : undefined,
  }

}

// ==================== 报表绠＄悊 API ====================

export async function fetchReports(params?: {
  page?: number
  pageSize?: number
  type?: string
  status?: string
  createdBy?: string
  startDate?: string
  endDate?: string
}): Promise<{ reports: Report[]; total: number; pages: number }> {
  try {
    let endpoint = '/reports'
    const searchParams = new URLSearchParams()

    if (params) {
      if (params.page) searchParams.append('page', params.page.toString())
      if (params.pageSize) searchParams.append('page_size', params.pageSize.toString())
      if (params.type) searchParams.append('type', params.type)
      if (params.status) searchParams.append('status', params.status)
      if (params.createdBy) searchParams.append('created_by', params.createdBy)
      if (params.startDate) searchParams.append('start_date', params.startDate)
      if (params.endDate) searchParams.append('end_date', params.endDate)
    }

    if (searchParams.toString()) {
      endpoint += `?${searchParams.toString()}`
    }

    const response = await api.get<ReportsApiEnvelope<UnknownRecord>>(endpoint)

    if (response.success === false) {
      throw new Error(response.message || '获取报表鍒楄〃失败')
    }

    if (!response.data) {
      throw new Error('获取报表鍒楄〃失败')
    }

    const payload = toRecord(response.data)
    const reports = Array.isArray(payload.reports)
      ? payload.reports.map(item => transformReportData(item))
      : []

    return {
      reports,
      total: toNumberSafe(payload.total),
      pages: toNumberSafe(payload.pages),
    }
  } catch (error) {
    console.error('获取报表鍒楄〃失败:', error)
    return {
      reports: getDefaultReports(),
      total: 0,
      pages: 0,
    }
  }
}

export async function fetchReport(id: string): Promise<Report | null> {
  try {
    const response = await api.get<ReportsApiEnvelope<UnknownRecord>>(`/reports/${id}`)

    if (response.success === false) {
      throw new Error(response.message || '获取报表璇︽儏失败')
    }

    if (!response.data) {
      throw new Error('获取报表璇︽儏失败')
    }

    return transformReportData(response.data)
  } catch (error) {
    console.error('获取报表璇︽儏失败:', error)
    return null
  }
}

export async function createReport(reportData: {
  title: string
  description?: string
  type: string
  category: string
  format: string
  parameters: ReportParameters
  schedule?: ReportSchedule
}): Promise<Report> {
  try {
    const response = await api.post<ReportsApiEnvelope<UnknownRecord>>('/reports', reportData)

    if (response.success === false || !response.data) {
      throw new Error(response.message || '创建报表失败')
    }

    return transformReportData(response.data)
  } catch (error) {
    console.error('创建报表失败:', error)
    throw error
  }
}

export async function updateReport(id: string, updates: Partial<Report>): Promise<Report> {
  try {
    const response = await api.put<ReportsApiEnvelope<UnknownRecord>>(`/reports/${id}`, updates)

    if (response.success === false || !response.data) {
      throw new Error(response.message || '更新报表失败')
    }

    return transformReportData(response.data)
  } catch (error) {
    console.error('更新报表失败:', error)
    throw error
  }
}

export async function deleteReport(id: string): Promise<boolean> {
  try {
    const response = await api.delete<ReportsApiEnvelope<unknown>>(`/reports/${id}`)

    if (response.success === false) {
      throw new Error(response.message || '删除报表失败')
    }

    return response.success === undefined ? true : response.success
  } catch (error) {
    console.error('删除报表失败:', error)
    throw error
  }
}

export async function generateReport(id: string): Promise<Report> {
  try {
    const response = await api.post<ReportsApiEnvelope<UnknownRecord>>(`/reports/${id}/generate`)

    if (response.success === false || !response.data) {
      throw new Error(response.message || '生成报表失败')
    }

    return transformReportData(response.data)
  } catch (error) {
    console.error('生成报表失败:', error)
    throw error
  }
}

export async function downloadReport(id: string): Promise<string> {
  try {
    const response = await api.get<ReportsApiEnvelope<UnknownRecord>>(`/reports/${id}/download`)

    if (response.success === false || !response.data) {
      throw new Error(response.message || '获取涓嬭浇閾炬帴失败')
    }

    const payload = toRecord(response.data)
    const url = toOptionalString(payload.download_url ?? payload.downloadUrl)

    if (!url) {
      throw new Error('获取涓嬭浇閾炬帴失败')
    }

    return url
  } catch (error) {
    console.error('获取涓嬭浇閾炬帴失败:', error)
    throw error
  }
}

export async function previewReport(id: string): Promise<UnknownRecord | null> {
  try {
    const response = await api.get<ReportsApiEnvelope<UnknownRecord>>(`/reports/${id}/preview`)

    if (response.success === false) {
      throw new Error(response.message || '获取报表预览失败')
    }

    if (!response.data) {
      throw new Error('获取报表预览失败')
    }

    return toRecord(response.data)
  } catch (error) {
    console.error('获取报表预览失败:', error)
    return null
  }
}

export async function cloneReport(id: string, title: string): Promise<Report> {
  try {
    const response = await api.post<ReportsApiEnvelope<UnknownRecord>>(`/reports/${id}/clone`, { title })

    if (response.success === false || !response.data) {
      throw new Error(response.message || '未命名报表')
    }

    return transformReportData(response.data)
  } catch (error) {
    console.error('澶嶅埗报表失败:', error)
    throw error
  }
}

// ==================== 巡检报告 API ====================

// 生成巡检报告
export async function generateInspectionReport(reportData: {
  executionIds?: string[]
  dateRange: {
    startDate: string
    endDate: string
  }
  devices?: string[]
  strategies?: string[]
  format: 'pdf' | 'excel' | 'html' | 'word'
  includeCharts: boolean
  includeDetailData: boolean
  includeRecommendations: boolean
}): Promise<Report> {
  try {
    const response = await api.post<ReportsApiEnvelope<UnknownRecord>>('/reports/inspection/generate', reportData)

    if (response.success && response.data) {
      return transformReportData(response.data)
    } else {
      throw new Error('生成巡检报告失败')
    }
  } catch (error) {
    console.error('生成巡检报告失败:', error)
    throw error
  }
}

// 获取巡检报告数据
export async function getInspectionReportData(params: {
  dateRange: {
    startDate: string
    endDate: string
  }
  devices?: string[]
  strategies?: string[]
}): Promise<InspectionReportData> {
  try {
    const response = await api.post<{success: boolean, data: unknown, message?: string}>('/reports/inspection/data', params)

    if (response.success && response.data) {
      return transformInspectionReportData(response.data)
    } else {
      throw new Error('获取巡检报告数据失败')
    }
  } catch (error) {
    console.error('获取巡检报告数据失败:', error)
    return getDefaultInspectionReportData()
  }
}

// 获取设备报告对比
export async function compareDeviceReports(params: {
  deviceIds: string[]
  dateRange: {
    startDate: string
    endDate: string
  }
}): Promise<unknown> {
  try {
    const response = await api.post<{success: boolean, data: unknown, message?: string}>('/reports/inspection/compare', params)

    if (response.success && response.data) {
      return response.data
    } else {
      throw new Error('获取设备对比报告失败')
    }
  } catch (error) {
    console.error('获取设备对比报告失败:', error)
    return getDefaultCompareReports()
  }
}

// ==================== 趋势分析 API ====================

// 获取趋势分析数据
export async function getTrendAnalysis(params: {
  metrics: string[] // ['availability', 'performance', 'errors', 'capacity']
  dateRange: {
    startDate: string
    endDate: string
  }
  devices?: string[]
  granularity: 'hour' | 'day' | 'week' | 'month'
}): Promise<TrendAnalysisData> {
  try {
    const response = await api.post<{success: boolean, data: unknown, message?: string}>('/reports/trends/analysis', params)

    if (response.success && response.data) {
      return transformTrendAnalysisData(response.data)
    } else {
      throw new Error('获取趋势分析数据失败')
    }
  } catch (error) {
    console.error('获取趋势分析数据失败:', error)
    return getDefaultTrendAnalysisData()
  }
}

// 生成瓒嬪娍报告
export async function generateTrendReport(reportData: {
  title: string
  metrics: string[]
  dateRange: {
    startDate: string
    endDate: string
  }
  devices?: string[]
  format: 'pdf' | 'excel' | 'html' | 'word'
  includePredictions: boolean
}): Promise<Report> {
  try {
    const response = await api.post<{success: boolean, data: unknown, message?: string}>('/reports/trends/generate', reportData)

    if (response.success && response.data) {
      return transformReportData(response.data)
    } else {
      throw new Error('生成瓒嬪娍报告失败')
    }
  } catch (error) {
    console.error('生成瓒嬪娍报告失败:', error)
    throw error
  }
}

// 获取预测数据
export async function getPredictions(params: {
  metrics: string[]
  devices?: string[]
  timeframe: 'week' | 'month' | 'quarter'
}): Promise<unknown> {
  try {
    const response = await api.post<{success: boolean, data: unknown, message?: string}>('/reports/trends/predictions', params)

    if (response.success && response.data) {
      return response.data
    } else {
      throw new Error('获取预测数据失败')
    }
  } catch (error) {
    console.error('获取预测数据失败:', error)
    return getDefaultPredictions()
  }
}

// 获取异常检测结果
export async function getAnomalyDetection(params: {
  metrics: string[]
  devices?: string[]
  dateRange: {
    startDate: string
    endDate: string
  }
  sensitivity: 'low' | 'medium' | 'high'
}): Promise<unknown> {
  try {
    const response = await api.post<{success: boolean, data: unknown, message?: string}>('/reports/trends/anomalies', params)

    if (response.success && response.data) {
      return response.data
    } else {
      throw new Error('获取异常检测结果失败')
    }
  } catch (error) {
    console.error('获取异常检测结果失败:', error)
    return getDefaultAnomalyData()
  }
}

// ==================== 统计报表 API ====================

// 获取统计数据
export async function getStatistics(params: {
  startDate: string                    // ✅ 扁平化日期参数
  endDate: string
  deviceTypes?: string[]               // ✅ 改名为device_types对应
  locations?: string[]                 // ✅ 新增位置筛选
  deviceGroups?: string[]              // ✅ 新增设备组筛选
  groupBy?: 'hour' | 'day' | 'week' | 'month'  // ✅ 时间粒度而非分组维度
  includeTrends?: boolean              // ✅ 改名
}): Promise<StatisticsData> {
  try {
    // 构建后端期望的请求体（使用snake_case）
    const requestBody = {
      start_date: params.startDate,
      end_date: params.endDate,
      device_types: params.deviceTypes,
      locations: params.locations,
      device_groups: params.deviceGroups,
      group_by: params.groupBy || 'day',
      include_trends: params.includeTrends !== undefined ? params.includeTrends : true
    }

    const response = await api.post<{success: boolean, data: unknown, message?: string}>('/reports/statistics/data', requestBody)

    if (response.success && response.data) {
      return transformStatisticsData(response.data)
    } else {
      throw new Error('获取统计数据失败')
    }
  } catch (error) {
    console.error('获取统计数据失败:', error)
    return getDefaultStatisticsData()
  }
}

// 生成统计报表
export async function generateStatisticsReport(reportData: {
  title: string
  description?: string                 // ✅ 新增描述字段
  startDate: string                    // ✅ 扁平化日期参数
  endDate: string
  deviceTypes?: string[]               // ✅ 改名为device_types对应
  locations?: string[]                 // ✅ 新增位置筛选
  format: 'pdf' | 'excel' | 'html' | 'word'
  includeCharts?: boolean              // ✅ 是否包含图表
  includeTrends?: boolean              // ✅ 是否包含趋势
  includeRankings?: boolean            // ✅ 是否包含排名
}): Promise<Report> {
  try {
    // 构建后端期望的请求体（使用snake_case）
    const requestBody = {
      title: reportData.title,
      description: reportData.description,
      start_date: reportData.startDate,
      end_date: reportData.endDate,
      device_types: reportData.deviceTypes,
      locations: reportData.locations,
      format: reportData.format,
      include_charts: reportData.includeCharts !== undefined ? reportData.includeCharts : true,
      include_trends: reportData.includeTrends !== undefined ? reportData.includeTrends : true,
      include_rankings: reportData.includeRankings !== undefined ? reportData.includeRankings : true
    }

    const response = await api.post<{success: boolean, data: unknown, message?: string}>('/reports/statistics/generate', requestBody)

    if (response.success && response.data) {
      return transformReportData(response.data)
    } else {
      throw new Error('生成统计报表失败')
    }
  } catch (error) {
    console.error('生成统计报表失败:', error)
    throw error
  }
}

// 获取KPI数据
export async function getKPIData(params: {
  startDate: string                    // ✅ 扁平化日期参数
  endDate: string
  deviceTypes?: string[]               // ✅ 改名为device_types对应
  comparisonPeriod?: 'previous_period' | 'previous_year'  // ✅ 对比周期
}): Promise<unknown> {
  try {
    // 构建后端期望的请求体（使用snake_case）
    const requestBody = {
      start_date: params.startDate,
      end_date: params.endDate,
      device_types: params.deviceTypes,
      comparison_period: params.comparisonPeriod
    }

    const response = await api.post<{success: boolean, data: unknown, message?: string}>('/reports/statistics/kpi', requestBody)

    if (response.success && response.data) {
      return response.data
    } else {
      throw new Error('获取KPI数据失败')
    }
  } catch (error) {
    console.error('获取KPI数据失败:', error)
    return getDefaultKPIData()
  }
}

// 获取排名数据
export async function getRankings(params: {
  startDate: string                    // ✅ 扁平化日期参数
  endDate: string
  rankingType?: 'performance' | 'reliability' | 'efficiency'  // ✅ 改名为ranking_type
  deviceTypes?: string[]               // ✅ 设备类型筛选
  topN?: number                        // ✅ 改名为top_n
  includeBottom?: boolean              // ✅ 是否包含后N名
}): Promise<unknown> {
  try {
    // 构建后端期望的请求体（使用snake_case）
    const requestBody = {
      start_date: params.startDate,
      end_date: params.endDate,
      ranking_type: params.rankingType || 'performance',
      device_types: params.deviceTypes,
      top_n: params.topN || 10,
      include_bottom: params.includeBottom !== undefined ? params.includeBottom : true
    }

    const response = await api.post<{success: boolean, data: unknown, message?: string}>('/reports/statistics/rankings', requestBody)

    if (response.success && response.data) {
      return response.data
    } else {
      throw new Error('获取排名数据失败')
    }
  } catch (error) {
    console.error('获取排名数据失败:', error)
    return getDefaultRankings()
  }
}

// ==================== 自定义报表 API ====================

// 获取自定义报表配置列表
export async function fetchCustomReportConfigs(): Promise<CustomReportConfig[]> {
  try {
    const response = await api.get<ReportsApiEnvelope<unknown>>('/reports/custom/configs')

    if (response.success && response.data) {
      const items = Array.isArray(response.data) ? response.data : []
      return items.map(transformCustomReportConfigData)
    } else {
      throw new Error('获取自定义报表配置列表失败')
    }
  } catch (error) {
    console.error('获取自定义报表配置列表失败:', error)
    return getDefaultCustomReportConfigs()
  }
}

// 获取自定义报表配置详情
export async function fetchCustomReportConfig(id: string): Promise<CustomReportConfig | null> {
  try {
    const response = await api.get<ReportsApiEnvelope<unknown>>(`/reports/custom/configs/${id}`)

    if (response.success && response.data) {
      return transformCustomReportConfigData(response.data)
    } else {
      throw new Error('获取自定义报表配置详情失败')
    }
  } catch (error) {
    console.error('获取自定义报表配置详情失败:', error)
    return null
  }
}

// 创建自定义报表配置
export async function createCustomReportConfig(configData: Omit<CustomReportConfig, 'id'>): Promise<CustomReportConfig> {
  try {
    const response = await api.post<ReportsApiEnvelope<unknown>>('/reports/custom/configs', configData)

    if (response.success && response.data) {
      return transformCustomReportConfigData(response.data)
    } else {
      throw new Error('创建自定义报表配置失败')
    }
  } catch (error) {
    console.error('创建自定义报表配置失败:', error)
    throw error
  }
}

// 更新自定义报表配置
export async function updateCustomReportConfig(id: string, updates: Partial<CustomReportConfig>): Promise<CustomReportConfig> {
  try {
    const response = await api.put<ReportsApiEnvelope<unknown>>(`/reports/custom/configs/${id}`, updates)

    if (response.success && response.data) {
      return transformCustomReportConfigData(response.data)
    } else {
      throw new Error('更新自定义报表配置失败')
    }
  } catch (error) {
    console.error('更新自定义报表配置失败:', error)
    throw error
  }
}

// 删除自定义报表配置
export async function deleteCustomReportConfig(id: string): Promise<boolean> {
  try {
    const response = await api.delete<ReportsApiEnvelope<unknown>>(`/reports/custom/configs/${id}`)
    return response.success !== false
  } catch (error) {
    console.error('删除自定义报表配置失败:', error)
    throw error
  }
}

// 使用配置生成报表
export async function generateFromConfig(configId: string, parameters?: ReportParameters): Promise<Report> {
  try {
    const response = await api.post<{success: boolean, data: unknown, message?: string}>(`/reports/custom/configs/${configId}/generate`, { parameters })

    if (response.success && response.data) {
      return transformReportData(response.data)
    } else {
      throw new Error('使用配置生成报表失败')
    }
  } catch (error) {
    console.error('使用配置生成报表失败:', error)
    throw error
  }
}

// 预览自定义报表配置
export async function previewCustomReportConfig(configId: string, parameters?: ReportParameters): Promise<unknown> {
  try {
    const response = await api.post<ReportsApiEnvelope<unknown>>(`/reports/custom/configs/${configId}/preview`, { parameters })

    if (response.success && response.data) {
      return response.data
    } else {
      throw new Error('预览自定义报表配置失败')
    }
  } catch (error) {
    console.error('预览自定义报表配置失败:', error)
    return null
  }
}

// ==================== 报表妯℃澘 API ====================

// 获取妯℃澘鍒楄〃
export async function fetchReportTemplates(): Promise<ReportTemplate[]> {
  try {
    const response = await api.get<{success: boolean, data: unknown, message?: string}>('/reports/templates')

    if (response.success) {
      return mapRecordArray(response.data, transformReportTemplateData)
    }

    throw new Error('获取报表妯℃澘鍒楄〃失败')
  } catch (error) {
    console.error('获取报表妯℃澘鍒楄〃失败:', error)
    return getDefaultReportTemplates()
  }
}

// 获取妯℃澘璇︽儏
export async function fetchReportTemplate(id: string): Promise<ReportTemplate | null> {
  try {
    const response = await api.get<{success: boolean, data: unknown, message?: string}>(`/reports/templates/${id}`)

    if (response.success && response.data) {
      return transformReportTemplateData(response.data)
    } else {
      throw new Error('获取报表妯℃澘璇︽儏失败')
    }
  } catch (error) {
    console.error('获取报表妯℃澘璇︽儏失败:', error)
    return null
  }
}

// 创建妯℃澘
export async function createReportTemplate(templateData: Omit<ReportTemplate, 'id'>): Promise<ReportTemplate> {
  try {
    const response = await api.post<{success: boolean, data: unknown, message?: string}>('/reports/templates', templateData)

    if (response.success && response.data) {
      return transformReportTemplateData(response.data)
    } else {
      throw new Error('创建报表妯℃澘失败')
    }
  } catch (error) {
    console.error('创建报表妯℃澘失败:', error)
    throw error
  }
}

// 更新妯℃澘
export async function updateReportTemplate(id: string, updates: Partial<ReportTemplate>): Promise<ReportTemplate> {
  try {
    const response = await api.put<{success: boolean, data: unknown, message?: string}>(`/reports/templates/${id}`, updates)

    if (response.success && response.data) {
      return transformReportTemplateData(response.data)
    } else {
      throw new Error('更新报表妯℃澘失败')
    }
  } catch (error) {
    console.error('更新报表妯℃澘失败:', error)
    throw error
  }
}

// 删除妯℃澘
export async function deleteReportTemplate(id: string): Promise<boolean> {
  try {
    const response = await api.delete<{success: boolean, message?: string}>(`/reports/templates/${id}`)
    
    return response.success
  } catch (error) {
    console.error('删除报表妯℃澘失败:', error)
    throw error
  }
}

// 澶嶅埗妯℃澘
export async function cloneReportTemplate(id: string, name: string): Promise<ReportTemplate> {
  try {
    const response = await api.post<{success: boolean, data: unknown, message?: string}>(`/reports/templates/${id}/clone`, { name })

    if (response.success && response.data) {
      return transformReportTemplateData(response.data)
    } else {
      throw new Error('澶嶅埗报表妯℃澘失败')
    }
  } catch (error) {
    console.error('澶嶅埗报表妯℃澘失败:', error)
    throw error
  }
}

// ==================== 瀵煎嚭 API ====================

// 导出Excel
export async function exportToExcel(data: {
  title: string
  sheets: Array<{
    name: string
    data: unknown[]
    columns: Array<{
      header: string
      key: string
      width?: number
    }>
  }>
}): Promise<string> {
  try {
    const response = await api.post<{success: boolean, data: unknown, message?: string}>('/reports/export/excel', data)

    if (response.success) {
      const record = toRecord(response.data)
      const downloadUrl = toOptionalString(record.downloadUrl ?? record['download_url'])

      if (downloadUrl) {
        return downloadUrl
      }
    }

    throw new Error('Excel导出失败')
  } catch (error) {
    console.error('Excel导出失败:', error)
    throw error
  }
}

// 导出PDF
export async function exportToPDF(data: {
  title: string
  content: string
  options?: {
    format: 'A4' | 'A3'
    orientation: 'portrait' | 'landscape'
    includeHeader: boolean
    includeFooter: boolean
  }
}): Promise<string> {
  try {
    const response = await api.post<{success: boolean, data: unknown, message?: string}>('/reports/export/pdf', data)

    if (response.success) {
      const record = toRecord(response.data)
      const downloadUrl = toOptionalString(record.downloadUrl ?? record['download_url'])

      if (downloadUrl) {
        return downloadUrl
      }
    }

    throw new Error('PDF导出失败')
  } catch (error) {
    console.error('PDF导出失败:', error)
    throw error
  }
}

// 导出Word
export async function exportToWord(data: {
  title: string
  sections: Array<{
    title: string
    content: string
    type: 'text' | 'table' | 'chart'
  }>
}): Promise<string> {
  try {
    const response = await api.post<{success: boolean, data: unknown, message?: string}>('/reports/export/word', data)

    if (response.success) {
      const record = toRecord(response.data)
      const downloadUrl = toOptionalString(record.downloadUrl ?? record['download_url'])

      if (downloadUrl) {
        return downloadUrl
      }
    }

    throw new Error('Word导出失败')
  } catch (error) {
    console.error('Word导出失败:', error)
    throw error
  }
}

// ==================== 报表统计 API ====================

// 获取报表统计数据
export async function fetchReportStats(): Promise<ReportStats> {
  try {
    const response = await api.get<{success: boolean, data: unknown, message?: string}>('/reports/stats')

    if (response.success && response.data) {
      return transformReportStatsData(response.data)
    } else {
      throw new Error('获取报表统计数据失败')
    }
  } catch (error) {
    console.error('获取报表统计数据失败:', error)
    return getDefaultReportStats()
  }
}

// 获取浣跨敤分析
export async function getUsageAnalysis(params: {
  dateRange: {
    startDate: string
    endDate: string
  }
}): Promise<unknown> {
  try {
    const response = await api.post<{success: boolean, data: unknown, message?: string}>('/reports/stats/usage', params)

    if (response.success && response.data) {
      return response.data
    } else {
      throw new Error('获取浣跨敤分析失败')
    }
  } catch (error) {
    console.error('获取浣跨敤分析失败:', error)
    return getDefaultUsageAnalysis()
  }
}

// 获取鎬ц兘鎸囨爣
export async function getPerformanceMetrics(): Promise<PerformanceMetricsResult> {
  try {
    const response = await api.get<ReportsApiEnvelope<unknown>>('/reports/stats/performance')

    if (response.success && response.data) {
      return transformPerformanceMetricsResult(response.data)
    }

    throw new Error('获取性能指标失败')
  } catch (error) {
    console.error('获取性能指标失败:', error)
    return getDefaultPerformanceMetrics()
  }
}


// ==================== 数据转换函数 ====================

const transformIssueData = (input: unknown): IssueData => {
  const data = toRecord(input)
  return {
    id: toStringSafe(data.id, generateTempId()),
    type: toEnumValue(data.type, ISSUE_TYPES, 'performance'),
    severity: toEnumValue(data.severity, ISSUE_SEVERITIES, 'medium'),
    title: toStringSafe(data.title),
    description: toStringSafe(data.description),
    firstDetected: toStringSafe(data.firstDetected ?? data['first_detected']),
    lastDetected: toStringSafe(data.lastDetected ?? data['last_detected']),
    occurrenceCount: toNumberSafe(data.occurrenceCount ?? data['occurrence_count']),
    status: toEnumValue(data.status, ISSUE_STATUS, 'active'),
    resolution: toOptionalString(data.resolution),
  }
}

const transformRecommendationData = (input: unknown): RecommendationData => {
  const data = toRecord(input)
  const implementation = toRecord(data.implementation)
  return {
    id: toStringSafe(data.id, generateTempId()),
    type: toEnumValue(data.type, RECOMMENDATION_TYPES, 'maintenance'),
    priority: toEnumValue(data.priority, RECOMMENDATION_PRIORITIES, 'medium'),
    title: toStringSafe(data.title),
    description: toStringSafe(data.description),
    affectedDevices: toStringArray(data.affectedDevices ?? data['affected_devices']),
    estimatedImpact: toStringSafe(data.estimatedImpact ?? data['estimated_impact']),
    implementation: {
      steps: toStringArray(implementation.steps),
      estimatedTime: toStringSafe(implementation.estimatedTime ?? implementation['estimated_time']),
      resources: toStringArray(implementation.resources),
    },
  }
}

const transformProblemAnalysisData = (input: unknown): ProblemAnalysisData => {
  const data = toRecord(input)
  return {
    category: toStringSafe(data.category),
    count: toNumberSafe(data.count),
    percentage: toNumberSafe(data.percentage),
    severity: toEnumValue(data.severity, ISSUE_SEVERITIES, 'medium'),
    trend: toEnumValue(data.trend, ['increasing', 'decreasing', 'stable'] as const, 'stable'),
    affectedDevices: toStringArray(data.affectedDevices ?? data['affected_devices']),
    description: toStringSafe(data.description),
    solutions: Array.isArray(data.solutions) ? data.solutions.map(item => toStringSafe(item)).filter(Boolean) : [],
  }
}

const transformExecutionTrendData = (input: unknown): ExecutionTrendData => {
  const data = toRecord(input)
  return {
    date: toStringSafe(data.date),
    totalExecutions: toNumberSafe(data.totalExecutions ?? data['total_executions']),
    successfulExecutions: toNumberSafe(data.successfulExecutions ?? data['successful_executions']),
    failedExecutions: toNumberSafe(data.failedExecutions ?? data['failed_executions']),
    avgScore: toNumberSafe(data.avgScore ?? data['avg_score']),
    avgDuration: toNumberSafe(data.avgDuration ?? data['avg_duration']),
    deviceCount: toNumberSafe(data.deviceCount ?? data['device_count']),
  }
}

const transformPerformanceMetrics = (input: unknown): PerformanceMetrics => {
  const data = toRecord(input)
  const cpu = toRecord(data.cpu)
  const memory = toRecord(data.memory)
  const disk = toRecord(data.diskSpace ?? data['disk_space'])
  const network = toRecord(data.networkTraffic ?? data['network_traffic'])
  return {
    cpu: {
      current: toNumberSafe(cpu.current),
      average: toNumberSafe(cpu.average),
      peak: toNumberSafe(cpu.peak),
    },
    memory: {
      current: toNumberSafe(memory.current),
      average: toNumberSafe(memory.average),
      peak: toNumberSafe(memory.peak),
    },
    diskSpace: {
      used: toNumberSafe(disk.used),
      total: toNumberSafe(disk.total),
      percentage: toNumberSafe(disk.percentage),
    },
    networkTraffic: {
      inbound: toNumberSafe(network.inbound),
      outbound: toNumberSafe(network.outbound),
      utilization: toNumberSafe(network.utilization),
    },
    temperature: toOptionalNumber(data.temperature),
    powerConsumption: toOptionalNumber(data.powerConsumption ?? data['power_consumption']),
  }
}

const transformPerformanceMetricsResult = (input: unknown): PerformanceMetricsResult => {
  const data = toRecord(input)

  const metrics = Array.isArray(data.metrics)
    ? data.metrics
        .map(item => {
          const record = toRecord(item)
          const trendRaw = toStringSafe(record.trend).toLowerCase()
          const trend = PERFORMANCE_TREND_VALUES.includes(trendRaw as PerformanceTrend)
            ? (trendRaw as PerformanceTrend)
            : undefined

          return {
            name: toStringSafe(record.name),
            current: toNumberSafe(record.current),
            average: toNumberSafe(record.average),
            peak: toNumberSafe(record.peak),
            unit: toOptionalString(record.unit),
            trend,
          }
        })
        .filter(metric => metric.name)
    : []

  const benchmarks = Array.isArray(data.benchmarks)
    ? data.benchmarks
        .map(item => {
          const record = toRecord(item)
          return {
            metric: toStringSafe(record.metric),
            target: toNumberSafe(record.target),
            actual: toNumberSafe(record.actual),
            status: toEnumValue(record.status, PERFORMANCE_BENCHMARK_STATUS, 'warning'),
            gap: toOptionalNumber(record.gap),
          }
        })
        .filter(benchmark => benchmark.metric)
    : []

  return { metrics, benchmarks }
}

const transformDeviceReportResult = (input: unknown): DeviceReportResult => {
  const data = toRecord(input)
  return {
    deviceId: toStringSafe(data.deviceId ?? data['device_id']),
    deviceName: toStringSafe(data.deviceName ?? data['device_name']),
    deviceType: toStringSafe(data.deviceType ?? data['device_type']),
    deviceGroup: toStringSafe(data.deviceGroup ?? data['device_group']),
    status: toEnumValue(data.status, DEVICE_STATUSES, 'offline'),
    totalChecks: toNumberSafe(data.totalChecks ?? data['total_checks']),
    passedChecks: toNumberSafe(data.passedChecks ?? data['passed_checks']),
    failedChecks: toNumberSafe(data.failedChecks ?? data['failed_checks']),
    warningChecks: toNumberSafe(data.warningChecks ?? data['warning_checks']),
    score: toNumberSafe(data.score),
    uptime: toNumberSafe(data.uptime),
    avgResponseTime: toNumberSafe(data.avgResponseTime ?? data['avg_response_time']),
    lastCheckTime: toStringSafe(data.lastCheckTime ?? data['last_check_time']),
    issues: mapRecordArray(data.issues, transformIssueData),
    performanceMetrics: transformPerformanceMetrics(data.performanceMetrics ?? data['performance_metrics']),
  }
}

const transformInspectionReportData = (input: unknown): InspectionReportData => {
  const data = toRecord(input)
  const summary = toRecord(data.summary)
  return {
    summary: {
      totalDevices: toNumberSafe(summary.totalDevices ?? summary['total_devices']),
      totalExecutions: toNumberSafe(summary.totalExecutions ?? summary['total_executions']),
      totalChecks: toNumberSafe(summary.totalChecks ?? summary['total_checks']),
      passedChecks: toNumberSafe(summary.passedChecks ?? summary['passed_checks']),
      failedChecks: toNumberSafe(summary.failedChecks ?? summary['failed_checks']),
      warningChecks: toNumberSafe(summary.warningChecks ?? summary['warning_checks']),
      avgScore: toNumberSafe(summary.avgScore ?? summary['avg_score']),
      successRate: toNumberSafe(summary.successRate ?? summary['success_rate']),
    },
    deviceResults: mapRecordArray(data.deviceResults ?? data['device_results'], transformDeviceReportResult),
    executionTrends: mapRecordArray(data.executionTrends ?? data['execution_trends'], transformExecutionTrendData),
    problemAnalysis: mapRecordArray(data.problemAnalysis ?? data['problem_analysis'], transformProblemAnalysisData),
    recommendations: mapRecordArray(data.recommendations, transformRecommendationData),
  }
}

const transformTrendMetric = (input: unknown, fallbackName: string): TrendMetric => {
  const data = toRecord(input)
  const rawPoints = data.dataPoints ?? data['data_points']
  const points = Array.isArray(rawPoints)
    ? rawPoints.map((item): { timestamp: string; value: number } => {
        const record = toRecord(item)
        return {
          timestamp: toStringSafe(record.timestamp ?? record['timestamp']),
          value: toNumberSafe(record.value),
        }
      })
    : []
  return {
    name: toStringSafe(data.name, fallbackName),
    metricName: toStringSafe(data.metricName ?? data['metric_name'], fallbackName),  // 后端字段
    displayName: toStringSafe(data.displayName ?? data['display_name'], fallbackName),  // 后端字段
    unit: toStringSafe(data.unit, ''),  // 后端字段
    current: toNumberSafe(data.current ?? data['current_value']),
    previous: toNumberSafe(data.previous ?? data['previous_value']),
    change: toNumberSafe(data.change ?? data['change_rate']),
    changePercentage: toNumberSafe(data.changePercentage ?? data['change_percentage']),
    trend: toEnumValue(data.trend ?? data['trend_direction'], TREND_DIRECTIONS, 'stable'),
    dataPoints: points,
  }
}

const transformPredictionData = (input: unknown): PredictionData => {
  const data = toRecord(input)
  return {
    metric: toStringSafe(data.metric),
    currentValue: toNumberSafe(data.currentValue ?? data['current_value']),
    predictedValue: toNumberSafe(data.predictedValue ?? data['predicted_value']),
    confidence: toNumberSafe(data.confidence),
    timeframe: toStringSafe(data.timeframe),
    recommendation: toStringSafe(data.recommendation),
  }
}

const transformTrendAlertData = (input: unknown): TrendAlertData => {
  const data = toRecord(input)
  return {
    id: toStringSafe(data.id, generateTempId()),
    type: toEnumValue(data.type, TREND_ALERT_TYPES, 'anomaly'),
    severity: toEnumValue(data.severity, TREND_ALERT_SEVERITIES, 'warning'),
    title: toStringSafe(data.title),
    description: toStringSafe(data.description),
    affectedMetrics: toStringArray(data.affectedMetrics ?? data['affected_metrics']),
    detectedAt: toStringSafe(data.detectedAt ?? data['detected_at']),
    status: toEnumValue(data.status, TREND_ALERT_STATUS, 'active'),
  }
}

const transformTrendAnalysisData = (input: unknown): TrendAnalysisData => {
  const data = toRecord(input)
  const range = toRecord(data.timeRange ?? data['time_range'])

  // 后端现在返回数组格式，使用 mapRecordArray 处理
  const metricsArray = mapRecordArray(data.metrics, (item) => {
    const record = toRecord(item)
    const metricName = toStringSafe(record.metric_name ?? record.metricName, 'unknown')
    return transformTrendMetric(record, metricName)
  })

  return {
    timeRange: {
      startDate: toStringSafe(range.startDate ?? range['start_date']),
      endDate: toStringSafe(range.endDate ?? range['end_date']),
    },
    metrics: metricsArray,  // 直接返回数组
    predictions: mapRecordArray(data.predictions, transformPredictionData),
    alerts: mapRecordArray(data.alerts, transformTrendAlertData),
  }
}

const transformDevicePerformanceStats = (input: unknown): DevicePerformanceStats => {
  const data = toRecord(input)
  const metrics = toRecord(data.metrics)
  return {
    deviceId: toStringSafe(data.deviceId ?? data['device_id']),
    deviceName: toStringSafe(data.deviceName ?? data['device_name']),
    deviceType: toStringSafe(data.deviceType ?? data['device_type']),
    metrics: {
      availability: toNumberSafe(metrics.availability),
      avgResponseTime: toNumberSafe(metrics.avgResponseTime ?? metrics['avg_response_time']),
      errorRate: toNumberSafe(metrics.errorRate ?? metrics['error_rate']),
      utilization: toNumberSafe(metrics.utilization),
    },
    ranking: toNumberSafe(data.ranking),
  }
}

const transformAggregatedPerformanceStats = (input: unknown): AggregatedPerformanceStats => {
  const data = toRecord(input)
  return {
    avgAvailability: toNumberSafe(data.avgAvailability ?? data['avg_availability']),
    avgResponseTime: toNumberSafe(data.avgResponseTime ?? data['avg_response_time']),
    avgErrorRate: toNumberSafe(data.avgErrorRate ?? data['avg_error_rate']),
    avgUtilization: toNumberSafe(data.avgUtilization ?? data['avg_utilization']),
    topPerformers: toStringArray(data.topPerformers ?? data['top_performers']),
    underPerformers: toStringArray(data.underPerformers ?? data['under_performers']),
  }
}

const transformComplianceIssue = (input: unknown): ComplianceIssue => {
  const data = toRecord(input)
  return {
    deviceId: toStringSafe(data.deviceId ?? data['device_id']),
    deviceName: toStringSafe(data.deviceName ?? data['device_name']),
    checkName: toStringSafe(data.checkName ?? data['check_name']),
    category: toStringSafe(data.category),
    severity: toEnumValue(data.severity, ISSUE_SEVERITIES, 'medium'),
    description: toStringSafe(data.description),
    recommendation: toStringSafe(data.recommendation),
    firstDetected: toStringSafe(data.firstDetected ?? data['first_detected']),
    status: toEnumValue(data.status, COMPLIANCE_STATUS, 'open'),
  }
}

const transformPeriodStats = (input: unknown): PeriodStats => {
  const data = toRecord(input)
  return {
    period: toStringSafe(data.period),
    totalExecutions: toNumberSafe(data.totalExecutions ?? data['total_executions']),
    avgScore: toNumberSafe(data.avgScore ?? data['avg_score']),
    avgUptime: toNumberSafe(data.avgUptime ?? data['avg_uptime']),
    issueCount: toNumberSafe(data.issueCount ?? data['issue_count']),
    resolvedIssueCount: toNumberSafe(data.resolvedIssueCount ?? data['resolved_issue_count']),
  }
}

const transformStatisticsData = (input: unknown): StatisticsData => {
  const data = toRecord(input)
  const overview = toRecord(data.overview)
  const deviceDistribution = toRecord(data.deviceDistribution ?? data['device_distribution'])
  const performanceStats = toRecord(data.performanceStats ?? data['performance_stats'])
  const complianceStats = toRecord(data.complianceStats ?? data['compliance_stats'])
  const historical = toRecord(data.historicalComparison ?? data['historical_comparison'])
  return {
    overview: {
      totalDevices: toNumberSafe(overview.totalDevices ?? overview['total_devices']),
      activeDevices: toNumberSafe(overview.activeDevices ?? overview['active_devices'] ?? overview['online_devices']),
      offlineDevices: toNumberSafe(overview.offlineDevices ?? overview['offline_devices']),
      warningDevices: toNumberSafe(overview.warningDevices ?? overview['warning_devices']),
      errorDevices: toNumberSafe(overview.errorDevices ?? overview['error_devices']),
      avgUptime: toNumberSafe(overview.avgUptime ?? overview['avg_uptime'] ?? overview['average_uptime']),
      totalExecutions: toNumberSafe(overview.totalExecutions ?? overview['total_executions']),
      avgScore: toNumberSafe(overview.avgScore ?? overview['avg_score']),
    },
    deviceDistribution: {
      byType: toNumberRecord(deviceDistribution.byType ?? deviceDistribution['by_type']),
      byGroup: toNumberRecord(deviceDistribution.byGroup ?? deviceDistribution['by_group']),
      byStatus: toNumberRecord(deviceDistribution.byStatus ?? deviceDistribution['by_status']),
      byLocation: toNumberRecord(deviceDistribution.byLocation ?? deviceDistribution['by_location']),
    },
    performanceStats: {
      byDevice: mapRecordArray(performanceStats.byDevice ?? performanceStats['by_device'], transformDevicePerformanceStats),
      aggregated: transformAggregatedPerformanceStats(performanceStats.aggregated),
    },
    complianceStats: {
      overallCompliance: toNumberSafe(complianceStats.overallCompliance ?? complianceStats['overall_compliance']),
      byCategory: toNumberRecord(complianceStats.byCategory ?? complianceStats['by_category']),
      failedChecks: mapRecordArray(complianceStats.failedChecks ?? complianceStats['failed_checks'], transformComplianceIssue),
    },
    historicalComparison: {
      currentPeriod: transformPeriodStats(historical.currentPeriod ?? historical['current_period']),
      previousPeriod: transformPeriodStats(historical.previousPeriod ?? historical['previous_period']),
      changes: toNumberRecord(historical.changes),
    },
  }
}

const transformTemplateSection = (input: unknown): TemplateSection => {
  const data = toRecord(input)
  return {
    id: toStringSafe(data.id, generateTempId()),
    type: toEnumValue(data.type, TEMPLATE_SECTION_TYPES, 'text'),
    title: toStringSafe(data.title),
    content: data.content as TemplateSection['content'],
    order: toNumberSafe(data.order),
    visible: toBooleanSafe(data.visible, true),
  }
}

const transformChartConfig = (input: unknown): ChartConfig => {
  const data = toRecord(input)
  return {
    id: toStringSafe(data.id, generateTempId()),
    type: toEnumValue(data.type, CHART_TYPES, 'line'),
    title: toStringSafe(data.title),
    dataSource: toStringSafe(data.dataSource ?? data['data_source']),
    xAxis: toStringSafe(data.xAxis ?? data['x_axis']),
    yAxis: toStringSafe(data.yAxis ?? data['y_axis']),
    series: toStringArray(data.series),
    filters: isRecord(data.filters) ? data.filters : undefined,
    options: isRecord(data.options) ? data.options : undefined,
  }
}

const transformTableColumn = (input: unknown): TableConfig['columns'][number] => {
  const data = toRecord(input)
  return {
    key: toStringSafe(data.key),
    title: toStringSafe(data.title),
    type: toEnumValue(data.type, TABLE_COLUMN_TYPES, 'text'),
    width: toOptionalNumber(data.width),
    sortable: toBooleanSafe(data.sortable, false),
    filterable: toBooleanSafe(data.filterable, false),
    format: toOptionalString(data.format),
  }
}

const transformTableConfig = (input: unknown): TableConfig => {
  const data = toRecord(input)
  return {
    id: toStringSafe(data.id, generateTempId()),
    title: toStringSafe(data.title),
    dataSource: toStringSafe(data.dataSource ?? data['data_source']),
    columns: mapRecordArray(data.columns, transformTableColumn),
    filters: isRecord(data.filters) ? data.filters : undefined,
    pagination: toBooleanSafe(data.pagination, false),
    exportable: toBooleanSafe(data.exportable, false),
  }
}

const transformFilterConfig = (input: unknown): FilterConfig => {
  const data = toRecord(input)
  const optionsValue = Array.isArray(data.options)
    ? data.options
        .map(option => {
          const record = toRecord(option)
          const optionValue = toPrimitiveValue(record.value)
          if (optionValue === undefined) {
            return undefined
          }
          return {
            label: toStringSafe(record.label),
            value: optionValue,
          }
        })
        .filter((item): item is { label: string; value: string | number | boolean } => item !== undefined)
    : undefined

  const defaultValueRaw = data.defaultValue
  const defaultValue =
    defaultValueRaw === null
      ? null
      : toPrimitiveValue(defaultValueRaw) ?? toPrimitiveArray(defaultValueRaw)

  return {
    id: toStringSafe(data.id, generateTempId()),
    type: toEnumValue(data.type, FILTER_TYPES, 'text'),
    field: toStringSafe(data.field),
    label: toStringSafe(data.label),
    options: optionsValue,
    defaultValue,
  }
}

const transformLayoutSection = (input: unknown): LayoutConfig['sections'][number] => {
  const data = toRecord(input)
  return {
    id: toStringSafe(data.id, generateTempId()),
    type: toEnumValue(data.type, LAYOUT_SECTION_TYPES, 'text'),
    span: toNumberSafe(data.span, 1),
    height: toOptionalNumber(data.height),
    order: toNumberSafe(data.order),
  }
}

const transformLayoutConfig = (input: unknown): LayoutConfig => {
  const data = toRecord(input)
  return {
    columns: toNumberSafe(data.columns, 1),
    sections: mapRecordArray(data.sections, transformLayoutSection),
  }
}

const transformReportStyles = (input: unknown): ReportStyles => {
  const data = toRecord(input)
  const colors = toRecord(data.colors)
  const fonts = toRecord(data.fonts)
  const spacing = toRecord(data.spacing)
  return {
    theme: toEnumValue(data.theme, REPORT_THEMES, 'light'),
    colors: {
      primary: toStringSafe(colors.primary, '#000000'),
      secondary: toStringSafe(colors.secondary, '#666666'),
      accent: toStringSafe(colors.accent, '#333333'),
      background: toStringSafe(colors.background, '#ffffff'),
      text: toStringSafe(colors.text, '#000000'),
    },
    fonts: {
      heading: toStringSafe(fonts.heading, 'Arial'),
      body: toStringSafe(fonts.body, 'Arial'),
      code: toStringSafe(fonts.code, 'monospace'),
    },
    spacing: {
      small: toNumberSafe(spacing.small, 4),
      medium: toNumberSafe(spacing.medium, 8),
      large: toNumberSafe(spacing.large, 16),
    },
  }
}

const transformReportTemplateData = (input: unknown): ReportTemplate => {
  const data = toRecord(input)
  return {
    id: toStringSafe(data.id, generateTempId()),
    name: toStringSafe(data.name, '未命名模板'),
    type: toEnumValue(data.type, TEMPLATE_TYPES, 'custom'),
    sections: mapRecordArray(data.sections, transformTemplateSection),
    styles: transformReportStyles(data.styles),
  }
}

const transformCustomReportConfigData = (input: unknown): CustomReportConfig => {
  const data = toRecord(input)
  return {
    id: toStringSafe(data.id, generateTempId()),
    name: toStringSafe(data.name, '未命名方案'),
    description: toStringSafe(data.description),
    template: transformReportTemplateData(data.template),
    parameters: transformReportParameters(data.parameters),
    charts: mapRecordArray(data.charts, transformChartConfig),
    tables: mapRecordArray(data.tables, transformTableConfig),
    filters: mapRecordArray(data.filters, transformFilterConfig),
    layout: transformLayoutConfig(data.layout),
  }
}

const transformReportStatsData = (input: unknown): ReportStats => {
  const data = toRecord(input)
  return {
    totalReports: toNumberSafe(data.totalReports ?? data['total_reports']),
    generatedToday: toNumberSafe(data.generatedToday ?? data['generated_today']),
    scheduledReports: toNumberSafe(data.scheduledReports ?? data['scheduled_reports']),
    failedReports: toNumberSafe(data.failedReports ?? data['failed_reports']),
    avgGenerationTime: toNumberSafe(data.avgGenerationTime ?? data['average_generation_time']),
    mostUsedFormat: toStringSafe(data.mostUsedFormat ?? data['most_used_format'], 'pdf'),
    storageUsed: toNumberSafe(data.storageUsed ?? data['storage_used']),
  }
}

// ==================== 默认数据 ====================

function getDefaultReports(): Report[] {
  return [
    {
      id: 'sample-report-1',
      title: '样例巡检报告',
      description: '示例数据：用于在接口无响应时填充页面内容。',
      type: 'inspection',
      category: 'custom',
      status: 'completed',
      format: 'pdf',
      createdAt: new Date(Date.now() - 86_400_000).toISOString(),
      updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
      generatedBy: '系统管理员',
      filePath: undefined,
      fileSize: 1_024_000,
      downloadUrl: undefined,
      parameters: createDefaultReportParameters(),
      schedule: undefined,
    },
  ]
}

function getDefaultInspectionReportData(): InspectionReportData {
  return {
    summary: {
      totalDevices: 0,
      totalExecutions: 0,
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 0,
      warningChecks: 0,
      avgScore: 0,
      successRate: 0,
    },
    deviceResults: [],
    executionTrends: [],
    problemAnalysis: [],
    recommendations: [],
  }
}

function getDefaultCompareReports(): UnknownRecord {
  return { devices: [], comparisons: [] }
}

function getDefaultTrendAnalysisData(): TrendAnalysisData {
  return {
    timeRange: {
      startDate: '',
      endDate: '',
    },
    metrics: {
      availability: transformTrendMetric({}, 'availability'),
      performance: transformTrendMetric({}, 'performance'),
      errors: transformTrendMetric({}, 'errors'),
      capacity: transformTrendMetric({}, 'capacity'),
    },
    predictions: [],
    alerts: [],
  }
}

function getDefaultPredictions(): UnknownRecord {
  return {
    predictions: [],
    confidence: [],
  }
}

function getDefaultAnomalyData(): UnknownRecord {
  return {
    anomalies: [],
    patterns: [],
  }
}

function getDefaultStatisticsData(): StatisticsData {
  return transformStatisticsData({})
}

function getDefaultKPIData(): UnknownRecord {
  return {
    kpis: [],
    benchmarks: [],
  }
}

function getDefaultRankings(): UnknownRecord {
  return {
    rankings: [],
    metrics: [],
  }
}

function getDefaultCustomReportConfigs(): CustomReportConfig[] {
  return []
}

function getDefaultReportTemplates(): ReportTemplate[] {
  return []
}

function getDefaultReportStats(): ReportStats {
  return transformReportStatsData({})
}

function getDefaultUsageAnalysis(): UnknownRecord {
  return {
    usage: [],
    trends: [],
  }
}

function getDefaultPerformanceMetrics(): PerformanceMetricsResult {
  return {
    metrics: [],
    benchmarks: [],
  }
}

// ==================== API 瀵硅薄瀵煎嚭 ====================

export const reportsApi = {
  fetchReports,
  fetchReport,
  createReport,
  updateReport,
  deleteReport,
  generateReport,
  downloadReport,
  previewReport,
  cloneReport
}

export const inspectionReportsApi = {
  generateInspectionReport,
  getInspectionReportData,
  compareDeviceReports
}

export const trendAnalysisApi = {
  getTrendAnalysis,
  generateTrendReport,
  getPredictions,
  getAnomalyDetection
}

export const statisticsApi = {
  getStatistics,
  generateStatisticsReport,
  getKPIData,
  getRankings
}

export const customReportsApi = {
  fetchCustomReportConfigs,
  fetchCustomReportConfig,
  createCustomReportConfig,
  updateCustomReportConfig,
  deleteCustomReportConfig,
  generateFromConfig,
  previewCustomReportConfig
}

export const reportTemplatesApi = {
  fetchReportTemplates,
  fetchReportTemplate,
  createReportTemplate,
  updateReportTemplate,
  deleteReportTemplate,
  cloneReportTemplate
}

export const exportApi = {
  exportToExcel,
  exportToPDF,
  exportToWord
}

export const reportStatsApi = {
  fetchReportStats,
  getUsageAnalysis,
  getPerformanceMetrics
}
















