'use client'

import type { UseFormReturn } from 'react-hook-form'
import { Input } from '@/components/atoms'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
          <Select
            value={String(watched.severity ?? 'warning')}
            onValueChange={(val) =>
              form.setValue('severity', val as TriggerFormValues['severity'], {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger id="trig-severity" aria-label="告警级别" className="h-9 w-full gap-2 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="critical">严重告警</SelectItem>
              <SelectItem value="warning">警告告警</SelectItem>
              <SelectItem value="info">提示告警</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="trig-mode" className="mb-1 block text-xs font-medium text-foreground">
            检测模式
          </label>
          <Select
            value={String(watched.expression_mode ?? 'threshold')}
            onValueChange={(val) =>
              form.setValue('expression_mode', val as TriggerFormValues['expression_mode'], {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger id="trig-mode" aria-label="检测模式" className="h-9 w-full gap-2 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPRESSION_MODE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor="trig-metric" className="mb-1 block text-xs font-medium text-foreground">
            监测指标
          </label>
          <Select
            value={String(watched.metric_name ?? 'temperature')}
            onValueChange={(val) =>
              form.setValue('metric_name', val, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger id="trig-metric" aria-label="监测指标" className="h-9 w-full gap-2 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(METRIC_META).map(([key, meta]) => (
                <SelectItem key={key} value={key}>{meta.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            <Select
              value={String(watched.operator ?? '>')}
              onValueChange={(val) =>
                form.setValue('operator', val as TriggerFormValues['operator'], {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="trig-op" aria-label="触发条件" className="h-9 w-full gap-2 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(OPERATOR_LABELS).map(([op, label]) => (
                  <SelectItem key={op} value={op}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Select
              value={String(watched.recovery_operator ?? '<')}
              onValueChange={(val) =>
                form.setValue('recovery_operator', val as TriggerFormValues['recovery_operator'], {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="trig-rec-op" aria-label="防抖动恢复条件" className="h-9 w-full gap-2 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(OPERATOR_LABELS).map(([op, label]) => (
                  <SelectItem key={op} value={op}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Select
            value={String(watched.dependency_mode ?? 'none')}
            onValueChange={(val) =>
              form.setValue('dependency_mode', val as TriggerFormValues['dependency_mode'], {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger id="trig-dep-mode" aria-label="上级断网防风暴" className="h-9 w-full gap-2 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEPENDENCY_MODE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {watched.dependency_mode === 'manual_device' && (
          <div>
            <label htmlFor="trig-dep-dev" className="mb-1 block text-xs font-medium text-foreground">
              指定上级父设备
            </label>
            <Select
              value={watched.depends_on_device_id ? String(watched.depends_on_device_id) : ''}
              onValueChange={(val) =>
                form.setValue('depends_on_device_id', Number(val), {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="trig-dep-dev" aria-label="指定上级父设备" className="h-9 w-full gap-2 text-sm">
                <SelectValue placeholder="请选择父设备..." />
              </SelectTrigger>
              <SelectContent>
                {devices.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>{`${d.name} (${d.ipAddress})`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
