'use client'

import { useEffect, useState } from 'react'
import { Copy, Edit3, Lock, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Badge, Button, Card, CardContent } from '@/components/atoms'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'
import {
  useCloneMonitoringTemplateMutation,
  useCreateMonitoringTemplateMutation,
  useDeleteMonitoringTemplateMutation,
  useMonitoringTemplate,
  useMonitoringTemplates,
  useUpdateMonitoringTemplateMutation,
} from '../../hooks/useMonitoringConfig'
import type { CreateTemplateInput, TemplateDetailResponse } from '../../types/zabbix-monitoring.types'
import { AutoDiscoveryPanel } from './AutoDiscoveryPanel'
import { TemplateFormModal } from './TemplateFormModal'
import { TemplateItemsSection } from './TemplateItemsSection'
import { ThresholdScopePanel } from './ThresholdScopePanel'

type SubTabKey = 'items' | 'lld' | 'scope'

const SUB_TABS: ReadonlyArray<{ key: SubTabKey; label: string }> = [
  { key: 'items', label: '采集指标' },
  { key: 'lld', label: '端口与硬件自动识别' },
  { key: 'scope', label: '阈值参数与生效范围' },
]

export function TemplatesTab() {
  const canControl = usePermission(Permission.MONITORING_CONTROL)
  const { data: templates = [], isLoading, error } = useMonitoringTemplates()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [subTab, setSubTab] = useState<SubTabKey>('items')
  const [formOpen, setFormOpen] = useState(false)
  const [editingTpl, setEditingTpl] = useState<TemplateDetailResponse | null>(null)

  useEffect(() => {
    if (templates.length === 0) return
    if (selectedId === null || !templates.some((t) => t.id === selectedId)) {
      setSelectedId(templates[0].id)
    }
  }, [templates, selectedId])

  const detailQuery = useMonitoringTemplate(selectedId)
  const activeTemplate =
    detailQuery.data ?? templates.find((t) => t.id === selectedId) ?? templates[0] ?? null

  const createTpl = useCreateMonitoringTemplateMutation()
  const updateTpl = useUpdateMonitoringTemplateMutation()
  const deleteTpl = useDeleteMonitoringTemplateMutation()
  const cloneTpl = useCloneMonitoringTemplateMutation()

  const handleClone = async () => {
    if (!activeTemplate || !canControl) return
    try {
      const cloned = await cloneTpl.mutateAsync({ id: activeTemplate.id })
      setSelectedId(cloned.id)
      toast.success(`已克隆为自定义方案「${cloned.name}」`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '克隆监控方案失败')
    }
  }

  const handleDelete = async () => {
    if (!activeTemplate || activeTemplate.is_builtin || !canControl) return
    try {
      await deleteTpl.mutateAsync(activeTemplate.id)
      setSelectedId(null)
      toast.success(`已删除监控方案「${activeTemplate.name}」`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除监控方案失败')
    }
  }

  const handleSaveTemplate = async (values: CreateTemplateInput) => {
    try {
      if (editingTpl) {
        await updateTpl.mutateAsync({ id: editingTpl.id, input: values })
        toast.success('已保存自定义监控方案')
      } else {
        const created = await createTpl.mutateAsync(values)
        setSelectedId(created.id)
        toast.success('已创建自定义监控方案')
      }
      setFormOpen(false)
      setEditingTpl(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存监控方案失败')
    }
  }

  if (isLoading) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">正在加载监控方案工作台...</Card>
    )
  }

  if (error) {
    return (
      <Card className="border-danger/40 bg-danger-soft p-6 text-sm text-danger-soft-foreground">
        加载监控方案失败：{error.message}
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <Card className="lg:col-span-4 xl:col-span-3">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">方案库</h2>
            {canControl && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setEditingTpl(null)
                  setFormOpen(true)
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                新建方案
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {templates.map((tpl) => {
              const selected = activeTemplate?.id === tpl.id
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => setSelectedId(tpl.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selected
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-surface-2/40 hover:bg-accent'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{tpl.name}</span>
                    <Badge variant={tpl.is_builtin ? 'info' : 'secondary'} size="sm">
                      {tpl.is_builtin ? '系统预置' : '自定义'}
                    </Badge>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                    <span>
                      {(tpl.items ?? []).length} 项指标
                    </span>
                    <span>
                      绑定 {(tpl.bound_group_ids ?? []).length} 组 · {(tpl.bound_device_ids ?? []).length} 台
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-8 xl:col-span-9">
        <CardContent className="space-y-4 p-4">
          {!activeTemplate ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              暂无可用监控方案，请先新建自定义方案。
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">{activeTemplate.name}</h2>
                    <Badge variant={activeTemplate.is_builtin ? 'info' : 'secondary'} size="sm">
                      {activeTemplate.is_builtin ? '系统预置方案' : '自定义方案'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {activeTemplate.description || '统一纳管采集指标、端口自动识别策略与默认告警阈值。'}
                  </p>
                </div>

                {canControl && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      loading={cloneTpl.isPending}
                      onClick={() => void handleClone()}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      克隆为自定义方案
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={activeTemplate.is_builtin}
                      onClick={() => {
                        setEditingTpl(activeTemplate)
                        setFormOpen(true)
                      }}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      编辑
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={activeTemplate.is_builtin || deleteTpl.isPending}
                      onClick={() => void handleDelete()}
                      className="text-danger hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </Button>
                  </div>
                )}
              </div>

              {activeTemplate.is_builtin && (
                <div className="flex items-center gap-2 rounded-lg border border-info/30 bg-info-soft px-3 py-2 text-xs text-info-soft-foreground">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span>
                    内置系统预置方案不允许直接修改或删除。如需调整指标或规则，请点击右上角「克隆为自定义方案」；或直接在「阈值参数与生效范围」中按设备组生效与单台微调。
                  </span>
                </div>
              )}

              {!canControl && (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted-foreground">
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  <span>当前账号为只读视角，修改方案配置需要监控管控权限。</span>
                </div>
              )}

              <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface-2/70 p-1">
                {SUB_TABS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    aria-selected={subTab === item.key}
                    onClick={() => setSubTab(item.key)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      subTab === item.key
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {subTab === 'items' && (
                <TemplateItemsSection template={activeTemplate} canControl={canControl} />
              )}
              {subTab === 'lld' && (
                <AutoDiscoveryPanel template={activeTemplate} canControl={canControl} />
              )}
              {subTab === 'scope' && (
                <ThresholdScopePanel template={activeTemplate} canControl={canControl} />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <TemplateFormModal
        open={formOpen}
        editingTemplate={editingTpl}
        submitting={createTpl.isPending || updateTpl.isPending}
        onClose={() => {
          setFormOpen(false)
          setEditingTpl(null)
        }}
        onSubmit={(values) => void handleSaveTemplate(values)}
      />
    </div>
  )
}
