'use client'

import { useCallback, useEffect, useState } from 'react'
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
import type { MonitorItem, MonitorItemInput, PreprocessStep } from '../../types/zabbix-monitoring.types'
import { ItemPreprocessEditor, type ValueMapEntry } from './ItemPreprocessEditor'
import { ItemProtocolFields } from './ItemProtocolFields'
import { ItemTestBench } from './ItemTestBench'
import {
  itemFormSchema,
  parseItemPreprocessSteps,
  parseItemValueMap,
  type ItemFormValues,
} from './templateConfigHelpers'

interface ItemEditorModalProps {
  open: boolean
  editingItem: MonitorItem | null
  readOnly?: boolean
  submitting: boolean
  onClose: () => void
  onSubmit: (input: MonitorItemInput) => void
}

function toFormDefaults(item: MonitorItem | null): ItemFormValues {
  if (!item) {
    return {
      item_key: '',
      name: '',
      application_tag: 'custom',
      protocol: 'snmp_oid',
      target_expr: '',
      http_scheme: 'https',
      http_port: 443,
      http_path: '/health',
      value_type: 'float',
      unit: '',
      interval_sec: 300,
      enabled: true,
    }
  }
  const protocol =
    item.protocol === 'builtin' ||
    item.protocol === 'icmp' ||
    item.protocol === 'tcp_port' ||
    item.protocol === 'http'
      ? item.protocol
      : 'snmp_oid'
  return {
    item_key: item.item_key,
    name: item.name,
    application_tag: item.application_tag || 'custom',
    protocol,
    target_expr: item.target_expr || '',
    http_scheme: item.http_scheme === 'http' ? 'http' : 'https',
    http_port: item.http_port > 0 ? item.http_port : 443,
    http_path: item.http_path || '/',
    value_type:
      item.value_type === 'uint' || item.value_type === 'string' ? item.value_type : 'float',
    unit: item.unit || '',
    interval_sec: item.interval_sec >= 60 ? item.interval_sec : 300,
    enabled: item.enabled,
  }
}

function buildPayload(
  values: ItemFormValues,
  steps: PreprocessStep[],
  valueMapEntries: ValueMapEntry[]
): MonitorItemInput {
  const valueMap: Record<string, string> = {}
  for (const entry of valueMapEntries) {
    const k = entry.key.trim()
    const v = entry.label.trim()
    if (k && v) valueMap[k] = v
  }
  return {
    item_key: values.item_key.trim(),
    name: values.name.trim(),
    application_tag: values.application_tag.trim() || 'custom',
    protocol: values.protocol,
    target_expr:
      values.protocol === 'snmp_oid' || values.protocol === 'tcp_port'
        ? values.target_expr.trim()
        : '',
    http_scheme: values.protocol === 'http' ? values.http_scheme : '',
    http_port: values.protocol === 'http' ? Number(values.http_port) : 0,
    http_path: values.protocol === 'http' ? values.http_path.trim() : '',
    value_type: values.value_type,
    unit: values.unit.trim(),
    interval_sec: Number(values.interval_sec),
    preprocessing: steps,
    value_map: valueMap,
    enabled: values.enabled,
  }
}

export function ItemEditorModal({
  open,
  editingItem,
  readOnly = false,
  submitting,
  onClose,
  onSubmit,
}: ItemEditorModalProps) {
  const [steps, setSteps] = useState<PreprocessStep[]>([])
  const [valueMapEntries, setValueMapEntries] = useState<ValueMapEntry[]>([])

  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: toFormDefaults(null),
  })

  useEffect(() => {
    if (!open) return
    form.reset(toFormDefaults(editingItem))
    setSteps(parseItemPreprocessSteps(editingItem))
    const rawMap = parseItemValueMap(editingItem)
    setValueMapEntries(Object.entries(rawMap).map(([key, label]) => ({ key, label })))
  }, [open, editingItem, form])

  const buildItemInput = useCallback((): MonitorItemInput | null => {
    const parsed = itemFormSchema.safeParse(form.getValues())
    if (!parsed.success) return null
    return buildPayload(parsed.data, steps, valueMapEntries)
  }, [form, steps, valueMapEntries])

  const handleFormSubmit = (values: ItemFormValues) => {
    if (readOnly) return
    onSubmit(buildPayload(values, steps, valueMapEntries))
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {readOnly ? '查看采集指标详情' : editingItem ? '编辑采集指标' : '新建采集指标'}
          </DialogTitle>
          <DialogDescription>
            配置指标采集方式、数据换算与清洗步骤，并可直接在真实设备上执行在线测试。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
          <ItemProtocolFields form={form} editingExisting={Boolean(editingItem)} readOnly={readOnly} />

          <ItemPreprocessEditor
            steps={steps}
            valueMapEntries={valueMapEntries}
            disabled={readOnly}
            onChangeSteps={setSteps}
            onChangeValueMap={setValueMapEntries}
          />

          <ItemTestBench buildItemInput={buildItemInput} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              {readOnly ? '关闭' : '取消'}
            </Button>
            {!readOnly && (
              <Button type="submit" loading={submitting}>
                {editingItem ? '保存指标' : '创建指标'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
