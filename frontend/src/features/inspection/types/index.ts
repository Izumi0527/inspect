// ============================================================================
// 巡检系统类型定义
// ============================================================================

// ----------------------------------------------------------------------------
// 通用类型
// ----------------------------------------------------------------------------

/** 执行状态类型 */
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

/** 触发类型 */
export type TriggerType = 'scheduled' | 'manual'

/** 检查项类型 */
export type CheckItemType = 'snmp' | 'ssh' | 'http' | 'ping' | 'script'

/** 检查结果状态 */
export type CheckStatus = 'pass' | 'warning' | 'fail' | 'skip'

/** 设备巡检状态 */
export type DeviceStatus = 'success' | 'warning' | 'error' | 'offline'

/** 模板分类 */
export type TemplateCategory = 'network' | 'system' | 'security' | 'custom'

/** 报告类型 */
export type ReportType = 'summary' | 'detailed' | 'trend'

/** 报告格式 */
export type ReportFormat = 'pdf' | 'excel' | 'html' | 'word'

// ----------------------------------------------------------------------------
// 巡检策略
// ----------------------------------------------------------------------------

/**
 * 巡检策略接口
 *
 * 定义了系统中巡检任务的执行策略,包括定时巡检和手动巡检两种类型
 */
export interface InspectionStrategy {
  /** 策略唯一标识 */
  id: string

  /** 策略名称 */
  name: string

  /** 策略描述信息 */
  description: string

  /** 策略类型: scheduled-定时巡检, manual-手动巡检 */
  type: TriggerType

  /** Cron表达式,仅定时巡检时使用 */
  cron?: string

  /** 关联的设备ID列表 */
  devices: number[]

  /** 使用的巡检模板ID列表 */
  templates: number[]

  /** 策略是否启用 */
  enabled: boolean

  /** 创建时间 ISO 8601格式 */
  createdAt: string

  /** 更新时间 ISO 8601格式 */
  updatedAt: string

  /** 下次执行时间,仅定时巡检时有值 */
  nextRunTime?: string
}

// ----------------------------------------------------------------------------
// 巡检模板
// ----------------------------------------------------------------------------

/**
 * 检查项配置接口
 *
 * 根据检查类型不同,可能包含不同的配置字段
 */
export interface CheckItemConfig {
  /** SNMP OID,仅type=snmp时使用 */
  oid?: string

  /** SSH命令,仅type=ssh时使用 */
  command?: string

  /** HTTP请求URL,仅type=http时使用 */
  url?: string

  /** 自定义脚本内容,仅type=script时使用 */
  script?: string

  /** 超时时间(毫秒) */
  timeout?: number

  /** 期望值,用于结果比对 */
  expectedValue?: string

  /** 阈值配置 */
  threshold?: {
    /** 警告阈值 */
    warning?: number
    /** 严重阈值 */
    critical?: number
  }
}

/**
 * 巡检项接口
 *
 * 定义了单个巡检检查项的配置和执行方式
 */
export interface InspectionCheckItem {
  /** 检查项唯一标识 */
  id: string

  /** 检查项名称 */
  name: string

  /** 检查项类型 */
  type: CheckItemType

  /** 检查项配置,根据type不同配置项不同 */
  config: CheckItemConfig

  /** 权重分数,用于计算总分 */
  weight: number
}

/**
 * 巡检模板接口
 *
 * 定义了可复用的巡检项集合,可应用到多个设备或策略
 */
export interface InspectionTemplate {
  /** 模板唯一标识 */
  id: string

  /** 模板名称 */
  name: string

  /** 模板描述 */
  description: string

  /** 模板分类 */
  category: TemplateCategory

  /** 支持的设备类型列表 */
  deviceTypes: string[]

  /** 包含的检查项列表 */
  checkItems: InspectionCheckItem[]

  /** 是否为系统内置模板 */
  isBuiltIn: boolean

  /** 是否启用 */
  isActive: boolean

  /** 创建时间 */
  createdAt: string

  /** 更新时间 */
  updatedAt: string
}

// ----------------------------------------------------------------------------
// 巡检执行与结果
// ----------------------------------------------------------------------------

/**
 * 检查结果接口
 *
 * 表示单个检查项的执行结果
 */
export interface CheckResult {
  /** 检查项ID */
  checkItemId: string

  /** 检查项名称 */
  checkItemName: string

  /** 检查状态 */
  status: CheckStatus

  /** 实际获取的值 */
  actualValue?: string

  /** 期望的值 */
  expectedValue?: string

  /** 结果说明信息 */
  message?: string

  /** 执行耗时(毫秒) */
  executionTime: number
}

/**
 * 设备巡检结果接口
 *
 * 表示单个设备的完整巡检结果
 */
export interface DeviceInspectionResult {
  /** 设备ID */
  deviceId: string

  /** 设备名称 */
  deviceName: string

  /** 设备类型 */
  deviceType: string

  /** 设备巡检整体状态 */
  status: DeviceStatus

  /** 设备巡检得分 0-100 */
  score: number

  /** 所有检查项的结果列表 */
  checkResults: CheckResult[]

  /** 设备巡检执行总耗时(毫秒) */
  executionTime: number
}

/**
 * 巡检汇总结果接口
 *
 * 整个巡检执行的汇总统计信息
 */
export interface InspectionSummary {
  /** 检查项总数 */
  totalChecks: number

  /** 通过的检查项数 */
  passedChecks: number

  /** 失败的检查项数 */
  failedChecks: number

  /** 警告的检查项数 */
  warningChecks: number

  /** 总体评分 0-100 */
  score: number

  /** 所有设备的巡检结果 */
  deviceResults: DeviceInspectionResult[]
}

/**
 * 巡检执行记录接口
 *
 * 表示一次完整的巡检任务执行记录
 */
export interface InspectionExecution {
  /** 执行记录唯一标识 */
  id: string

  /** 关联的策略ID */
  strategyId: string

  /** 策略名称(冗余存储,便于查询) */
  strategyName: string

  /** 触发方式 */
  triggerType: TriggerType

  /** 触发用户,手动触发时有值 */
  triggerUser?: string

  /** 执行状态 */
  status: ExecutionStatus

  /** 执行进度 0-100 */
  progress: number

  /** 需巡检的设备总数 */
  totalDevices: number

  /** 已完成巡检的设备数 */
  completedDevices: number

  /** 开始时间 */
  startTime: string

  /** 结束时间,执行中时为空 */
  endTime?: string

  /** 执行总时长(秒) */
  duration?: number

  /** 巡检汇总结果 */
  summary: InspectionSummary
}

// ----------------------------------------------------------------------------
// 巡检报告
// ----------------------------------------------------------------------------

/**
 * 巡检报告接口
 *
 * 基于执行记录生成的各类报告
 */
export interface InspectionReport {
  /** 报告唯一标识 */
  id: string

  /** 关联的执行记录ID */
  executionId: string

  /** 报告标题 */
  title: string

  /** 报告类型 */
  type: ReportType

  /** 报告格式 */
  format: ReportFormat

  /** 报告内容(可能是HTML或JSON) */
  content: string

  /** 生成时间 */
  generatedAt: string

  /** 生成人 */
  generatedBy: string

  /** 文件存储路径 */
  filePath?: string
}

// ----------------------------------------------------------------------------
// API相关类型
// ----------------------------------------------------------------------------

/**
 * API响应通用接口
 *
 * @template T 响应数据类型
 */
export interface InspectionApiResponse<T = unknown> {
  /** 响应状态码 */
  code: number

  /** 响应消息 */
  message: string

  /** 响应数据 */
  data: T
}

/**
 * 巡检统计数据接口
 *
 * 用于仪表盘展示的统计信息
 */
export interface InspectionStats {
  /** 策略总数 */
  totalStrategies: number

  /** 启用的策略数 */
  activeStrategies: number

  /** 今日执行次数 */
  todayExecutions: number

  /** 成功率(百分比) */
  successRate: number

  /** 平均得分 */
  avgScore: number

  /** 各指标的变化趋势 */
  changes: {
    /** 执行次数变化百分比(如"+12.5%") */
    executionsChange: string
    /** 成功率变化百分比 */
    successRateChange: string
    /** 平均分变化百分比 */
    avgScoreChange: string
    /** 策略数变化百分比 */
    strategiesChange: string
  }

  /** 最近的执行记录 */
  recentExecutions: InspectionExecution[]
}

// ----------------------------------------------------------------------------
// 巡检任务(内部使用)
// ----------------------------------------------------------------------------

/**
 * 巡检任务接口
 *
 * 表示对单个设备执行单个模板的巡检任务
 * 主要用于任务调度和执行跟踪
 */
export interface InspectionTask {
  /** 任务唯一标识 */
  id: string

  /** 关联的策略ID */
  strategyId: string

  /** 目标设备ID */
  deviceId: string

  /** 使用的模板ID */
  templateId: string

  /** 任务状态 */
  status: 'pending' | 'running' | 'completed' | 'failed'

  /** 任务进度 0-100 */
  progress: number

  /** 任务开始时间 */
  startTime?: string

  /** 任务结束时间 */
  endTime?: string

  /** 需执行的检查项列表 */
  checkItems: InspectionCheckItem[]

  /** 检查项执行结果 */
  results?: CheckResult[]
}

/**
 * 巡检结果接口
 *
 * 单次巡检任务的完整结果
 */
export interface InspectionResult {
  /** 结果唯一标识 */
  id: string

  /** 关联的任务ID */
  taskId: string

  /** 关联的执行记录ID */
  executionId: string

  /** 设备ID */
  deviceId: string

  /** 设备名称 */
  deviceName: string

  /** 结果状态 */
  status: DeviceStatus

  /** 得分 0-100 */
  score: number

  /** 检查项总数 */
  totalChecks: number

  /** 通过数 */
  passedChecks: number

  /** 失败数 */
  failedChecks: number

  /** 警告数 */
  warningChecks: number

  /** 详细检查结果 */
  results: CheckResult[]

  /** 结果摘要描述 */
  summary: string

  /** 创建时间 */
  createdAt: string
}