import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { DEVICE_GROUPS_QUERY_KEY } from '@/features/devices/api/devices.api'
import {
  cloneMonitoringTemplate,
  createMonitoringMaintenance,
  createMonitoringTemplate,
  createMonitoringTrigger,
  createTemplateItem,
  createTemplateLLDRule,
  deleteMonitoringMaintenance,
  deleteMonitoringTemplate,
  deleteMonitoringTrigger,
  deleteTemplateItem,
  deleteTemplateLLDRule,
  getActiveMonitoringMaintenances,
  getMonitoringTemplate,
  listMonitoringMaintenances,
  listMonitoringTemplates,
  listMonitoringTriggers,
  listTemplateItems,
  listTemplateLLDRules,
  previewTemplateLLDRule,
  testMonitoringItem,
  toggleMonitoringTrigger,
  updateMonitoringMaintenance,
  updateMonitoringTemplate,
  updateMonitoringTemplateBindings,
  updateMonitoringTrigger,
  updateTemplateItem,
  updateTemplateLLDRule,
} from '../api/monitoring-config.api'
import type {
  CreateTemplateInput,
  LLDPreviewRequest,
  MaintenanceInput,
  MonitorItemInput,
  MonitorLLDRuleInput,
  TemplateBindingsInput,
  TestMonitoringItemRequest,
  TriggerRuleInput,
} from '../types/zabbix-monitoring.types'

export const MONITORING_TEMPLATES_QUERY_KEY = ['monitoring-templates'] as const
export const MONITORING_TRIGGERS_QUERY_KEY = ['monitoring-triggers'] as const
export const MONITORING_MAINTENANCES_QUERY_KEY = ['monitoring-maintenances'] as const
export const MONITORING_ACTIVE_MAINTENANCES_QUERY_KEY = ['monitoring-maintenances-active'] as const

export const monitoringTemplateDetailQueryKey = (id: number) =>
  ['monitoring-template', id] as const
export const monitoringTemplateItemsQueryKey = (id: number) =>
  ['monitoring-template-items', id] as const
export const monitoringTemplateLLDRulesQueryKey = (id: number) =>
  ['monitoring-template-lld-rules', id] as const

const SHARED_KEYS: ReadonlyArray<readonly unknown[]> = [
  ['monitoring-hosts'],
  ['monitoring-host-detail'],
  ['monitoring-v2'],
  ['monitoring-dashboard-v2'],
  ['monitoring-latest-data'],
]

function invalidateKeys(qc: QueryClient, keys: ReadonlyArray<readonly unknown[]>) {
  for (const queryKey of keys) void qc.invalidateQueries({ queryKey })
}

function getTemplateInvalidateKeys(templateId?: number): Array<readonly unknown[]> {
  const keys: Array<readonly unknown[]> = [MONITORING_TEMPLATES_QUERY_KEY, ...SHARED_KEYS]
  if (templateId && templateId > 0) {
    keys.push(
      monitoringTemplateDetailQueryKey(templateId),
      monitoringTemplateItemsQueryKey(templateId),
      monitoringTemplateLLDRulesQueryKey(templateId)
    )
  }
  return keys
}

function useConfigMutation<TData, TVars>(
  mutationFn: (vars: TVars) => Promise<TData>,
  getKeys: (vars: TVars) => ReadonlyArray<readonly unknown[]>
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (_, vars) => invalidateKeys(qc, getKeys(vars)),
  })
}

// ── 监控方案 Queries & Mutations ─────────────────────────────────────────────

export function useMonitoringTemplates(enabled = true) {
  return useQuery({
    queryKey: MONITORING_TEMPLATES_QUERY_KEY,
    queryFn: listMonitoringTemplates,
    enabled,
    staleTime: 60_000,
    retry: 1,
  })
}

export function useMonitoringTemplate(id: number | null) {
  return useQuery({
    queryKey: monitoringTemplateDetailQueryKey(id ?? 0),
    queryFn: () => getMonitoringTemplate(id as number),
    enabled: id !== null && id > 0,
    staleTime: 30_000,
    retry: 1,
  })
}

export const useCreateMonitoringTemplateMutation = () =>
  useConfigMutation((input: CreateTemplateInput) => createMonitoringTemplate(input), () =>
    getTemplateInvalidateKeys()
  )

export const useUpdateMonitoringTemplateMutation = () =>
  useConfigMutation(
    ({ id, input }: { id: number; input: CreateTemplateInput }) => updateMonitoringTemplate(id, input),
    (vars) => getTemplateInvalidateKeys(vars.id)
  )

export const useDeleteMonitoringTemplateMutation = () =>
  useConfigMutation((id: number) => deleteMonitoringTemplate(id), () => getTemplateInvalidateKeys())

export const useCloneMonitoringTemplateMutation = () =>
  useConfigMutation(
    ({ id, name }: { id: number; name?: string }) => cloneMonitoringTemplate(id, name),
    () => getTemplateInvalidateKeys()
  )

export const useUpdateTemplateBindingsMutation = () =>
  useConfigMutation(
    ({ id, input }: { id: number; input: TemplateBindingsInput }) =>
      updateMonitoringTemplateBindings(id, input),
    (vars) => [...getTemplateInvalidateKeys(vars.id), DEVICE_GROUPS_QUERY_KEY]
  )

// ── 采集指标 Queries & Mutations ─────────────────────────────────────────────

export function useTemplateItems(templateId: number | null) {
  return useQuery({
    queryKey: monitoringTemplateItemsQueryKey(templateId ?? 0),
    queryFn: () => listTemplateItems(templateId as number),
    enabled: templateId !== null && templateId > 0,
    staleTime: 30_000,
    retry: 1,
  })
}

export const useCreateTemplateItemMutation = (templateId: number) =>
  useConfigMutation(
    (input: MonitorItemInput) => createTemplateItem(templateId, input),
    () => getTemplateInvalidateKeys(templateId)
  )

export const useUpdateTemplateItemMutation = (templateId: number) =>
  useConfigMutation(
    ({ itemId, input }: { itemId: number; input: MonitorItemInput }) =>
      updateTemplateItem(templateId, itemId, input),
    () => getTemplateInvalidateKeys(templateId)
  )

export const useDeleteTemplateItemMutation = (templateId: number) =>
  useConfigMutation(
    (itemId: number) => deleteTemplateItem(templateId, itemId),
    () => getTemplateInvalidateKeys(templateId)
  )

export const useTestMonitoringItemMutation = () =>
  useMutation({
    mutationFn: (req: TestMonitoringItemRequest) => testMonitoringItem(req),
  })

// ── 端口与硬件自动识别 Queries & Mutations ───────────────────────────────────

export function useTemplateLLDRules(templateId: number | null) {
  return useQuery({
    queryKey: monitoringTemplateLLDRulesQueryKey(templateId ?? 0),
    queryFn: () => listTemplateLLDRules(templateId as number),
    enabled: templateId !== null && templateId > 0,
    staleTime: 30_000,
    retry: 1,
  })
}

export const useCreateTemplateLLDRuleMutation = (templateId: number) =>
  useConfigMutation(
    (input: MonitorLLDRuleInput) => createTemplateLLDRule(templateId, input),
    () => getTemplateInvalidateKeys(templateId)
  )

export const useUpdateTemplateLLDRuleMutation = (templateId: number) =>
  useConfigMutation(
    ({ ruleId, input }: { ruleId: number; input: MonitorLLDRuleInput }) =>
      updateTemplateLLDRule(templateId, ruleId, input),
    () => getTemplateInvalidateKeys(templateId)
  )

export const useDeleteTemplateLLDRuleMutation = (templateId: number) =>
  useConfigMutation(
    (ruleId: number) => deleteTemplateLLDRule(templateId, ruleId),
    () => getTemplateInvalidateKeys(templateId)
  )

export const usePreviewLLDRuleMutation = (templateId: number) =>
  useMutation({
    mutationFn: (req: LLDPreviewRequest) => previewTemplateLLDRule(templateId, req),
  })

// ── 告警规则 Queries & Mutations ─────────────────────────────────────────────

export function useMonitoringTriggers(
  params?: { severity?: string; category?: string; is_active?: boolean },
  enabled = true
) {
  return useQuery({
    queryKey: [...MONITORING_TRIGGERS_QUERY_KEY, params ?? {}],
    queryFn: () => listMonitoringTriggers(params),
    enabled,
    staleTime: 30_000,
    retry: 1,
  })
}

const TRIGGER_KEYS: ReadonlyArray<readonly unknown[]> = [MONITORING_TRIGGERS_QUERY_KEY, ...SHARED_KEYS]

export const useCreateMonitoringTriggerMutation = () =>
  useConfigMutation((input: TriggerRuleInput) => createMonitoringTrigger(input), () => TRIGGER_KEYS)

export const useUpdateMonitoringTriggerMutation = () =>
  useConfigMutation(
    ({ id, input }: { id: number; input: Partial<TriggerRuleInput> }) =>
      updateMonitoringTrigger(id, input),
    () => TRIGGER_KEYS
  )

export const useDeleteMonitoringTriggerMutation = () =>
  useConfigMutation((id: number) => deleteMonitoringTrigger(id), () => TRIGGER_KEYS)

export const useToggleMonitoringTriggerMutation = () =>
  useConfigMutation((id: number) => toggleMonitoringTrigger(id), () => TRIGGER_KEYS)

// ── 计划维护 Queries & Mutations ─────────────────────────────────────────────

export function useMonitoringMaintenances(enabled = true) {
  return useQuery({
    queryKey: MONITORING_MAINTENANCES_QUERY_KEY,
    queryFn: listMonitoringMaintenances,
    enabled,
    staleTime: 30_000,
    retry: 1,
  })
}

export function useActiveMonitoringMaintenances(
  params?: { device_ids?: number[]; group_ids?: number[] },
  enabled = true
) {
  return useQuery({
    queryKey: [...MONITORING_ACTIVE_MAINTENANCES_QUERY_KEY, params ?? {}],
    queryFn: () => getActiveMonitoringMaintenances(params),
    enabled,
    staleTime: 30_000,
    retry: 1,
  })
}

const MAINT_KEYS: ReadonlyArray<readonly unknown[]> = [
  MONITORING_MAINTENANCES_QUERY_KEY,
  MONITORING_ACTIVE_MAINTENANCES_QUERY_KEY,
  ...SHARED_KEYS,
]

export const useCreateMonitoringMaintenanceMutation = () =>
  useConfigMutation((input: MaintenanceInput) => createMonitoringMaintenance(input), () => MAINT_KEYS)

export const useUpdateMonitoringMaintenanceMutation = () =>
  useConfigMutation(
    ({ id, input }: { id: number; input: MaintenanceInput }) =>
      updateMonitoringMaintenance(id, input),
    () => MAINT_KEYS
  )

export const useDeleteMonitoringMaintenanceMutation = () =>
  useConfigMutation((id: number) => deleteMonitoringMaintenance(id), () => MAINT_KEYS)
