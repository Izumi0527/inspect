import { api } from '@/lib/api-client'
import type {
  ActiveMaintenancesResponse,
  CreateTemplateInput,
  CustomCollectResult,
  LLDPreviewRequest,
  LLDPreviewResult,
  MaintenanceInput,
  MaintenanceView,
  MonitorItem,
  MonitorItemInput,
  MonitorLLDRule,
  MonitorLLDRuleInput,
  MonitorTemplate,
  SnoozeAlertRequest,
  SnoozeAlertResponse,
  TemplateBindingsInput,
  TemplateDetailResponse,
  TestMonitoringItemRequest,
  TriggerRule,
  TriggerRuleInput,
  UnsnoozeAlertResponse,
} from '../types/zabbix-monitoring.types'

function unwrapData<T>(payload: unknown): T {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'success' in payload &&
    (payload as { success?: unknown }).success === true &&
    'data' in payload
  ) {
    return (payload as { data: T }).data
  }
  return payload as T
}

function extractItems<T>(payload: unknown): T[] {
  const data = unwrapData<unknown>(payload)
  if (Array.isArray(data)) return data as T[]
  if (typeof data === 'object' && data !== null && 'items' in data) {
    const items = (data as { items?: unknown }).items
    return Array.isArray(items) ? (items as T[]) : []
  }
  return []
}

// ── 监控方案（模板）CRUD / Clone / Bindings ──────────────────────────────────

export async function listMonitoringTemplates(): Promise<TemplateDetailResponse[]> {
  const payload = await api.get<unknown>('/monitoring/templates')
  return extractItems<TemplateDetailResponse>(payload)
}

export async function getMonitoringTemplate(id: number): Promise<TemplateDetailResponse> {
  const payload = await api.get<unknown>(`/monitoring/templates/${id}`)
  return unwrapData<TemplateDetailResponse>(payload)
}

export async function createMonitoringTemplate(
  input: CreateTemplateInput
): Promise<MonitorTemplate> {
  const payload = await api.post<unknown>('/monitoring/templates', input)
  return unwrapData<MonitorTemplate>(payload)
}

export async function updateMonitoringTemplate(
  id: number,
  input: CreateTemplateInput
): Promise<MonitorTemplate> {
  const payload = await api.put<unknown>(`/monitoring/templates/${id}`, input)
  return unwrapData<MonitorTemplate>(payload)
}

export async function deleteMonitoringTemplate(id: number): Promise<void> {
  await api.delete<unknown>(`/monitoring/templates/${id}`)
}

export async function cloneMonitoringTemplate(
  id: number,
  name?: string
): Promise<TemplateDetailResponse> {
  const payload = await api.post<unknown>(`/monitoring/templates/${id}/clone`, {
    ...(name ? { name } : {}),
  })
  return unwrapData<TemplateDetailResponse>(payload)
}

export async function updateMonitoringTemplateBindings(
  id: number,
  input: TemplateBindingsInput
): Promise<void> {
  await api.put<unknown>(`/monitoring/templates/${id}/bindings`, input)
}

// ── 采集指标 CRUD & 在线测试 ─────────────────────────────────────────────────

export async function listTemplateItems(templateId: number): Promise<MonitorItem[]> {
  const payload = await api.get<unknown>(`/monitoring/templates/${templateId}/items`)
  return extractItems<MonitorItem>(payload)
}

export async function createTemplateItem(
  templateId: number,
  input: MonitorItemInput
): Promise<MonitorItem> {
  const payload = await api.post<unknown>(`/monitoring/templates/${templateId}/items`, input)
  return unwrapData<MonitorItem>(payload)
}

export async function updateTemplateItem(
  templateId: number,
  itemId: number,
  input: MonitorItemInput
): Promise<MonitorItem> {
  const payload = await api.put<unknown>(
    `/monitoring/templates/${templateId}/items/${itemId}`,
    input
  )
  return unwrapData<MonitorItem>(payload)
}

export async function deleteTemplateItem(templateId: number, itemId: number): Promise<void> {
  await api.delete<unknown>(`/monitoring/templates/${templateId}/items/${itemId}`)
}

export async function testMonitoringItem(
  req: TestMonitoringItemRequest
): Promise<CustomCollectResult> {
  const payload = await api.post<unknown>('/monitoring/items/test', req)
  return unwrapData<CustomCollectResult>(payload)
}

// ── 端口与硬件自动识别 CRUD & 预览 ───────────────────────────────────────────

export async function listTemplateLLDRules(templateId: number): Promise<MonitorLLDRule[]> {
  const payload = await api.get<unknown>(`/monitoring/templates/${templateId}/lld-rules`)
  return extractItems<MonitorLLDRule>(payload)
}

export async function createTemplateLLDRule(
  templateId: number,
  input: MonitorLLDRuleInput
): Promise<MonitorLLDRule> {
  const payload = await api.post<unknown>(
    `/monitoring/templates/${templateId}/lld-rules`,
    input
  )
  return unwrapData<MonitorLLDRule>(payload)
}

export async function updateTemplateLLDRule(
  templateId: number,
  ruleId: number,
  input: MonitorLLDRuleInput
): Promise<MonitorLLDRule> {
  const payload = await api.put<unknown>(
    `/monitoring/templates/${templateId}/lld-rules/${ruleId}`,
    input
  )
  return unwrapData<MonitorLLDRule>(payload)
}

export async function deleteTemplateLLDRule(
  templateId: number,
  ruleId: number
): Promise<void> {
  await api.delete<unknown>(`/monitoring/templates/${templateId}/lld-rules/${ruleId}`)
}

export async function previewTemplateLLDRule(
  templateId: number,
  req: LLDPreviewRequest
): Promise<LLDPreviewResult> {
  const payload = await api.post<unknown>(
    `/monitoring/templates/${templateId}/lld-rules/preview`,
    req
  )
  return unwrapData<LLDPreviewResult>(payload)
}

// ── 告警规则 CRUD & Toggle ──────────────────────────────────────────────────

export async function listMonitoringTriggers(params?: {
  severity?: string
  category?: string
  is_active?: boolean
}): Promise<TriggerRule[]> {
  const payload = await api.get<unknown>('/monitoring/triggers', {
    params: params
      ? {
          severity: params.severity || undefined,
          category: params.category || undefined,
          is_active:
            typeof params.is_active === 'boolean' ? params.is_active : undefined,
        }
      : undefined,
  })
  return extractItems<TriggerRule>(payload)
}

export async function createMonitoringTrigger(
  input: TriggerRuleInput
): Promise<TriggerRule> {
  const payload = await api.post<unknown>('/monitoring/triggers', input)
  return unwrapData<TriggerRule>(payload)
}

export async function updateMonitoringTrigger(
  id: number,
  input: Partial<TriggerRuleInput>
): Promise<TriggerRule> {
  const payload = await api.put<unknown>(`/monitoring/triggers/${id}`, input)
  return unwrapData<TriggerRule>(payload)
}

export async function deleteMonitoringTrigger(id: number): Promise<void> {
  await api.delete<unknown>(`/monitoring/triggers/${id}`)
}

export async function toggleMonitoringTrigger(id: number): Promise<TriggerRule> {
  const payload = await api.patch<unknown>(`/monitoring/triggers/${id}/toggle`)
  return unwrapData<TriggerRule>(payload)
}

// ── 单条告警快捷接手确认与临时静默 (Snooze) ───────────────────────────────────

export async function acknowledgeAlert(
  alertId: number,
  payload?: { note?: string; assignee?: string }
): Promise<{ success: boolean }> {
  return await api.post<{ success: boolean }>(
    `/alerts/${alertId}/acknowledge`,
    payload ?? {}
  )
}

export async function snoozeAlert(
  alertId: number,
  payload: SnoozeAlertRequest
): Promise<SnoozeAlertResponse> {
  return await api.post<SnoozeAlertResponse>(`/alerts/${alertId}/snooze`, payload)
}

export async function unsnoozeAlert(alertId: number): Promise<UnsnoozeAlertResponse> {
  return await api.delete<UnsnoozeAlertResponse>(`/alerts/${alertId}/snooze`)
}

// ── 计划维护窗口 CRUD & Active ───────────────────────────────────────────────

export async function listMonitoringMaintenances(): Promise<MaintenanceView[]> {
  const payload = await api.get<unknown>('/monitoring/maintenances')
  return extractItems<MaintenanceView>(payload)
}

export async function getMonitoringMaintenance(id: number): Promise<MaintenanceView> {
  const payload = await api.get<unknown>(`/monitoring/maintenances/${id}`)
  return unwrapData<MaintenanceView>(payload)
}

export async function createMonitoringMaintenance(
  input: MaintenanceInput
): Promise<MaintenanceView> {
  const payload = await api.post<unknown>('/monitoring/maintenances', input)
  return unwrapData<MaintenanceView>(payload)
}

export async function updateMonitoringMaintenance(
  id: number,
  input: MaintenanceInput
): Promise<MaintenanceView> {
  const payload = await api.put<unknown>(`/monitoring/maintenances/${id}`, input)
  return unwrapData<MaintenanceView>(payload)
}

export async function deleteMonitoringMaintenance(id: number): Promise<void> {
  await api.delete<unknown>(`/monitoring/maintenances/${id}`)
}

export async function getActiveMonitoringMaintenances(params?: {
  device_ids?: number[]
  group_ids?: number[]
}): Promise<ActiveMaintenancesResponse> {
  const payload = await api.get<unknown>('/monitoring/maintenances/active', {
    params: params
      ? {
          device_ids: params.device_ids,
          group_ids: params.group_ids,
        }
      : undefined,
  })
  return unwrapData<ActiveMaintenancesResponse>(payload)
}
