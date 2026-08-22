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

/**
 * 检查结果状态
 *
 * not_applicable 表示该检查项不适用于当前设备类型（交换机上的 BGP、路由器上的
 * PoE）。它与 skip 的区别决定了运维要不要动手：skip 是「该查却没查成」，需要
 * 核对凭据或 MIB 支持度；not_applicable 是「设备天然没这个特性」，无需处理，
 * 也不计入通过率分母。
 */
export type CheckStatus = 'pass' | 'warning' | 'fail' | 'skip' | 'not_applicable'

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

  /** 使用的巡检模板ID列表，当前约束为只能包含一个模板 */
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

  /** SNMP 已用 OID（某些内置模板使用） */
  oid_used?: string

  /** SNMP 可用 OID（某些内置模板使用） */
  oid_free?: string

  /** 展示单位（例如：%/ms/MB 等） */
  unit?: string

  /** 解析模式（例如：正则表达式） */
  parsePattern?: string
 
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

  /** 允许后端/模板扩展字段透传，避免前端 transform 丢字段 */
  [key: string]: unknown
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

  /**
   * SNMP 指标键，type=snmp 时用于后端分派。改名不影响分派。
   *
   * 基础：reachable / system_info / cpu / memory / temperature / uptime /
   *       interface / interface_utilization / bandwidth
   * 接口健康：interface_errors / interface_discards / interface_admin_status /
   *           interface_duplex（标准 IF-MIB 与 EtherLike-MIB，全厂商通用）
   * 部件与专项：fan_status / power_status / poe / optical_power / bgp_peers /
   *             firmware_version（依赖厂商 catalog，采不到时判 skip）
   */
  metric?: string

  /**
   * 适用设备类型。未声明表示适用全部设备（存量模板均无此字段）。
   *
   * 执行端据此过滤：不适用的检查项不做采集，直接落一条 not_applicable 结果，
   * 既不算通过也不算失败，且不计入通过率分母——否则一台健康交换机跑全面巡检
   * 会因 BGP 不适用而通过率骤降。
   */
  deviceTypes?: string[]

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

  /** 检查项结构化明细，按 kind 分派渲染；目前仅接口利用率检查项会返回 */
  details?: CheckResultDetails
}

/** 单个接口的利用率明细 */
export interface InterfaceUtilizationEntry {
  name: string
  /** 取值更高的方向："入" 或 "出" */
  direction: string
  percent: number
  speed_mbps: number
  in_rate_bps?: number
  out_rate_bps?: number
  is_up?: boolean
}

/** 无法计算利用率的接口及原因 */
export interface InterfaceUtilizationSkipped {
  name: string
  reason: string
}

/** 接口利用率检查项的完整明细（后端 inspection_results.details） */
export interface InterfaceUtilizationDetails {
  kind: 'interface_utilization'
  total: number
  evaluated: number
  over_warning: number
  over_critical: number
  warning_threshold: number
  critical_threshold: number
  /** 已评估接口，按利用率降序 */
  interfaces: InterfaceUtilizationEntry[]
  skipped: InterfaceUtilizationSkipped[]
}

/**
 * 逐行判定结果。
 *
 * 刻意复用检查结果的状态词表而非另造「正常 / 异常 / 未知」：
 * 状态标签映射已经存在，复用等于零新增映射；每多一套词表，
 * 就要在 PDF 与前端两处各维护一份，一处漏改就会出现
 * 「行判定与整项状态自相矛盾」。
 */
export type CheckDetailVerdict = 'pass' | 'warning' | 'fail' | 'skip'

/** 单接口的计数器比率明细（错包 / 丢弃共用） */
export interface InterfaceRatioEntry {
  name: string
  /** 比率更高的方向："入" 或 "出" */
  direction: string
  percent: number
  /** 错包数或丢弃数原始值 */
  count: number
  /** 同方向的包数原始值 */
  packets: number
}

/**
 * 接口错包率 / 丢弃率明细。
 *
 * count 与 packets 必须与 percent 一起给出：累计比率会被历史上一次性故障
 * 长期拉高，只看「1.2%」无法区分持续劣化与三年前抖过一次。
 */
export interface InterfaceRatioDetails {
  kind: 'interface_errors' | 'interface_discards'
  total: number
  evaluated: number
  over_warning: number
  over_critical: number
  warning_threshold: number
  critical_threshold: number
  /** 已评估接口，按比率降序 */
  interfaces: InterfaceRatioEntry[]
  skipped: InterfaceUtilizationSkipped[]
}

/**
 * 单光模块明细。
 *
 * 诊断量可缺失：厂商对 DDM 的支持参差不齐，多数只给收光。缺失保持 undefined
 * 而非 0——「未上报电压」和「电压 0V」是两个完全不同的结论。
 */
export interface OpticalModuleEntry {
  index: string
  verdict: CheckDetailVerdict
  rx_power: number
  rx_power_unit: string
  tx_power?: number
  tx_power_unit?: string
  voltage?: number
  voltage_unit?: string
  bias_current?: number
  bias_current_unit?: string
}

/** 光模块光功率明细，按收光升序（最差在前） */
export interface OpticalPowerDetails {
  kind: 'optical_power'
  total: number
  evaluated: number
  over_warning: number
  over_critical: number
  warning_threshold: number
  critical_threshold: number
  modules: OpticalModuleEntry[]
  skipped: InterfaceUtilizationSkipped[]
}

/** 单 BGP 邻居明细 */
export interface BGPPeerEntry {
  index: string
  verdict: CheckDetailVerdict
  /** 厂商上报的原始状态码，6 = Established */
  state?: number
  state_label?: string
  established_seconds?: number
  /** 排障起点：hold timer expired 指向链路，authentication failure 指向配置 */
  last_error?: string
}

/** BGP 邻居明细，按 fail / warning / skip / pass 排序 */
export interface BGPPeersDetails {
  kind: 'bgp_peers'
  total: number
  established: number
  down: number
  flapping: number
  /** 震荡判定线：建立时长低于此值视为近期重建 */
  flapping_threshold_seconds: number
  peers: BGPPeerEntry[]
}

/** 单部件（风扇 / 电源）明细，state 是厂商原始状态码 */
export interface ComponentStatusEntry {
  index: string
  kind: string
  verdict: CheckDetailVerdict
  state?: number
}

/**
 * 风扇 / 电源状态明细。
 *
 * normal_states / abnormal_states 回显本次生效的判定依据：状态码语义因厂商
 * 甚至型号而异，只给「码 77，未知」运维无从下手，连同判定集合一起给出，
 * 才能据此校准模板配置。
 */
export interface ComponentStatusDetails {
  kind: 'component_status'
  /** 部件类别：fan / power / board */
  component_kind: string
  label: string
  total: number
  normal: number
  abnormal: number
  unknown: number
  normal_states: number[]
  abnormal_states: number[]
  components: ComponentStatusEntry[]
}

/**
 * 检查项结构化明细。
 *
 * 后端用顶层 kind 区分载荷类型，五种互斥。这里做成可辨识联合，
 * 消费方写 `details.kind === 'optical_power'` 即可自动收窄类型。
 */
export type CheckResultDetails =
  | InterfaceUtilizationDetails
  | InterfaceRatioDetails
  | OpticalPowerDetails
  | BGPPeersDetails
  | ComponentStatusDetails

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

  /** 设备IP地址 */
  deviceIp?: string

  /** 设备巡检状态 */
  status: DeviceStatus

  /** 设备巡检得分 0-100 */
  score: number

  /** 所有检查项的结果列表 */
  checkResults: CheckResult[]

  /** 通过检查数 */
  passedChecks?: number

  /** 检查总数 */
  totalChecks?: number

  /** 设备巡检执行总耗时(秒) */
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

  /** 执行次数（统计口径） */
  executionCount: number

  /** 兼容旧字段：今日执行次数 */
  todayExecutions?: number

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

/**
 * 巡检统计分析统一时间范围参数
 *
 * 统计卡片、趋势图、设备分布和问题分布应共用同一组参数
 */
export interface InspectionAnalyticsRange {
  period: 'day' | 'week' | 'month'
  startDate?: string
  endDate?: string
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


