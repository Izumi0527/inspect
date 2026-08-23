// 报告类型
export interface Report {
  id: string
  title: string
  description: string
  type: 'inspection' | 'trend' | 'statistics' | 'custom'
  category: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'
  format: 'pdf' | 'excel' | 'html' | 'word'
  status: 'generating' | 'completed' | 'failed' | 'scheduled'
  createdAt: string
  updatedAt: string
  generatedBy: string
  filePath?: string
  fileSize?: number
  downloadUrl?: string
  // 后端可选返回：HTML 预览地址（更适合在线查看），与 downloadUrl(主格式)区分
  previewUrl?: string
  // 后端可选返回：已落盘可用格式列表（如 ['pdf','html']）
  availableFormats?: string[]
  parameters: ReportParameters
  schedule?: ReportSchedule
}

// 报告参数
export interface ReportParameters {
  dateRange: {
    startDate: string
    endDate: string
  }
  devices?: string[] // 设备ID列表
  deviceGroups?: string[] // 设备组ID列表
  strategies?: string[] // 巡检策略ID列表
  templates?: string[] // 模板ID列表
  includeCharts: boolean
  includeDetailData: boolean
  includeRecommendations: boolean
  customFields?: Record<string, unknown>
}

// 报告调度
export interface ReportSchedule {
  enabled: boolean
  frequency: 'daily' | 'weekly' | 'monthly'
  dayOfWeek?: number // 0-6, 0为周日
  dayOfMonth?: number // 1-31
  time: string // HH:mm格式
  recipients: string[] // 邮箱列表
  lastRun?: string
  nextRun?: string
}

// 巡检报告数据
export interface InspectionReportData {
  summary: {
    totalDevices: number
    totalExecutions: number
    totalChecks: number
    passedChecks: number
    failedChecks: number
    warningChecks: number
    avgScore: number
    successRate: number
  }
  deviceResults: DeviceReportResult[]
  executionTrends: ExecutionTrendData[]
  problemAnalysis: ProblemAnalysisData[]
  recommendations: RecommendationData[]
}

// 设备报告结果
export interface DeviceReportResult {
  deviceId: string
  deviceName: string
  deviceType: string
  deviceGroup: string
  status: 'online' | 'offline' | 'warning' | 'error'
  totalChecks: number
  passedChecks: number
  failedChecks: number
  warningChecks: number
  score: number
  uptime: number // 可用性百分比
  avgResponseTime: number // 平均响应时间(ms)
  lastCheckTime: string
  issues: IssueData[]
  performanceMetrics: PerformanceMetrics
}

// 执行趋势数据
export interface ExecutionTrendData {
  date: string
  totalExecutions: number
  successfulExecutions: number
  failedExecutions: number
  avgScore: number
  avgDuration: number
  deviceCount: number
}

// 问题分析数据
export interface ProblemAnalysisData {
  category: string
  count: number
  percentage: number
  severity: 'low' | 'medium' | 'high' | 'critical'
  trend: 'increasing' | 'decreasing' | 'stable'
  affectedDevices: string[]
  description: string
  solutions?: string[]
}

// 建议数据
export interface RecommendationData {
  id: string
  type: 'optimization' | 'security' | 'maintenance' | 'capacity'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  title: string
  description: string
  affectedDevices: string[]
  estimatedImpact: string
  implementation: {
    steps: string[]
    estimatedTime: string
    resources: string[]
  }
}

// 问题数据
export interface IssueData {
  id: string
  type: 'connectivity' | 'performance' | 'security' | 'configuration'
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  firstDetected: string
  lastDetected: string
  occurrenceCount: number
  status: 'active' | 'resolved' | 'ignored'
  resolution?: string
}

// 性能指标
export interface PerformanceMetrics {
  cpu: {
    current: number
    average: number
    peak: number
  }
  memory: {
    current: number
    average: number
    peak: number
  }
  diskSpace: {
    used: number
    total: number
    percentage: number
  }
  networkTraffic: {
    inbound: number
    outbound: number
    utilization: number
  }
  temperature?: number
  powerConsumption?: number
}

export interface PerformanceMetricEntry {
  name: string
  current: number
  average: number
  peak: number
  unit?: string
  trend?: 'up' | 'down' | 'stable'
}

export interface PerformanceBenchmark {
  metric: string
  target: number
  actual: number
  status: 'met' | 'warning' | 'critical'
  gap?: number
}

export interface PerformanceMetricsResult {
  metrics: PerformanceMetricEntry[]
  benchmarks: PerformanceBenchmark[]
}

// 趋势分析数据
export interface TrendAnalysisData {
  timeRange: {
    startDate: string
    endDate: string
  }
  metrics: TrendMetric[]  // 改为数组类型，支持动态指标
  predictions: PredictionData[]
  alerts: TrendAlertData[]
  /**
   * 异常检测的执行情况。
   * 空 alerts 有两种含义——检测已执行但未发现异常，或采样点不足未执行，
   * 该字段用于区分二者，避免把「未检测」呈现为「一切正常」。
   */
  alertsMeta?: TrendAlertsMeta
}

// 趋势告警检测元信息
export interface TrendAlertsMeta {
  /** 是否真正执行了异常检测 */
  evaluated: boolean
  /** 执行检测所需的最少采样点数 */
  minPointsRequired: number
  /** 当前区间内各指标的最大采样点数 */
  actualPoints: number
}

// 趋势指标
export interface TrendMetric {
  name: string
  metricName?: string  // 后端返回的技术名称（如 availability）
  displayName?: string  // 后端返回的显示名称（如 "可用性"）
  unit?: string  // 后端返回的单位（如 "%", "ms"）
  current: number
  previous: number
  change: number
  changePercentage: number
  trend: 'up' | 'down' | 'stable'
  dataPoints: {
    timestamp: string
    value: number
  }[]
}

// 预测数据
export interface PredictionData {
  metric: string
  currentValue: number
  predictedValue: number
  confidence: number
  timeframe: string
  recommendation: string
  predictionPeriod?: string
  confidenceLevel?: number
}

// 趋势告警数据
export interface TrendAlertData {
  id: string
  type: 'threshold_breach' | 'anomaly' | 'capacity_warning' | 'downtime_risk'
  severity: 'info' | 'warning' | 'error' | 'critical'
  title: string
  description: string
  affectedMetrics: string[]
  detectedAt: string
  status: 'active' | 'acknowledged' | 'resolved'
  message?: string
}

// 统计报表数据
export interface StatisticsData {
  overview: {
    totalDevices: number
    activeDevices: number
    offlineDevices: number
    warningDevices: number
    errorDevices: number
    avgUptime: number
    totalExecutions: number
    avgScore: number
  }
  deviceDistribution: {
    byType: Record<string, number>
    byGroup: Record<string, number>
    byStatus: Record<string, number>
    byLocation: Record<string, number>
    /** 「类型 × 状态」交叉分布：外层键为设备类型，内层为该类型下各状态的设备数 */
    byTypeStatus: Record<string, Record<string, number>>
  }
  performanceStats: {
    byDevice: DevicePerformanceStats[]
    aggregated: AggregatedPerformanceStats
  }
  complianceStats: {
    overallCompliance: number
    byCategory: Record<string, number>
    failedChecks: ComplianceIssue[]
  }
  historicalComparison: {
    currentPeriod: PeriodStats
    previousPeriod: PeriodStats
    changes: Record<string, number>
  }
}

// 设备性能统计
export interface DevicePerformanceStats {
  deviceId: string
  deviceName: string
  deviceType: string
  metrics: {
    availability: number
    avgResponseTime: number
    errorRate: number
    utilization: number
  }
  ranking: number
}

// 聚合性能统计
export interface AggregatedPerformanceStats {
  avgAvailability: number
  avgResponseTime: number
  avgErrorRate: number
  avgUtilization: number
  topPerformers: string[]
  underPerformers: string[]
}

// 合规问题
export interface ComplianceIssue {
  deviceId: string
  deviceName: string
  checkName: string
  category: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  recommendation: string
  firstDetected: string
  status: 'open' | 'in_progress' | 'resolved'
}

// 时期统计
export interface PeriodStats {
  period: string
  totalExecutions: number
  avgScore: number
  avgUptime: number
  issueCount: number
  resolvedIssueCount: number
}

// 自定义报表配置
export interface CustomReportConfig {
  id: string
  name: string
  description: string
  // 后端补充字段（非所有接口都会返回）
  type?: 'template' | 'custom' | string
  isDefault?: boolean
  isActive?: boolean
  createdBy?: string
  createdAt?: string
  updatedAt?: string
  lastUsed?: string
  usageCount?: number
  template: ReportTemplate
  parameters: ReportParameters
  charts: ChartConfig[]
  tables: TableConfig[]
  filters: FilterConfig[]
  layout: LayoutConfig
}

// 报表模板
export interface ReportTemplate {
  id: string
  name: string
  type: 'standard' | 'custom'
  sections: TemplateSection[]
  styles: ReportStyles
}

// 模板节
export type TemplateSectionContent =
  | string
  | Record<string, unknown>
  | Array<Record<string, unknown>>

export interface TemplateSection {
  id: string
  type: 'header' | 'summary' | 'chart' | 'table' | 'text' | 'recommendations'
  title: string
  content: TemplateSectionContent
  order: number
  visible: boolean
}

// 图表配置
export interface ChartConfig {
  id: string
  type: 'line' | 'bar' | 'pie' | 'area' | 'scatter' | 'heatmap'
  title: string
  dataSource: string
  xAxis: string
  yAxis: string
  series: string[]
  filters?: Record<string, unknown>
  options?: Record<string, unknown>
}

// 表格配置
export interface TableConfig {
  id: string
  title: string
  dataSource: string
  columns: TableColumnConfig[]
  filters?: Record<string, unknown>
  pagination?: boolean
  exportable?: boolean
}

// 表格列配置
export interface TableColumnConfig {
  key: string
  title: string
  type: 'text' | 'number' | 'date' | 'status' | 'progress'
  width?: number
  sortable?: boolean
  filterable?: boolean
  format?: string
}

// 过滤器配置
export interface FilterConfig {
  id: string
  type: 'date' | 'select' | 'multiselect' | 'text' | 'number'
  field: string
  label: string
  options?: Array<{
    label: string
    value: string | number | boolean
  }>
  defaultValue?: string | number | boolean | Array<string | number> | null
}

// 布局配置
export interface LayoutConfig {
  columns: number
  sections: LayoutSection[]
}

// 布局节
export interface LayoutSection {
  id: string
  type: 'chart' | 'table' | 'text' | 'metric'
  span: number
  height?: number
  order: number
}

// 报表样式
export interface ReportStyles {
  theme: 'light' | 'dark' | 'professional'
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
  }
  fonts: {
    heading: string
    body: string
    code: string
  }
  spacing: {
    small: number
    medium: number
    large: number
  }
}

// API响应类型
export interface ReportsApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

// 报表统计
export interface ReportStats {
  totalReports: number
  generatedToday: number
  scheduledReports: number
  failedReports: number
  avgGenerationTime: number
  mostUsedFormat: string
  storageUsed: number
}
