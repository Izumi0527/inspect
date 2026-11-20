'use client'

import { useState } from 'react'
import { Edit3, Eye, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Badge, Button } from '@/components/atoms'
import {
  useCreateTemplateItemMutation,
  useDeleteTemplateItemMutation,
  useUpdateTemplateItemMutation,
} from '../../hooks/useMonitoringConfig'
import type {
  MonitorItem,
  MonitorItemInput,
  TemplateDetailResponse,
} from '../../types/zabbix-monitoring.types'
import { ItemEditorModal } from './ItemEditorModal'
import {
  parseItemPreprocessSteps,
  PROTOCOL_LABELS,
  VALUE_TYPE_LABELS,
} from './templateConfigHelpers'

interface TemplateItemsSectionProps {
  template: TemplateDetailResponse
  canControl: boolean
}

function formatItemTarget(item: MonitorItem): string {
  if (item.protocol === 'http') {
    return `${item.http_scheme || 'https'}://设备IP:${item.http_port || 443}${item.http_path || '/'}`
  }
  if (item.protocol === 'tcp_port') return `TCP 端口 ${item.target_expr}`
  if (item.protocol === 'snmp_oid') return item.target_expr || '—'
  if (item.protocol === 'icmp') return 'Ping 往返延迟探测'
  return '系统标准采集器'
}

export function TemplateItemsSection({ template, canControl }: TemplateItemsSectionProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<MonitorItem | null>(null)

  const createItem = useCreateTemplateItemMutation(template.id)
  const updateItem = useUpdateTemplateItemMutation(template.id)
  const deleteItem = useDeleteTemplateItemMutation(template.id)

  const readOnly = template.is_builtin || !canControl
  const items = template.items ?? []

  const handleSave = async (input: MonitorItemInput) => {
    try {
      if (editingItem) {
        await updateItem.mutateAsync({ itemId: editingItem.id, input })
        toast.success('采集指标已更新')
      } else {
        await createItem.mutateAsync(input)
        toast.success('采集指标已创建')
      }
      setModalOpen(false)
      setEditingItem(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存采集指标失败')
    }
  }

  const handleDelete = async (item: MonitorItem) => {
    try {
      await deleteItem.mutateAsync(item.id)
      toast.success(`已删除采集指标「${item.name}」`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除采集指标失败')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">采集指标列表</h3>
          <p className="text-xs text-muted-foreground tabular-nums">
            共 {items.length} 项（单方案上限 50 项，最低采集周期 60 秒）
          </p>
        </div>
        {!readOnly && (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setEditingItem(null)
              setModalOpen(true)
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            新建采集指标
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          暂无采集指标，点击右上角「新建采集指标」添加 SNMP、TCP 或 HTTP 监测项。
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const steps = parseItemPreprocessSteps(item)
            return (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{item.name}</span>
                    <Badge variant="info" size="sm">
                      {PROTOCOL_LABELS[item.protocol] ?? item.protocol}
                    </Badge>
                    <Badge variant={item.enabled ? 'success' : 'neutral'} size="sm">
                      {item.enabled ? '已启用' : '已停用'}
                    </Badge>
                    {steps.length > 0 && (
                      <Badge variant="outline" size="sm" className="tabular-nums">
                        含 {steps.length} 步数据换算
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground tabular-nums">
                    <span className="font-mono">{formatItemTarget(item)}</span>
                    <span>周期 {item.interval_sec} 秒</span>
                    <span>类型：{VALUE_TYPE_LABELS[item.value_type] ?? item.value_type}</span>
                    {item.unit && <span>单位：{item.unit}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingItem(item)
                      setModalOpen(true)
                    }}
                  >
                    {readOnly ? <Eye className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
                    {readOnly ? '查看 / 测试' : '编辑'}
                  </Button>
                  {!readOnly && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`删除采集指标 ${item.name}`}
                      onClick={() => void handleDelete(item)}
                      className="h-8 w-8 text-muted-foreground hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ItemEditorModal
        open={modalOpen}
        editingItem={editingItem}
        readOnly={readOnly}
        submitting={createItem.isPending || updateItem.isPending}
        onClose={() => {
          setModalOpen(false)
          setEditingItem(null)
        }}
        onSubmit={(input) => void handleSave(input)}
      />
    </div>
  )
}
