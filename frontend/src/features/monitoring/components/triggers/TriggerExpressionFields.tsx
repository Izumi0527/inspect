'use client'

import type { UseFormReturn } from 'react-hook-form'
import { Input } from '@/components/atoms'
import { Switch } from '@/components/ui/switch'
import type { MonitoringDeviceOption } from '../../types'
import {
  DEPENDENCY_MODE_OPTIONS,
  EXPRESSION_MODE_OPTIONS,
  METRIC_META,
  OPERATOR_LABELS,
  type TriggerFormValues,
} from './triggerHelpers'

interface TriggerExpressionFieldsProps {
  form: UseFormReturn<TriggerFormValues>
  devices: MonitoringDeviceOption[]
}

export function TriggerExpressionFields({ form, devices }: TriggerExpressionFieldsProps) {
  const watched = form.watch()
  const { errors } = form.formState

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="trig-name" className="mb-1 block text-xs font-medium text-foreground">
            规则名称
          </label>
          <Input id="trig-name" {...form.register('name')} placeholder="例如：核心交换机高温告警" />
          {errors.name && <p className="mt-1 text-xs text-danger">{errors.name.message}</p>}
        </div>
        <div>
          <label htmlFor="trig-severity" className="mb-1 block text-xs font-medium text-foreground">
            告警级别
          </label>
          <select
            id="trig-severity"
            {...form.register('severity')}
            className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm text-foreground"
          >
            <option value="critical">严重告警</option>
            <option value="warning">警告告警</option>
            <option value="info">提示告警</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="trig-mode" className="mb-1 block text-xs font-medium text-foreground">
            检测模式
          </label>
          <select
            id="trig-mode"
            {...form.register('expression_mode')}
            className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm text-foreground"
          >
            {EXPRESSION_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="trig-metric" className="mb-1 block text-xs font-medium text-foreground">
            监测指标
          </label>
          <select
            id="trig-metric"
            {...form.register('metric_name')}
            className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm text-foreground"
          >
            {Object.entries(METRIC_META).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>
        </div>
      </div>

      {(watched.expression_mode === 'threshold' ||
        watched.expression_mode === 'hysteresis' ||
        watched.expression_mode === 'if_flap') && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="trig-op" className="mb-1 block text-xs font-medium text-foreground">
              触发条件
            </label>
            <select
              id="trig-op"
              {...form.register('operator')}
              className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm text-foreground"
            >
              {Object.entries(OPERATOR_LABELS).map(([op, label]) => (
                <option key={op} value={op}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="trig-threshold" className="mb-1 block text-xs font-medium text-foreground">
              触发阈值
            </label>
            <Input id="trig-threshold" type="number" step="any" className="tabular-nums" {...form.register('threshold_value')} />
          </div>
          <div>
            <label htmlFor="trig-duration" className="mb-1 block text-xs font-medium text-foreground">
              防误报持续时长（秒）
            </label>
            <Input id="trig-duration" type="number" className="tabular-nums" {...form.register('duration')} />
          </div>
        </div>
      )}

      {watched.expression_mode === 'hysteresis' && (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface-2/50 p-3 sm:grid-cols-2">
          <div>
            <label htmlFor="trig-rec-op" className="mb-1 block text-xs font-medium text-foreground">
              防抖动恢复条件
            </label>
            <select
              id="trig-rec-op"
              {...form.register('recovery_operator')}
              className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm text-foreground"
            >
              {Object.entries(OPERATOR_LABELS).map(([op, label]) => (
                <option key={op} value={op}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="trig-rec-val" className="mb-1 block text-xs font-medium text-foreground">
              防抖动恢复阈值
            </label>
            <Input id="trig-rec-val" type="number" step="any" className="tabular-nums" {...form.register('recovery_threshold')} />
          </div>
        </div>
      )}

      {watched.expression_mode === 'nodata' && (
        <div>
          <label htmlFor="trig-nodata" className="mb-1 block text-xs font-medium text-foreground">
            断流判定时长（秒）
          </label>
          <Input id="trig-nodata" type="number" className="tabular-nums" {...form.register('nodata_seconds')} />
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-border bg-surface-2/40 p-3">
        <div>
          <label htmlFor="trig-dep-mode" className="mb-1 block text-xs font-medium text-foreground">
            上级断网防风暴
          </label>
          <select
            id="trig-dep-mode"
            {...form.register('dependency_mode')}
            className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm text-foreground"
          >
            {DEPENDENCY_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {watched.dependency_mode === 'manual_device' && (
          <div>
            <label htmlFor="trig-dep-dev" className="mb-1 block text-xs font-medium text-foreground">
              指定上级父设备
            </label>
            <select
              id="trig-dep-dev"
              {...form.register('depends_on_device_id')}
              className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm text-foreground"
            >
              <option value="">请选择父设备...</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.ipAddress})</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-foreground">
          <label className="flex items-center gap-2">
            <Switch checked={watched.is_active} onCheckedChange={(c) => form.setValue('is_active', c)} />
            启用该规则
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={watched.email_enabled} onCheckedChange={(c) => form.setValue('email_enabled', c)} />
            邮件推送
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={watched.webhook_enabled} onCheckedChange={(c) => form.setValue('webhook_enabled', c)} />
            Webhook 推送
          </label>
        </div>
      </div>
    </>
  )
}
