import { api, authorizedDownload } from '@/lib/api-client'
import { getApiOrigin } from '@/lib/api-client'
import {
  InspectionTemplate,
  InspectionExecution,
  InspectionStats,
  InspectionTask,
  InspectionResult,
  InspectionApiResponse,
  InspectionSummary,
  DeviceInspectionResult,
  InspectionCheckItem,
  CheckResult,
  InspectionStrategy,
  InspectionAnalyticsRange
} from '../types'

type UnknownRecord = Record<string, unknown>

const TEMPLATE_CATEGORIES = ['network', 'system', 'security', 'custom'] as const
const TASK_STATUSES = ['pending', 'running', 'completed', 'failed'] as const
const EXECUTION_STATUSES = ['pending', 'running', 'completed', 'failed', 'cancelled'] as const
const DEVICE_STATUSES = ['success', 'warning', 'error', 'offline'] as const
const TRIGGER_TYPES = ['scheduled', 'manual'] as const

const CHECK_ITEM_TYPES = ['snmp', 'ssh', 'http', 'ping', 'script'] as const
const CHECK_RESULT_STATUSES = ['pass', 'warning', 'fail', 'skip'] as const

const isObject = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toRecord = (value: unknown): UnknownRecord => (isObject(value) ? value : {})

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return fallback
}

const toString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return fallback
}

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

const toRecordArray = (value: unknown): UnknownRecord[] =>
  Array.isArray(value) ? value.filter(isObject).map(item => item as UnknownRecord) : []

const toEnumValue = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback

const toOptionalNumber = (value: unknown): number | undefined => {
  const num = toNumber(value, Number.NaN)
  return Number.isFinite(num) ? num : undefined
}

const mapCheckItem = (value: UnknownRecord): InspectionCheckItem => {
  const rawType = toString(value.type ?? value['type']).trim().toLowerCase()
  // 兼容后端/历史数据的 icmp 类型：前端统一映射为 ping
  const type = rawType === 'icmp' ? 'ping' : toEnumValue(rawType, CHECK_ITEM_TYPES, 'script')
  const configRecord = toRecord(value.config ?? value['config'])
  const thresholdRecord = toRecord(configRecord.threshold ?? configRecord['threshold'])

  // 以原始 config 为底座，避免 transform 丢弃后端/模板扩展字段（例如 unit、parsePattern、oid_used/oid_free 等）
  const config: InspectionCheckItem['config'] = { ...configRecord }

  const oid = toString(configRecord.oid ?? configRecord['oid'])
  if (oid) {
    config.oid = oid
  }

  const command = toString(configRecord.command ?? configRecord['command'])
  if (command) {
    config.command = command
  }

  const url = toString(configRecord.url ?? configRecord['url'])
  if (url) {
    config.url = url
  }

  const scriptValue = toString(configRecord.script ?? configRecord['script'])
  if (scriptValue) {
    config.script = scriptValue
  }

  const timeoutValue = toOptionalNumber(configRecord.timeout ?? configRecord['timeout'])
  if (timeoutValue !== undefined) {
    config.timeout = timeoutValue
  }

  const expectedValue = toString(configRecord.expectedValue ?? configRecord['expected_value'])
  if (expectedValue) {
    config.expectedValue = expectedValue
  }

  const threshold: { warning?: number; critical?: number } = {}
  const warningValue = toOptionalNumber(thresholdRecord.warning ?? thresholdRecord['warning'])
  if (warningValue !== undefined) {
    threshold.warning = warningValue
  }
  const criticalValue = toOptionalNumber(thresholdRecord.critical ?? thresholdRecord['critical'])
  if (criticalValue !== undefined) {
    threshold.critical = criticalValue
  }
  if (Object.keys(threshold).length > 0) {
    config.threshold = threshold
  }

  return {
    id: toString(value.id ?? value['id']),
    name: toString(value.name ?? value['name']),
    type,
    config,
    weight: toNumber(value.weight ?? value['weight'], 1),
  }
}

const mapCheckResult = (value: UnknownRecord): CheckResult => {
  const status = toEnumValue(value.status ?? value['status'], CHECK_RESULT_STATUSES, 'pass')

  const actualValue = toString(value.actualValue ?? value['actual_value'])
  const expectedValue = toString(value.expectedValue ?? value['expected_value'])
  const message = toString(value.message ?? value['message'])

  return {
    checkItemId: toString(value.checkItemId ?? value['check_item_id']),
    checkItemName: toString(value.checkItemName ?? value['check_item_name']),
    status,
    actualValue: actualValue || undefined,
    expectedValue: expectedValue || undefined,
    message: message || undefined,
    executionTime: toNumber(value.executionTime ?? value['execution_time']),
  }
}

const toCheckItemArray = (value: unknown): InspectionCheckItem[] => {
  if (!Array.isArray(value)) return []
  return value.filter(isObject).map(item => mapCheckItem(item as UnknownRecord))
}

const toCheckResultArray = (value: unknown): CheckResult[] => {
  if (!Array.isArray(value)) return []
  return value.filter(isObject).map(item => mapCheckResult(item as UnknownRecord))
}

interface TrendPoint {
  date: string
  executions: number
  success: number
  failed: number
  avgScore: number
  [key: string]: string | number
}

const mapTrendPoint = (value: unknown): TrendPoint => {
  const record = toRecord(value)
  return {
    date: toString(record.date),
    executions: toNumber(record.executions),
    success: toNumber(record.success),
    failed: toNumber(record.failed),
    avgScore: toNumber(record.avgScore),
  }
}

function transformTemplateData(apiData: unknown): InspectionTemplate {
  const data = toRecord(apiData)
  const category = toEnumValue(data.category, TEMPLATE_CATEGORIES, 'custom')
  const rawDeviceTypes = data.deviceTypes ?? data['device_types']
  let deviceTypes: string[] = []
  if (Array.isArray(rawDeviceTypes)) {
    deviceTypes = rawDeviceTypes.filter((item): item is string => typeof item === 'string')
  } else if (isObject(rawDeviceTypes)) {
    const nested = toRecord(rawDeviceTypes)
    deviceTypes = toStringArray(nested.device_types ?? nested['device_types'])
  } else {
    deviceTypes = toStringArray(rawDeviceTypes)
  }
  const checkItems = toCheckItemArray(data.checkItems ?? data['check_items'])
  // 修正: isBuiltIn 对应后端的 is_default
  const isBuiltIn = typeof data.isBuiltIn === 'boolean'
    ? data.isBuiltIn
    : Boolean(data['is_default'])
  // 新增: isActive 对应后端的 is_active
  const isActive = typeof data.isActive === 'boolean'
    ? data.isActive
    : Boolean(data['is_active'] ?? true)

  return {
    id: toString(data.id),
    name: toString(data.name),
    description: toString(data.description),
    category,
    deviceTypes,
    checkItems,
    isBuiltIn,
    isActive,
    createdAt: toString(data.createdAt ?? data['created_at']),
    updatedAt: toString(data.updatedAt ?? data['updated_at'] ?? data['created_at']),
  }
}

function transformTaskData(apiData: unknown): InspectionTask {
  const data = toRecord(apiData)
  const status = toEnumValue(data.status, TASK_STATUSES, 'pending')
  const startTime = toString(data.startTime ?? data['started_at'])
  const endTimeRaw = toString(data.endTime ?? data['completed_at'])

  return {
    id: toString(data.id),
    strategyId: toString(data.strategyId ?? data['strategy_id']),
    deviceId: toString(data.deviceId ?? data['device_id']),
    templateId: toString(data.templateId ?? data['template_id']),
    status,
    progress: toNumber(data.progress),
    startTime: startTime || undefined,
    endTime: endTimeRaw || undefined,
    checkItems: toCheckItemArray(data.checkItems ?? data['check_items']),
    results: toCheckResultArray(data.results ?? data['results']),
  }
}

function transformResultData(apiData: unknown): InspectionResult {
  const data = toRecord(apiData)
  const status = toEnumValue(data.status, DEVICE_STATUSES, 'offline')

  return {
    id: toString(data.id),
    taskId: toString(data.taskId ?? data['task_id']),
    executionId: toString(data.executionId ?? data['execution_id']),
    deviceId: toString(data.deviceId ?? data['device_id']),
    deviceName: toString(data.deviceName ?? data['device_name'], '未知设备'),
    status,
    score: toNumber(data.score),
    totalChecks: toNumber(data.totalChecks ?? data['total_checks']),
    passedChecks: toNumber(data.passedChecks ?? data['passed_checks']),
    failedChecks: toNumber(data.failedChecks ?? data['failed_checks']),
    warningChecks: toNumber(data.warningChecks ?? data['warning_checks']),
    results: toCheckResultArray(data.results ?? data['check_results']),
    summary: toString(data.summary),
    createdAt: toString(data.createdAt ?? data['created_at'] ?? data['completed_at']),
  }
}

function transformExecutionData(apiData: unknown): InspectionExecution {
  const data = toRecord(apiData)
  const status = toEnumValue(data.status, EXECUTION_STATUSES, 'pending')
  const triggerType = toEnumValue(data.triggerType ?? data['trigger_type'], TRIGGER_TYPES, 'manual')
  const endTimeValue = toString(data.endTime ?? data['end_time'])

  return {
    id: toString(data.id),
    strategyId: toString(data.strategyId ?? data['strategy_id']),
    strategyName: toString(data.strategyName ?? data['strategy_name']),
    triggerType,
    triggerUser: toString(data.triggerUser ?? data['trigger_user']) || undefined,
    status,
    progress: toNumber(data.progress),
    totalDevices: toNumber(data.totalDevices ?? data['total_devices']),
    completedDevices: toNumber(data.completedDevices ?? data['completed_devices']),
    startTime: toString(data.startTime ?? data['start_time']),
    endTime: endTimeValue || undefined,
    duration: typeof data.duration === 'number' ? data.duration : undefined,
    summary: transformSummaryData(data.summary ?? data['summary']),
  }
}

function transformSummaryData(apiData: unknown): InspectionSummary {
  const data = toRecord(apiData)
  return {
    totalChecks: toNumber(data.totalChecks ?? data['total_checks']),
    passedChecks: toNumber(data.passedChecks ?? data['passed_checks']),
    failedChecks: toNumber(data.failedChecks ?? data['failed_checks']),
    warningChecks: toNumber(data.warningChecks ?? data['warning_checks']),
    score: toNumber(data.score),
    deviceResults: toRecordArray(data.deviceResults ?? data['device_results']).map(transformDeviceResultData),
  }
}

function transformDeviceResultData(apiData: unknown): DeviceInspectionResult {
  const data = toRecord(apiData)
  const status = toEnumValue(data.status, DEVICE_STATUSES, 'offline')

  // 获取设备IP地址
  const deviceIp = toString(data.deviceIp ?? data['device_ip'] ?? data['deviceIp'])

  return {
    deviceId: toString(data.deviceId ?? data['device_id']),
    deviceName: toString(data.deviceName ?? data['device_name']),
    deviceType: toString(data.deviceType ?? data['device_type']),
    deviceIp: deviceIp || undefined,
    status,
    score: toNumber(data.score),
    checkResults: toCheckResultArray(data.checkResults ?? data['check_results']),
    passedChecks: toNumber(data.passedChecks ?? data['passed_checks']),
    totalChecks: toNumber(data.totalChecks ?? data['total_checks']),
    executionTime: toNumber(data.executionTime ?? data['execution_time']),
  }
}

function transformStatsData(apiData: unknown): InspectionStats {
  const data = toRecord(apiData)
  const changesRecord = toRecord(data.changes ?? data['changes'])
  const executionCount = toNumber(
    data.executionCount ?? data['executionCount'] ?? data.todayExecutions ?? data['todayExecutions']
  )

  return {
    totalStrategies: toNumber(data.totalStrategies ?? data['totalStrategies']),
    activeStrategies: toNumber(data.activeStrategies ?? data['activeStrategies']),
    executionCount,
    todayExecutions: executionCount,
    successRate: toNumber(data.successRate ?? data['successRate']),
    avgScore: toNumber(data.avgScore ?? data['avgScore']),
    changes: {
      executionsChange: toString(changesRecord.executionsChange, '0.0%'),
      successRateChange: toString(changesRecord.successRateChange, '0.0%'),
      avgScoreChange: toString(changesRecord.avgScoreChange, '0.0%'),
      strategiesChange: toString(changesRecord.strategiesChange, '0.0%'),
    },
    recentExecutions: toRecordArray(data.recentExecutions ?? data['recentExecutions']).map(transformExecutionData),
  }
}

// ==================== 巡检模板管理 ====================

export async function fetchInspectionTemplates(params?: {
  page?: number
  pageSize?: number
  category?: string
  deviceTypes?: string[]
  search?: string
  vendor?: string
  sort?: string
  order?: 'asc' | 'desc'
}): Promise<{ templates: InspectionTemplate[]; total: number; pages: number }> {
  try {
    let endpoint = '/inspection/templates'
    const searchParams = new URLSearchParams()

    if (params) {
      if (params.page) {
        searchParams.append('page', params.page.toString())
      }
      if (params.pageSize) {
        searchParams.append('page_size', params.pageSize.toString())
      }
      if (params.category) {
        searchParams.append('category', params.category)
      }
      // 后端只支持单个 device_type 过滤
      if (params.deviceTypes && params.deviceTypes.length > 0) {
        searchParams.append('device_type', params.deviceTypes[0])
      }
      if (params.search) {
        searchParams.append('search', params.search)
      }
      if (params.vendor) {
        searchParams.append('vendor', params.vendor)
      }
      if (params.sort) {
        searchParams.append('sort', params.sort)
      }
      if (params.order) {
        searchParams.append('order', params.order)
      }
    }

    if (searchParams.toString()) {
      endpoint += `?${searchParams.toString()}`
    }

    const response = await api.get<InspectionApiResponse<unknown>>(endpoint)

    if (!response.data) {
      throw new Error(response.message || '获取巡检模板失败')
    }

    const data = toRecord(response.data)
    // 后端返回 items 和 templates 两个字段（兼容）
    const templates = toRecordArray(data.items ?? data.templates ?? data['items'] ?? data['templates']).map(transformTemplateData)

    return {
      templates,
      total: toNumber(data.total),
      pages: toNumber(data.pages ?? Math.ceil(toNumber(data.total) / (params?.pageSize || 20))),
    }
  } catch (error) {
    console.error('获取巡检模板失败:', error)
    throw error
  }
}

export async function fetchInspectionTemplate(id: number): Promise<InspectionTemplate> {
  try {
    const response = await api.get<InspectionApiResponse<unknown>>(`/inspection/templates/${id}`)

    if (!response.data) {
      throw new Error('获取模板详情失败')
    }

    return transformTemplateData(response.data)
  } catch (error) {
    console.error('获取模板详情失败:', error)
    throw error
  }
}

export async function copyInspectionTemplate(id: number, name?: string): Promise<InspectionTemplate> {
  const payload: Record<string, unknown> = {}
  if (typeof name === 'string' && name.trim()) {
    payload.name = name.trim()
  }

  const response = await api.post<InspectionApiResponse<unknown>>(`/inspection/templates/${id}/copy`, payload)
  if (!response.data) {
    throw new Error('复制模板失败')
  }
  return transformTemplateData(response.data)
}

export async function createInspectionTemplate(template: Omit<InspectionTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<InspectionTemplate> {
  try {
    // 转换为后端期望的 snake_case 格式
    const payload = {
      name: template.name,
      description: template.description,
      category: template.category,
      device_types: template.deviceTypes,
      check_items: template.checkItems?.map(item => ({
        id: item.id,
        name: item.name,
        type: item.type,
        weight: item.weight,
        config: item.config,
        enabled: true
      })),
      is_default: template.isBuiltIn || false,
      is_active: template.isActive ?? true
    }

    const response = await api.post<InspectionApiResponse<unknown>>('/inspection/templates', payload)

    if (!response.data) {
      throw new Error('创建模板失败')
    }

    return transformTemplateData(response.data)
  } catch (error) {
    console.error('创建模板失败:', error)
    throw error
  }
}

export async function updateInspectionTemplate(id: number, updates: Partial<InspectionTemplate>): Promise<InspectionTemplate> {
  try {
    // 转换为后端期望的 snake_case 格式
    const payload: Record<string, unknown> = {}
    
    if (updates.name !== undefined) payload.name = updates.name
    if (updates.description !== undefined) payload.description = updates.description
    if (updates.category !== undefined) payload.category = updates.category
    if (updates.deviceTypes !== undefined) payload.device_types = updates.deviceTypes
    if (updates.checkItems !== undefined) {
      payload.check_items = updates.checkItems.map(item => ({
        id: item.id,
        name: item.name,
        type: item.type,
        weight: item.weight,
        config: item.config,
        enabled: true
      }))
    }
    if (updates.isBuiltIn !== undefined) payload.is_default = updates.isBuiltIn
    if (updates.isActive !== undefined) payload.is_active = updates.isActive

    const response = await api.put<InspectionApiResponse<unknown>>(`/inspection/templates/${id}`, payload)

    if (!response.data) {
      throw new Error('更新模板失败')
    }

    return transformTemplateData(response.data)
  } catch (error) {
    console.error('更新模板失败:', error)
    throw error
  }
}

export async function deleteInspectionTemplate(id: number): Promise<boolean> {
  try {
    const response = await api.delete<InspectionApiResponse<unknown>>(`/inspection/templates/${id}`)
    return response.data !== undefined && response.data !== null
  } catch (error) {
    console.error('删除模板失败:', error)
    throw error
  }
}

// ==================== 巡检任务管理 ====================

export async function fetchInspectionTasks(params?: {
  page?: number
  pageSize?: number
  status?: string[]
  deviceIds?: number[]
  templateId?: number
  startDate?: string
  endDate?: string
}): Promise<{ tasks: InspectionTask[]; total: number; pages: number }> {
  try {
    // 修复：复用 /inspection/ 端点，因为后端暂未实现独立的 /tasks 端点
    // TODO: 未来可能需要独立的 tasks 端点来区分任务和执行记录的业务逻辑
    let endpoint = '/inspection/'
    const searchParams = new URLSearchParams()

    if (params) {
      // 后端使用 skip/limit 而不是 page/page_size
      if (params.page && params.pageSize) {
        searchParams.append('skip', String((params.page - 1) * params.pageSize))
      }
      if (params.pageSize) searchParams.append('limit', params.pageSize.toString())

      // 后端只支持单个 status，取第一个
      if (params.status && params.status.length > 0) {
        searchParams.append('status', params.status[0])
      }

      // 后端使用 device_id（单个）而不是 device_ids（数组）
      if (params.deviceIds && params.deviceIds.length > 0) {
        searchParams.append('device_id', params.deviceIds[0].toString())
      }

      // 注意：后端不支持 templateId, startDate, endDate 参数
      // 这些参数会被忽略，未来需要后端支持
    }

    if (searchParams.toString()) {
      endpoint += `?${searchParams.toString()}`
    }

    const response = await api.get<InspectionApiResponse<unknown>>(endpoint)

    if (!response.data) {
      throw new Error(response.message || '获取巡检任务失败')
    }

    const data = toRecord(response.data)

    return {
      tasks: toRecordArray(data.tasks ?? data['tasks'] ?? data).map(transformTaskData),
      total: toNumber(data.total),
      pages: toNumber(data.pages),
    }
  } catch (error) {
    console.error('获取巡检任务失败:', error)
    return {
      tasks: [],
      total: 0,
      pages: 0,
    }
  }
}

export async function fetchInspectionTask(id: number): Promise<InspectionTask | null> {
  try {
    // 修复：使用 /inspection/inspections/{id} 端点以避免与静态路由冲突
    const response = await api.get<InspectionApiResponse<unknown>>(`/inspection/inspections/${id}`)

    if (!response.data) {
      throw new Error('获取任务详情失败')
    }

    return transformTaskData(response.data)
  } catch (error) {
    console.error('获取任务详情失败:', error)
    return null
  }
}

export async function createInspectionTask(task: {
  name: string
  description?: string
  template_id: number
  device_ids: number[]
  scheduled_at?: string
  priority?: 'low' | 'medium' | 'high'
}): Promise<InspectionTask> {
  try {
    const response = await api.post<InspectionApiResponse<unknown>>('/inspection/tasks', task)

    if (!response.data) {
      throw new Error('创建任务失败')
    }

    return transformTaskData(response.data)
  } catch (error) {
    console.error('创建任务失败:', error)
    throw error
  }
}

export async function startInspectionTask(id: number): Promise<boolean> {
  try {
    const response = await api.post<InspectionApiResponse<unknown>>(`/inspection/tasks/${id}/start`)
    return response.data !== undefined && response.data !== null
  } catch (error) {
    console.error('启动任务失败:', error)
    throw error
  }
}

export async function cancelInspectionTask(id: number, reason?: string): Promise<boolean> {
  try {
    const response = await api.post<InspectionApiResponse<unknown>>(`/inspection/tasks/${id}/cancel`, {
      reason: reason || '手动取消',
    })

    return response.data !== undefined && response.data !== null
  } catch (error) {
    console.error('取消任务失败:', error)
    throw error
  }
}

export async function fetchTaskProgress(id: number): Promise<Record<string, unknown>> {
  try {
    const response = await api.get<InspectionApiResponse<unknown>>(`/inspection/tasks/${id}/progress`)

    if (!response.data) {
      throw new Error('获取任务进度失败')
    }

    return toRecord(response.data)
  } catch (error) {
    console.error('获取任务进度失败:', error)
    return { progress: 0, status: 'unknown', message: '无法获取进度' }
  }
}

// ==================== 巡检结果管理 ====================

export async function fetchInspectionExecutions(params?: {
  page?: number
  pageSize?: number
  status?: string[]
  strategyId?: string | number
  startDate?: string
  endDate?: string
}): Promise<{ items: InspectionExecution[]; total: number; pages: number }> {
  try {
    let endpoint = '/inspection/executions'
    const searchParams = new URLSearchParams()

    if (params) {
      // 参数验证: page 和 pageSize 必须是正整数
      if (params.page !== undefined) {
        const pageNum = Number(params.page)
        if (Number.isInteger(pageNum) && pageNum > 0) {
          searchParams.append('page', pageNum.toString())
        } else {
          console.warn(`[API] 无效的 page 参数: ${params.page}, 已忽略`)
        }
      }

      if (params.pageSize !== undefined) {
        const pageSizeNum = Number(params.pageSize)
        if (Number.isInteger(pageSizeNum) && pageSizeNum > 0 && pageSizeNum <= 100) {
          searchParams.append('page_size', pageSizeNum.toString())
        } else {
          console.warn(`[API] 无效的 pageSize 参数: ${params.pageSize}, 已忽略`)
        }
      }

      // 参数验证: status 必须是有效的状态值
      if (params.status && params.status.length) {
        const validStatuses = params.status.filter(s =>
          EXECUTION_STATUSES.includes(s as typeof EXECUTION_STATUSES[number])
        )
        if (validStatuses.length > 0) {
          searchParams.append('status', validStatuses.join(','))
        } else {
          console.warn(`[API] 无效的 status 参数: ${params.status.join(',')}, 已忽略`)
        }
      }

      // 参数验证: strategyId 必须是有效数字
      if (params.strategyId !== undefined && params.strategyId !== null && params.strategyId !== '') {
        const strategyIdStr = String(params.strategyId)
        const strategyIdNum = Number(strategyIdStr)
        if (!Number.isNaN(strategyIdNum) && Number.isFinite(strategyIdNum) && strategyIdNum > 0) {
          searchParams.append('strategy_id', strategyIdStr)
        } else {
          console.warn(`[API] 无效的 strategyId 参数: ${params.strategyId}, 已忽略`)
        }
      }

      // 参数验证: 日期格式 (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (params.startDate) {
        if (dateRegex.test(params.startDate)) {
          searchParams.append('start_date', params.startDate)
        } else {
          console.warn(`[API] 无效的 startDate 格式: ${params.startDate}, 已忽略`)
        }
      }

      if (params.endDate) {
        if (dateRegex.test(params.endDate)) {
          searchParams.append('end_date', params.endDate)
        } else {
          console.warn(`[API] 无效的 endDate 格式: ${params.endDate}, 已忽略`)
        }
      }

      // 参数验证: 日期范围逻辑检查
      if (params.startDate && params.endDate && dateRegex.test(params.startDate) && dateRegex.test(params.endDate)) {
        if (params.startDate > params.endDate) {
          console.warn(`[API] 开始日期晚于结束日期: ${params.startDate} > ${params.endDate}`)
        }
      }
    }

    if (searchParams.toString()) {
      endpoint += `?${searchParams.toString()}`
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[API] 请求执行记录: ${endpoint}`)
    }

    const response = await api.get<InspectionApiResponse<unknown>>(endpoint)
    if (!response.data) {
      const errorMsg = response.message || '获取巡检执行记录失败'
      console.error(`[API] ${errorMsg}`)
      throw new Error(errorMsg)
    }

    const data = toRecord(response.data)
    const executions = data.executions ?? data.items ?? data['executions'] ?? data['items']

    const result = {
      items: toRecordArray(executions).map(transformExecutionData),
      total: toNumber(data.total),
      pages: toNumber(data.pages),
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[API] 成功获取 ${result.items.length} 条执行记录 (共 ${result.total} 条)`)
    }
    return result
  } catch (error) {
    // 增强错误处理
    if (error instanceof Error) {
      console.error('[API] 获取巡检执行记录失败:', {
        message: error.message,
        params,
        stack: error.stack
      })
    } else {
      console.error('[API] 获取巡检执行记录失败:', error)
    }

    throw error
  }
}

/**
 * 获取单个执行记录详情
 * 包含完整的设备巡检结果和检查项数据
 */
export async function fetchExecutionDetail(executionId: string): Promise<InspectionExecution> {
  try {
    const response = await api.get<InspectionApiResponse<unknown>>(`/inspection/executions/${executionId}`)
    
    if (!response.data) {
      throw new Error('[API] 获取执行详情失败: 无数据返回')
    }

    const execution = transformExecutionData(response.data)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[API] 成功获取执行详情: ID=${executionId}, 设备结果数=${execution.summary.deviceResults.length}`)
    }
    return execution
  } catch (error) {
    console.error('[API] 获取执行详情失败:', error)
    throw error
  }
}

export async function fetchInspectionResults(params?: {
  page?: number
  pageSize?: number
  taskId?: number
  deviceId?: number
  status?: string[]
  startDate?: string
  endDate?: string
}): Promise<{ results: InspectionResult[]; total: number; pages: number }> {
  try {
    let endpoint = '/inspection/results'
    const searchParams = new URLSearchParams()

    if (params) {
      if (params.page) searchParams.append('page', params.page.toString())
      if (params.pageSize) searchParams.append('page_size', params.pageSize.toString())
      if (params.taskId) searchParams.append('task_id', params.taskId.toString())
      if (params.deviceId) searchParams.append('device_id', params.deviceId.toString())
      if (params.status) searchParams.append('status', params.status.join(','))
      if (params.startDate) searchParams.append('start_date', params.startDate)
      if (params.endDate) searchParams.append('end_date', params.endDate)
    }

    if (searchParams.toString()) {
      endpoint += `?${searchParams.toString()}`
    }

    const response = await api.get<InspectionApiResponse<unknown>>(endpoint)

    if (!response.data) {
      throw new Error(response.message || '获取巡检结果失败')
    }

    const data = toRecord(response.data)

    return {
      results: toRecordArray(data.results ?? data['results']).map(transformResultData),
      total: toNumber(data.total),
      pages: toNumber(data.pages),
    }
  } catch (error) {
    console.error('获取巡检结果失败:', error)
    return {
      results: [],
      total: 0,
      pages: 0,
    }
  }
}

export async function fetchInspectionResult(id: number): Promise<InspectionResult | null> {
  try {
    const response = await api.get<InspectionApiResponse<unknown>>(`/inspection/results/${id}`)

    if (!response.data) {
      throw new Error('获取结果详情失败')
    }

    return transformResultData(response.data)
  } catch (error) {
    console.error('获取结果详情失败:', error)
    return null
  }
}

export async function fetchDeviceInspectionHistory(deviceId: number, limit?: number): Promise<InspectionResult[]> {
  try {
    let endpoint = `/inspection/devices/${deviceId}/history`
    if (limit) {
      endpoint += `?limit=${limit}`
    }

    const response = await api.get<InspectionApiResponse<unknown>>(endpoint)

    if (!response.data) {
      throw new Error('获取设备巡检历史失败')
    }

    const history = Array.isArray(response.data) ? response.data : toRecordArray(response.data)
    return history.map(transformResultData)
  } catch (error) {
    console.error('获取设备巡检历史失败:', error)
    return []
  }
}

// ==================== 巡检策略管理 ====================

export async function fetchInspectionStrategies(params?: {
  page?: number
  pageSize?: number
  type?: string
  enabled?: boolean
}): Promise<{ strategies: InspectionStrategy[]; total: number; pages: number }> {
  try {
    let endpoint = '/inspection/strategies'
    const searchParams = new URLSearchParams()

    if (params) {
      // 后端使用 skip/limit
      if (params.page && params.pageSize) {
        searchParams.append('skip', String((params.page - 1) * params.pageSize))
      }
      if (params.pageSize) searchParams.append('limit', params.pageSize.toString())
      if (params.type) searchParams.append('type', params.type)
      if (params.enabled !== undefined) searchParams.append('enabled', String(params.enabled))
    }

    if (searchParams.toString()) {
      endpoint += `?${searchParams.toString()}`
    }

    const response = await api.get<InspectionApiResponse<unknown>>(endpoint)

    if (!response.data) {
      throw new Error('获取策略列表失败')
    }

    // 后端现在返回 {items, total, pages} 格式
    const data = toRecord(response.data)
    const items = data.items ?? data['items']
    const strategiesArray = Array.isArray(items) ? items : toRecordArray(items)

    return {
      strategies: strategiesArray.map(s => {
        const record = toRecord(s)
        // 转换 devices 和 templates 为数字数组
        const devicesArray = Array.isArray(record.devices)
          ? record.devices.map(d => typeof d === 'number' ? d : toNumber(d, 0))
          : []
        const templatesArray = Array.isArray(record.templates)
          ? record.templates.map(t => typeof t === 'number' ? t : toNumber(t, 0))
          : []

        return {
          id: toString(record.id),
          name: toString(record.name),
          description: toString(record.description, ''),
          type: toString(record.type, 'manual') as 'scheduled' | 'manual',
          cron: record.cron ? toString(record.cron) : undefined,
          devices: devicesArray,
          templates: templatesArray,
          enabled: Boolean(record.enabled ?? true),
          createdAt: toString(record.created_at ?? record.createdAt),
          updatedAt: toString(record.updated_at ?? record.updatedAt),
          nextRunTime: record.next_run_time || record.nextRunTime ? toString(record.next_run_time ?? record.nextRunTime) : undefined
        }
      }),
      total: toNumber(data.total ?? data['total']),
      pages: toNumber(data.pages ?? data['pages']),
    }
  } catch (error) {
    console.error('获取策略列表失败:', error)
    throw error
  }
}

export async function fetchInspectionStrategy(id: string): Promise<InspectionStrategy | null> {
  try {
    const response = await api.get<InspectionApiResponse<unknown>>(`/inspection/strategies/${id}`)

    if (!response.data) {
      throw new Error('获取策略详情失败')
    }

    const record = toRecord(response.data)
    // 转换 devices 和 templates 为数字数组
    const devicesArray = Array.isArray(record.devices)
      ? record.devices.map(d => typeof d === 'number' ? d : toNumber(d, 0))
      : []
    const templatesArray = Array.isArray(record.templates)
      ? record.templates.map(t => typeof t === 'number' ? t : toNumber(t, 0))
      : []

    return {
      id: toString(record.id),
      name: toString(record.name),
      description: toString(record.description, ''),
      type: toString(record.type, 'manual') as 'scheduled' | 'manual',
      cron: record.cron ? toString(record.cron) : undefined,
      devices: devicesArray,
      templates: templatesArray,
      enabled: Boolean(record.enabled ?? true),
      createdAt: toString(record.created_at ?? record.createdAt),
      updatedAt: toString(record.updated_at ?? record.updatedAt),
      nextRunTime: record.next_run_time || record.nextRunTime ? toString(record.next_run_time ?? record.nextRunTime) : undefined
    }
  } catch (error) {
    console.error('获取策略详情失败:', error)
    return null
  }
}

export async function createInspectionStrategy(data: Partial<InspectionStrategy>): Promise<InspectionStrategy> {
  try {
    const requestData = {
      name: data.name,
      description: data.description || '',
      type: data.type || 'manual',
      cron: data.cron,
      devices: data.devices || [],
      templates: data.templates || [],
      enabled: data.enabled !== undefined ? data.enabled : true
    }

    const response = await api.post<InspectionApiResponse<unknown>>('/inspection/strategies', requestData)

    if (!response.data) {
      throw new Error('创建策略失败')
    }

    const record = toRecord(response.data)
    // 转换 devices 和 templates 为数字数组
    const devicesArray = Array.isArray(record.devices)
      ? record.devices.map(d => typeof d === 'number' ? d : toNumber(d, 0))
      : []
    const templatesArray = Array.isArray(record.templates)
      ? record.templates.map(t => typeof t === 'number' ? t : toNumber(t, 0))
      : []

    return {
      id: toString(record.id),
      name: toString(record.name),
      description: toString(record.description, ''),
      type: toString(record.type, 'manual') as 'scheduled' | 'manual',
      cron: record.cron ? toString(record.cron) : undefined,
      devices: devicesArray,
      templates: templatesArray,
      enabled: Boolean(record.enabled ?? true),
      createdAt: toString(record.created_at ?? record.createdAt),
      updatedAt: toString(record.updated_at ?? record.updatedAt),
      nextRunTime: record.next_run_time || record.nextRunTime ? toString(record.next_run_time ?? record.nextRunTime) : undefined
    }
  } catch (error) {
    console.error('创建策略失败:', error)
    throw error
  }
}

export async function updateInspectionStrategy(id: string, data: Partial<InspectionStrategy>): Promise<InspectionStrategy> {
  try {
    const requestData: Record<string, unknown> = {}
    if (data.name !== undefined) requestData.name = data.name
    if (data.description !== undefined) requestData.description = data.description
    if (data.type !== undefined) requestData.type = data.type
    if (data.cron !== undefined) requestData.cron = data.cron
    if (data.devices !== undefined) requestData.devices = data.devices
    if (data.templates !== undefined) requestData.templates = data.templates
    if (data.enabled !== undefined) requestData.enabled = data.enabled

    const response = await api.put<InspectionApiResponse<unknown>>(`/inspection/strategies/${id}`, requestData)

    if (!response.data) {
      throw new Error('更新策略失败')
    }

    const record = toRecord(response.data)
    // 转换 devices 和 templates 为数字数组
    const devicesArray = Array.isArray(record.devices)
      ? record.devices.map(d => typeof d === 'number' ? d : toNumber(d, 0))
      : []
    const templatesArray = Array.isArray(record.templates)
      ? record.templates.map(t => typeof t === 'number' ? t : toNumber(t, 0))
      : []

    return {
      id: toString(record.id),
      name: toString(record.name),
      description: toString(record.description, ''),
      type: toString(record.type, 'manual') as 'scheduled' | 'manual',
      cron: record.cron ? toString(record.cron) : undefined,
      devices: devicesArray,
      templates: templatesArray,
      enabled: Boolean(record.enabled ?? true),
      createdAt: toString(record.created_at ?? record.createdAt),
      updatedAt: toString(record.updated_at ?? record.updatedAt),
      nextRunTime: record.next_run_time || record.nextRunTime ? toString(record.next_run_time ?? record.nextRunTime) : undefined
    }
  } catch (error) {
    console.error('更新策略失败:', error)
    throw error
  }
}

export async function deleteInspectionStrategy(id: string): Promise<void> {
  try {
    await api.delete(`/inspection/strategies/${id}`)
  } catch (error) {
    console.error('删除策略失败:', error)
    throw error
  }
}

export async function toggleInspectionStrategy(id: string): Promise<InspectionStrategy> {
  try {
    const response = await api.post<InspectionApiResponse<unknown>>(`/inspection/strategies/${id}/toggle`)

    if (!response.data) {
      throw new Error('切换策略状态失败')
    }

    const record = toRecord(response.data)
    // 转换 devices 和 templates 为数字数组
    const devicesArray = Array.isArray(record.devices)
      ? record.devices.map(d => typeof d === 'number' ? d : toNumber(d, 0))
      : []
    const templatesArray = Array.isArray(record.templates)
      ? record.templates.map(t => typeof t === 'number' ? t : toNumber(t, 0))
      : []

    return {
      id: toString(record.id),
      name: toString(record.name),
      description: toString(record.description, ''),
      type: toString(record.type, 'manual') as 'scheduled' | 'manual',
      cron: record.cron ? toString(record.cron) : undefined,
      devices: devicesArray,
      templates: templatesArray,
      enabled: Boolean(record.enabled ?? true),
      createdAt: toString(record.created_at ?? record.createdAt),
      updatedAt: toString(record.updated_at ?? record.updatedAt),
      nextRunTime: record.next_run_time || record.nextRunTime ? toString(record.next_run_time ?? record.nextRunTime) : undefined
    }
  } catch (error) {
    console.error('切换策略状态失败:', error)
    throw error
  }
}

export async function triggerStrategyExecution(id: string): Promise<{ message: string; inspection_ids: number[] }> {
  try {
    const response = await api.post<InspectionApiResponse<unknown>>(`/inspection/strategies/${id}/trigger`)

    if (!response.data) {
      throw new Error('触发策略执行失败')
    }

    const record = toRecord(response.data)
    // inspection_ids 是整数数组，不能用 toRecordArray（只保留对象）
    const rawIds = record.inspection_ids
    const ids: number[] = Array.isArray(rawIds)
      ? rawIds.map(item => toNumber(item, 0)).filter(n => n > 0)
      : []
    return {
      message: toString(record.message, '触发成功'),
      inspection_ids: ids
    }
  } catch (error) {
    console.error('触发策略执行失败:', error)
    throw error
  }
}

// ==================== 巡检报告 ====================

export async function generateInspectionReport(params: {
  task_id?: number
  device_ids?: number[]
  start_date?: string
  end_date?: string
  format?: 'excel' | 'pdf' | 'word'
  template?: string
}): Promise<{ report_id: string; download_url?: string }> {
  try {
    const response = await api.post<InspectionApiResponse<{ report_id: string; download_url?: string }>>('/inspection/reports/generate', params)

    if (!response.data) {
      throw new Error('生成报告失败')
    }

    return response.data
  } catch (error) {
    console.error('生成报告失败:', error)
    throw error
  }
}

export async function fetchReportStatus(reportId: string): Promise<Record<string, unknown>> {
  try {
    const response = await api.get<InspectionApiResponse<unknown>>(`/inspection/reports/${reportId}/status`)

    if (!response.data) {
      throw new Error('获取报告状态失败')
    }

    return toRecord(response.data)
  } catch (error) {
    console.error('获取报告状态失败:', error)
    return { status: 'unknown', progress: 0 }
  }
}

export async function downloadReport(reportId: string): Promise<string> {
  try {
    const response = await api.get<InspectionApiResponse<unknown>>(`/inspection/reports/${reportId}/download`)

    if (!response.data) {
      throw new Error('获取报告下载链接失败')
    }

    const data = toRecord(response.data)
    const url = toString(data.download_url ?? data['download_url'])

    if (!url) {
      throw new Error('下载链接不存在')
    }

    return url
  } catch (error) {
    console.error('下载报告失败:', error)
    throw error
  }
}

// ==================== 统计分析 ====================

export async function fetchInspectionStats(params?: string | InspectionAnalyticsRange): Promise<InspectionStats> {
  try {
    const endpoint = (() => {
      if (!params) {
        return '/inspection/stats'
      }

      if (typeof params === 'string') {
        return `/inspection/stats?range=${params}`
      }

      const searchParams = new URLSearchParams()
      searchParams.append('period', params.period)
      if (params.startDate) searchParams.append('start_date', params.startDate)
      if (params.endDate) searchParams.append('end_date', params.endDate)
      return `/inspection/stats?${searchParams.toString()}`
    })()
    const response = await api.get<InspectionApiResponse<unknown>>(endpoint)

    if (!response.data) {
      throw new Error('获取巡检统计失败')
    }

    return transformStatsData(response.data)
  } catch (error) {
    console.error('获取巡检统计失败:', error)
    throw error
  }
}

export async function fetchInspectionTrends(params: {
  period: 'day' | 'week' | 'month'
  startDate?: string
  endDate?: string
}): Promise<TrendPoint[]> {
  try {
    let endpoint = '/inspection/trends'
    const searchParams = new URLSearchParams()
    searchParams.append('period', params.period)
    if (params.startDate) searchParams.append('start_date', params.startDate)
    if (params.endDate) searchParams.append('end_date', params.endDate)

    endpoint += `?${searchParams.toString()}`

    const response = await api.get<InspectionApiResponse<unknown>>(endpoint)

    if (!response.data) {
      throw new Error('获取趋势数据失败')
    }

    const list = Array.isArray(response.data) ? response.data : toRecordArray(response.data)
    return list.map(mapTrendPoint)
  } catch (error) {
    console.error('获取趋势数据失败:', error)
    throw error
  }
}

const buildAnalyticsRangeQuery = (params?: InspectionAnalyticsRange): string => {
  if (!params) {
    return ''
  }

  const searchParams = new URLSearchParams()
  searchParams.append('period', params.period)
  if (params.startDate) searchParams.append('start_date', params.startDate)
  if (params.endDate) searchParams.append('end_date', params.endDate)

  const queryString = searchParams.toString()
  return queryString ? `?${queryString}` : ''
}

export async function fetchDeviceDistribution(params?: InspectionAnalyticsRange): Promise<Array<{
  name: string
  value: number
  color: string
}>> {
  try {
    const response = await api.get<InspectionApiResponse<unknown>>(`/inspection/device-distribution${buildAnalyticsRangeQuery(params)}`)

    if (!response.data) {
      throw new Error('获取设备分布失败')
    }

    const items = Array.isArray(response.data) ? response.data : toRecordArray(response.data)

    return items.map(item => {
      const record = toRecord(item)
      return {
        name: toString(record.name),
        value: toNumber(record.value),
        color: toString(record.color, '#888888'),
      }
    })
  } catch (error) {
    console.error('获取设备分布失败:', error)
    throw error
  }
}

export async function fetchProblemDistribution(params?: InspectionAnalyticsRange): Promise<Array<{
  category: string
  count: number
}>> {
  try {
    const response = await api.get<InspectionApiResponse<unknown>>(`/inspection/problem-distribution${buildAnalyticsRangeQuery(params)}`)

    if (!response.data) {
      throw new Error('获取问题分布失败')
    }

    const items = Array.isArray(response.data) ? response.data : toRecordArray(response.data)

    return items.map(item => {
      const record = toRecord(item)
      return {
        category: toString(record.category),
        count: toNumber(record.count),
      }
    })
  } catch (error) {
    console.error('获取问题分布失败:', error)
    throw error
  }
}

const formatDateTimeForReportFilename = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, '0')

  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

const buildAnalyticsReportFilename = (formatType: 'excel' | 'pdf'): string =>
  `巡检统计分析报告_${formatDateTimeForReportFilename(new Date())}.${formatType}`

export async function exportAnalyticsReport(params: {
  period: 'day' | 'week' | 'month'
  startDate?: string
  endDate?: string
  formatType?: 'excel' | 'pdf'
  includeCharts?: boolean
}): Promise<void> {
  try {
    const formatType = params.formatType ?? 'pdf'
    const searchParams = new URLSearchParams()
    searchParams.append('period', params.period)
    if (params.startDate) searchParams.append('start_date', params.startDate)
    if (params.endDate) searchParams.append('end_date', params.endDate)
    searchParams.append('format_type', formatType)
    searchParams.append('include_charts', String(params.includeCharts ?? true))

    const endpoint = `/api/v1/inspection/analytics/export?${searchParams.toString()}`

    // 使用统一下载工具（Cookie 认证 + 非安全方法回填 CSRF）
    const response = await authorizedDownload(`${getApiOrigin()}${endpoint}`, {
      method: 'POST',
    })

    if (!response.ok) {
      throw new Error(`导出报告失败: ${response.statusText}`)
    }

    // 从响应头获取文件名
    const contentDisposition = response.headers.get('content-disposition')
    let filename = buildAnalyticsReportFilename(formatType)
    if (formatType !== 'pdf' && contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?(.+)"?/)
      if (filenameMatch) {
        filename = decodeURIComponent(filenameMatch[1])
      }
    }

    // 获取文件 blob 并触发下载
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  } catch (error) {
    console.error('导出分析报告失败:', error)
    throw error
  }
}
