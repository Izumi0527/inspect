'use client'

import type { UseFormReturn } from 'react-hook-form'
import { Input } from '@/components/atoms'
import { Switch } from '@/components/ui/switch'
import { PROTOCOL_OPTIONS, type ItemFormValues } from './templateConfigHelpers'

interface ItemProtocolFieldsProps {
  form: UseFormReturn<ItemFormValues>
  editingExisting: boolean
  readOnly: boolean
}

export function ItemProtocolFields({ form, editingExisting, readOnly }: ItemProtocolFieldsProps) {
  const protocol = form.watch('protocol')
  const enabled = form.watch('enabled')
  const { errors } = form.formState

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="item-name" className="mb-1 block text-xs font-medium text-foreground">
            指标名称
          </label>
          <Input id="item-name" disabled={readOnly} {...form.register('name')} placeholder="例如：核心板卡温度" />
          {errors.name && <p className="mt-1 text-xs text-danger">{errors.name.message}</p>}
        </div>
        <div>
          <label htmlFor="item-key" className="mb-1 block text-xs font-medium text-foreground">
            指标编码（英文）
          </label>
          <Input
            id="item-key"
            disabled={readOnly || editingExisting}
            {...form.register('item_key')}
            placeholder="例如：board.temperature"
            className="font-mono"
          />
          {errors.item_key && <p className="mt-1 text-xs text-danger">{errors.item_key.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="item-protocol" className="mb-1 block text-xs font-medium text-foreground">
            采集方式
          </label>
          <select
            id="item-protocol"
            disabled={readOnly}
            {...form.register('protocol')}
            className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm text-foreground"
          >
            {protocol === 'builtin' && <option value="builtin">系统内置采集</option>}
            {PROTOCOL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="item-interval" className="mb-1 block text-xs font-medium text-foreground">
            采集周期（秒）
          </label>
          <Input id="item-interval" type="number" disabled={readOnly} className="tabular-nums" {...form.register('interval_sec')} />
          {errors.interval_sec && <p className="mt-1 text-xs text-danger">{errors.interval_sec.message}</p>}
        </div>
        <div>
          <label htmlFor="item-unit" className="mb-1 block text-xs font-medium text-foreground">
            显示单位
          </label>
          <Input id="item-unit" disabled={readOnly} {...form.register('unit')} placeholder="% / °C / ms" />
        </div>
      </div>

      {protocol === 'snmp_oid' && (
        <div>
          <label htmlFor="item-oid" className="mb-1 block text-xs font-medium text-foreground">
            SNMP 对象标识符（OID）
          </label>
          <Input
            id="item-oid"
            disabled={readOnly}
            {...form.register('target_expr')}
            placeholder=".1.3.6.1.4.1.2011.5.25.31.1.1.1.1.11"
            className="font-mono"
          />
          {errors.target_expr && <p className="mt-1 text-xs text-danger">{errors.target_expr.message}</p>}
        </div>
      )}

      {protocol === 'tcp_port' && (
        <div>
          <label htmlFor="item-tcp-port" className="mb-1 block text-xs font-medium text-foreground">
            探测 TCP 端口号
          </label>
          <Input
            id="item-tcp-port"
            type="number"
            disabled={readOnly}
            {...form.register('target_expr')}
            placeholder="例如：179 或 443"
            className="tabular-nums"
          />
          {errors.target_expr && <p className="mt-1 text-xs text-danger">{errors.target_expr.message}</p>}
        </div>
      )}

      {protocol === 'http' && (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface-2/50 p-3 sm:grid-cols-4">
          <div>
            <label htmlFor="http-scheme" className="mb-1 block text-xs font-medium text-foreground">
              协议
            </label>
            <select
              id="http-scheme"
              disabled={readOnly}
              {...form.register('http_scheme')}
              className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm text-foreground"
            >
              <option value="https">https</option>
              <option value="http">http</option>
            </select>
          </div>
          <div>
            <label htmlFor="http-port" className="mb-1 block text-xs font-medium text-foreground">
              端口
            </label>
            <Input id="http-port" type="number" disabled={readOnly} className="tabular-nums" {...form.register('http_port')} />
            {errors.http_port && <p className="mt-1 text-xs text-danger">{errors.http_port.message}</p>}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="http-path" className="mb-1 block text-xs font-medium text-foreground">
              检查路径（必须 / 开头，目标 IP 自动锁定设备地址）
            </label>
            <Input id="http-path" disabled={readOnly} {...form.register('http_path')} placeholder="/health" className="font-mono" />
            {errors.http_path && <p className="mt-1 text-xs text-danger">{errors.http_path.message}</p>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="item-value-type" className="mb-1 block text-xs font-medium text-foreground">
            数据类型
          </label>
          <select
            id="item-value-type"
            disabled={readOnly}
            {...form.register('value_type')}
            className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm text-foreground"
          >
            <option value="float">数值（小数）</option>
            <option value="uint">整数</option>
            <option value="string">文本状态</option>
          </select>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
          <span className="text-xs font-medium text-foreground">启用该采集指标</span>
          <Switch
            aria-label="启用该采集指标"
            disabled={readOnly}
            checked={enabled}
            onCheckedChange={(checked) => form.setValue('enabled', checked)}
          />
        </div>
      </div>
    </>
  )
}
