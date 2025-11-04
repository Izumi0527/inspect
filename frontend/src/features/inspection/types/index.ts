// 巡检策略类型
export interface InspectionStrategy {
  id: string
  name: string
  description: string
  type: 'scheduled' | 'manual'
  cron?: string // Cron表达式（定时巡检）
  devices: string[] // 关联设备ID列表
  templates: string[] // 巡检模板ID列表
  enabled: boolean
  createdAt: string
  updatedAt: string
  nextRunTime?: string // 下次执行时间
}

// 巡检模板类型
export interface InspectionTemplate {
  id: string
  name: string
  description: string
  category: 'network' | 'system' | 'security' | 'custom'
  deviceTypes: string[] // 支持的设备类型
  checkItems: InspectionCheckItem[]
  isBuiltIn: boolean // 是否为内置模板
  createdAt: string
  updatedAt: string
}

// 巡检项类型
export interface InspectionCheckItem {
  id: string
  name: string
  type: 'snmp' | 'ssh' | 'http' | 'ping' | 'script'
  config: {
    oid?: string // SNMP OID
    command?: string // SSH命令
    url?: string // HTTP请求URL
    script?: string // 自定义脚本
    timeout?: number
    expectedValue?: string
    threshold?: {
      warning?: number
      critical?: number
    }
  }
  weight: number // 权重分数
}

// 巡检执行记录
export interface InspectionExecution {
  id: string
  strategyId: string
  strategyName: string
  triggerType: 'scheduled' | 'manual'
  triggerUser?: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number // 执行进度 0-100
  totalDevices: number
  completedDevices: number
  startTime: string
  endTime?: string
  duration?: number // 执行时长（秒）
  summary: InspectionSummary
}

// 巡检汇总结果
export interface InspectionSummary {
  totalChecks: number
  passedChecks: number
  failedChecks: number
  warningChecks: number
  score: number // 巡检评分 0-100
  deviceResults: DeviceInspectionResult[]
}

// 设备巡检结果
export interface DeviceInspectionResult {
  deviceId: string
  deviceName: string
  deviceType: string
  status: 'success' | 'warning' | 'error' | 'offline'
  score: number
  checkResults: CheckResult[]
  executionTime: number // 执行耗时（毫秒）
}

// 检查结果
export interface CheckResult {
  checkItemId: string
  checkItemName: string
  status: 'pass' | 'warning' | 'fail' | 'skip'
  actualValue?: string
  expectedValue?: string
  message?: string
  executionTime: number
}

// 巡检报告
export interface InspectionReport {
  id: string
  executionId: string
  title: string
  type: 'summary' | 'detailed' | 'trend'
  format: 'pdf' | 'excel' | 'html' | 'word'
  content: string
  generatedAt: string
  generatedBy: string
  filePath?: string
}

// API响应类型
export interface InspectionApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

// 巡检统计数据
export interface InspectionStats {
  totalStrategies: number
  activeStrategies: number
  todayExecutions: number
  successRate: number
  avgScore: number
  changes: {
    executionsChange: string
    successRateChange: string
    avgScoreChange: string
    strategiesChange: string
  }
  recentExecutions: InspectionExecution[]
}

// 巡检任务
export interface InspectionTask {
  id: string
  strategyId: string
  deviceId: string
  templateId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  startTime?: string
  endTime?: string
  checkItems: InspectionCheckItem[]
  results?: CheckResult[]
}

// 巡检结果
export interface InspectionResult {
  id: string
  taskId: string
  executionId: string
  deviceId: string
  deviceName: string
  status: 'success' | 'warning' | 'error' | 'offline'
  score: number
  totalChecks: number
  passedChecks: number
  failedChecks: number
  warningChecks: number
  results: CheckResult[]
  summary: string
  createdAt: string
}