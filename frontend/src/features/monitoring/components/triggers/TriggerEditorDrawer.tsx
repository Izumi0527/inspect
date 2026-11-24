'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/atoms'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DEVICE_GROUPS_QUERY_KEY, getDeviceGroups } from '@/features/devices/api/devices.api'
import { useMonitoringDevices } from '../../hooks/useMonitoringDevices'
import type { TriggerRule, TriggerRuleInput } from '../../types/zabbix-monitoring.types'
import { TriggerExpressionFields } from './TriggerExpressionFields'
import {
  formatTriggerNaturalSummary,
  normalizeTriggerMetricName,
  triggerFormSchema,
  type TriggerFormValues,
} from './triggerHelpers'

interface TriggerEditorDrawerProps {
  open: boolean
  editingRule: TriggerRule | null
  submitting: boolean
  onClose: () => void
  onSubmit: (input: TriggerRuleInput) => void
}

function toFiniteOr(value: unknown, fallback: number): number {
  if (value === '' || value === null || value === undefined) return fallback
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function getDefaults(rule: TriggerRule | null): TriggerFormValues {
  if (!rule) {
    return {
      name: '',
      severity: 'warning',
      expression_mode: 'threshold',
      metric_name: 'temperature',
      operator: '>',
      threshold_value: 75,
      duration: 900,
      cooldown_minutes: 15,
      recovery_operator: '<',
      recovery_threshold: 70,
      nodata_seconds: 600,
      dependency_mode: 'lldp_upstream',
      depends_on_device_id: null,
      entity_filter_regex: '',
      is_active: true,
      notification_enabled: true,
      email_enabled: false,
      webhook_enabled: false,
    }
  }
  return {
    name: rule.name,
    severity: rule.severity === 'critical' || rule.severity === 'info' ? rule.severity : 'warning',
    expression_mode:
      rule.expression_mode === 'hysteresis' ||
      rule.expression_mode === 'nodata' ||
      rule.expression_mode === 'uptime_drop' ||
      rule.expression_mode === 'if_flap'
        ? rule.expression_mode
        : 'threshold',
    metric_name: normalizeTriggerMetricName(rule.metric_name) || 'temperature',
    operator:
      rule.operator === '>=' ||
      rule.operator === '<' ||
      rule.operator === '<=' ||
      rule.operator === '==' ||
      rule.operator === '!='
        ? rule.operator
        : '>',
    threshold_value: rule.threshold_value ?? rule.threshold ?? 75,
    duration: rule.duration ?? 300,
    cooldown_minutes:
      typeof rule.cooldown_minutes === 'number' && Number.isFinite(rule.cooldown_minutes)
        ? rule.cooldown_minutes
        : 15,
    recovery_operator:
      rule.recovery_operator === '>' ||
      rule.recovery_operator === '>=' ||
      rule.recovery_operator === '<=' ||
      rule.recovery_operator === '==' ||
      rule.recovery_operator === '!='
        ? rule.recovery_operator
        : '<',
    recovery_threshold: rule.recovery_threshold ?? null,
    nodata_seconds: rule.nodata_seconds > 0 ? rule.nodata_seconds : 600,
    dependency_mode:
      rule.dependency_mode === 'lldp_upstream' || rule.dependency_mode === 'manual_device'
        ? rule.dependency_mode
        : 'none',
    depends_on_device_id: rule.depends_on_device_id ?? null,
    entity_filter_regex: rule.entity_filter_regex ?? '',
    is_active: rule.is_active ?? rule.enabled,
    notification_enabled: rule.notification_enabled ?? true,
    email_enabled: rule.email_enabled ?? rule.notify_email ?? false,
    webhook_enabled: rule.webhook_enabled ?? false,
  }
}

export function TriggerEditorDrawer({
  open,
  editingRule,
  submitting,
  onClose,
  onSubmit,
}: TriggerEditorDrawerProps) {
  const { data: devices = [] } = useMonitoringDevices()
  const { data: groups = [] } = useQuery({
    queryKey: DEVICE_GROUPS_QUERY_KEY,
    queryFn: getDeviceGroups,
    staleTime: 60_000,
  })
  const [groupIds, setGroupIds] = useState<number[]>([])

  const form = useForm<TriggerFormValues>({
    resolver: zodResolver(triggerFormSchema),
    defaultValues: getDefaults(null),
  })

  useEffect(() => {
    if (!open) return
    form.reset(getDefaults(editingRule))
    setGroupIds(editingRule?.device_groups ?? [])
  }, [open, editingRule, form])

  const watched = form.watch()
  const rawRecoveryThreshold: unknown = watched.recovery_threshold
  const parsedRecoveryThreshold =
    rawRecoveryThreshold === '' ||
    rawRecoveryThreshold === null ||
    rawRecoveryThreshold === undefined
      ? null
      : Number.isFinite(Number(rawRecoveryThreshold))
        ? Number(rawRecoveryThreshold)
        : null

  const previewSentence = formatTriggerNaturalSummary({
    expression_mode: watched.expression_mode,
    metric_name: watched.metric_name,
    operator: watched.operator,
    threshold_value: toFiniteOr(watched.threshold_value, 0),
    duration: toFiniteOr(watched.duration, 0),
    severity: watched.severity,
    recovery_operator: watched.recovery_operator,
    recovery_threshold: parsedRecoveryThreshold,
    nodata_seconds: toFiniteOr(watched.nodata_seconds, 600),
    dependency_mode: watched.dependency_mode,
  })

  const handleFormSubmit = (values: TriggerFormValues) => {
    const recThreshold =
      values.expression_mode === 'hysteresis' &&
      values.recovery_threshold !== null &&
      values.recovery_threshold !== undefined &&
      Number.isFinite(Number(values.recovery_threshold))
        ? Number(values.recovery_threshold)
        : null
    const depDeviceId =
      values.dependency_mode === 'manual_device' &&
      values.depends_on_device_id &&
      Number.isFinite(Number(values.depends_on_device_id))
        ? Number(values.depends_on_device_id)
        : null

    const metricName =
      values.expression_mode === 'uptime_drop'
        ? 'uptime'
        : values.expression_mode === 'if_flap'
          ? 'flap_count_1h'
          : values.metric_name

    const category =
      values.expression_mode === 'if_flap' || metricName === 'flap_count_1h'
        ? 'network'
        : values.expression_mode === 'uptime_drop'
          ? 'system'
          : 'performance'

    onSubmit({
      name: values.name,
      severity: values.severity,
      category,
      metric_name: metricName,
      operator: values.operator,
      threshold_value: Number(values.threshold_value),
      duration: values.expression_mode === 'uptime_drop' ? 0 : Number(values.duration),
      cooldown_minutes: Number(values.cooldown_minutes),
      expression_mode: values.expression_mode,
      recovery_operator: values.expression_mode === 'hysteresis' ? values.recovery_operator : '',
      recovery_threshold: recThreshold,
      nodata_seconds: values.expression_mode === 'nodata' ? Number(values.nodata_seconds) : 0,
      dependency_mode: values.dependency_mode,
      depends_on_device_id: depDeviceId,
      entity_filter_regex: values.entity_filter_regex.trim(),
      device_groups: groupIds,
      is_active: values.is_active,
      notification_enabled: values.notification_enabled,
      email_enabled: values.email_enabled,
      webhook_enabled: values.webhook_enabled,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="left-auto right-0 top-0 flex h-full max-h-screen w-full max-w-xl translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-l border-border p-0">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border/80 bg-card px-6 py-4 pr-12 text-left">
          <DialogTitle className="text-base font-semibold tracking-tight">
            {editingRule ? '编辑告警规则' : '新建告警规则'}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
            配置触发条件、防误报持续时长与上级断网防风暴策略，底部实时预览规则效果。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleFormSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <TriggerExpressionFields
              form={form}
              devices={devices}
              groups={groups}
              selectedGroupIds={groupIds}
              onChangeGroupIds={setGroupIds}
            />
          </div>

          <div className="shrink-0 space-y-3 border-t border-border/80 bg-card px-6 py-4">
            <div
              aria-label="规则自然语言预览"
              className="rounded-lg border border-primary/25 bg-primary/5 px-3.5 py-2.5"
            >
              <p className="text-[11px] font-semibold text-primary">规则效果预览</p>
              <p className="mt-1 text-xs font-medium leading-relaxed text-foreground">
                {previewSentence}
              </p>
            </div>

            <DialogFooter className="gap-2 sm:space-x-0">
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                取消
              </Button>
              <Button type="submit" loading={submitting}>
                {editingRule ? '保存规则' : '创建规则'}
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
