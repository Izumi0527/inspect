'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/atoms'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useMonitoringDevices } from '../../hooks/useMonitoringDevices'
import type { TriggerRule, TriggerRuleInput } from '../../types/zabbix-monitoring.types'
import { TriggerExpressionFields } from './TriggerExpressionFields'
import {
  formatTriggerNaturalSummary,
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
    metric_name: rule.metric_name || 'temperature',
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
  const previewSentence = formatTriggerNaturalSummary({
    expression_mode: watched.expression_mode,
    metric_name: watched.metric_name,
    operator: watched.operator,
    threshold_value: Number(watched.threshold_value) || 0,
    duration: Number(watched.duration) || 0,
    severity: watched.severity,
    recovery_operator: watched.recovery_operator,
    recovery_threshold:
      watched.recovery_threshold === null || Number.isNaN(Number(watched.recovery_threshold))
        ? null
        : Number(watched.recovery_threshold),
    nodata_seconds: Number(watched.nodata_seconds) || 600,
    dependency_mode: watched.dependency_mode,
  })

  const handleFormSubmit = (values: TriggerFormValues) => {
    const recThreshold =
      values.expression_mode === 'hysteresis' &&
      values.recovery_threshold !== null &&
      values.recovery_threshold !== undefined &&
      !Number.isNaN(Number(values.recovery_threshold))
        ? Number(values.recovery_threshold)
        : null
    const depDeviceId =
      values.dependency_mode === 'manual_device' &&
      values.depends_on_device_id &&
      !Number.isNaN(Number(values.depends_on_device_id))
        ? Number(values.depends_on_device_id)
        : null

    onSubmit({
      name: values.name,
      severity: values.severity,
      category: values.metric_name === 'if_flap_count_1h' ? 'network' : 'performance',
      metric_name:
        values.expression_mode === 'uptime_drop'
          ? 'sys_uptime'
          : values.expression_mode === 'if_flap'
            ? 'if_flap_count_1h'
            : values.metric_name,
      operator: values.operator,
      threshold_value: Number(values.threshold_value),
      duration: values.expression_mode === 'uptime_drop' ? 60 : Number(values.duration),
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
      <DialogContent className="left-auto right-0 top-0 h-full max-h-screen w-full max-w-xl translate-x-0 translate-y-0 overflow-y-auto rounded-none border-l border-border">
        <DialogHeader>
          <DialogTitle>{editingRule ? '编辑告警规则' : '新建告警规则'}</DialogTitle>
          <DialogDescription>
            配置触发条件、防误报持续时长与上级断网防风暴策略，底部实时预览规则效果。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
          <TriggerExpressionFields form={form} devices={devices} />

          <div aria-label="规则自然语言预览" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
            <p className="font-semibold text-primary">规则效果预览</p>
            <p className="mt-1 text-sm font-medium text-foreground">{previewSentence}</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              取消
            </Button>
            <Button type="submit" loading={submitting}>
              {editingRule ? '保存规则' : '创建规则'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
