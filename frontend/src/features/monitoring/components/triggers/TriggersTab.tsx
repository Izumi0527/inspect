'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BellRing, Edit3, ExternalLink, Lock, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Badge, Button, Card, CardContent } from '@/components/atoms'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'
import {
  useCreateMonitoringTriggerMutation,
  useDeleteMonitoringTriggerMutation,
  useMonitoringTriggers,
  useToggleMonitoringTriggerMutation,
  useUpdateMonitoringTriggerMutation,
} from '../../hooks/useMonitoringConfig'
import { useMonitoringV2 } from '../../hooks/useMonitoringV2'
import type {
  NotificationChannelReadiness,
  TriggerRule,
  TriggerRuleInput,
} from '../../types/zabbix-monitoring.types'
import { TriggerEditorDrawer } from './TriggerEditorDrawer'
import { formatDurationCN, formatTriggerNaturalSummary, SEVERITY_META } from './triggerHelpers'

export interface TriggersTabProps {
  notificationChannelSummary?: NotificationChannelReadiness[]
}

const CHANNEL_LABELS: Record<string, string> = {
  email: '邮件通知',
  webhook: 'Webhook 推送',
  websocket: '站内实时推送',
  sms: '短信通道',
}

function getRuleModeBadges(rule: TriggerRule): string[] {
  const tags: string[] = []
  if (rule.duration > 0) tags.push(`防误报持续 ${formatDurationCN(rule.duration)}`)
  if (rule.expression_mode === 'hysteresis') tags.push('防抖动恢复')
  if (rule.expression_mode === 'nodata') tags.push('断流检测')
  if (rule.expression_mode === 'uptime_drop') tags.push('异常重启')
  if (rule.expression_mode === 'if_flap') tags.push('端口闪断')
  if (rule.dependency_mode && rule.dependency_mode !== 'none') tags.push('上级断网防风暴')
  return tags
}

export function TriggersTab({ notificationChannelSummary }: TriggersTabProps = {}) {
  const canRead = usePermission(Permission.ALERTS_READ)
  const canCreate = usePermission(Permission.ALERTS_CREATE)
  const canUpdate = usePermission(Permission.ALERTS_UPDATE)
  const canDelete = usePermission(Permission.ALERTS_DELETE)

  const [severityFilter, setSeverityFilter] = useState<string>('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<TriggerRule | null>(null)

  const v2Query = useMonitoringV2({ enablePolling: false })
  const channels =
    notificationChannelSummary ?? v2Query.data?.data.notificationChannelSummary ?? []

  const triggersQuery = useMonitoringTriggers(
    severityFilter ? { severity: severityFilter } : undefined,
    canRead
  )
  const createTrigger = useCreateMonitoringTriggerMutation()
  const updateTrigger = useUpdateMonitoringTriggerMutation()
  const deleteTrigger = useDeleteMonitoringTriggerMutation()
  const toggleTrigger = useToggleMonitoringTriggerMutation()

  const handleSave = async (input: TriggerRuleInput) => {
    try {
      if (editingRule) {
        await updateTrigger.mutateAsync({ id: Number(editingRule.id), input })
        toast.success('告警规则已更新')
      } else {
        await createTrigger.mutateAsync(input)
        toast.success('告警规则已创建')
      }
      setDrawerOpen(false)
      setEditingRule(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存告警规则失败')
    }
  }

  const handleToggle = async (rule: TriggerRule) => {
    try {
      await toggleTrigger.mutateAsync(Number(rule.id))
      toast.success(`已${rule.is_active ? '停用' : '启用'}规则「${rule.name}」`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '切换规则状态失败')
    }
  }

  const handleDelete = async (rule: TriggerRule) => {
    try {
      await deleteTrigger.mutateAsync(Number(rule.id))
      toast.success(`已删除规则「${rule.name}」`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除规则失败')
    }
  }

  if (!canRead) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4 text-warning" />
          <span>当前账号缺少告警规则查看权限，已安全隐藏规则列表。</span>
        </div>
      </Card>
    )
  }

  const rules = triggersQuery.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 font-semibold text-foreground">
            <BellRing className="h-4 w-4 text-primary" />
            通知渠道就绪状态：
          </span>
          {channels.length === 0 ? (
            <span className="text-muted-foreground">暂无通知渠道配置</span>
          ) : (
            channels.map((ch) => {
              const ready = ch.enabled && ch.configured
              return (
                <Badge key={ch.channel} variant={ready ? 'success' : 'neutral'} size="sm">
                  {CHANNEL_LABELS[ch.channel] ?? ch.channel} ·{' '}
                  {ready ? '已启用' : ch.configured ? '未启用' : '未配置'}
                </Badge>
              )
            })
          )}
        </div>
        <Link
          href="/settings?tab=notifications"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          配置通知渠道
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-warning" />
              <h2 className="text-sm font-semibold text-foreground">告警规则列表</h2>
              <Select
                value={severityFilter || 'all'}
                onValueChange={(val) => setSeverityFilter(val === 'all' ? '' : val)}
              >
                <SelectTrigger aria-label="按告警级别筛选" className="h-9 w-auto gap-2 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部级别</SelectItem>
                  <SelectItem value="critical">严重告警</SelectItem>
                  <SelectItem value="warning">警告告警</SelectItem>
                  <SelectItem value="info">提示告警</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {canCreate && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setEditingRule(null)
                  setDrawerOpen(true)
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                新建告警规则
              </Button>
            )}
          </div>

          {triggersQuery.isLoading ? (
            <p className="py-6 text-center text-xs text-muted-foreground">正在加载告警规则...</p>
          ) : rules.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
              暂无告警规则，点击右上角「新建告警规则」快速创建。
            </div>
          ) : (
            <div className="space-y-2.5">
              {rules.map((rule) => {
                const sev = SEVERITY_META[rule.severity.toLowerCase()] ?? {
                  label: rule.severity,
                  badgeVariant: 'info' as const,
                }
                const badges = getRuleModeBadges(rule)
                return (
                  <div
                    key={rule.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-surface-2/40 p-3.5"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={sev.badgeVariant} size="sm">
                          {sev.label}
                        </Badge>
                        <span className="text-sm font-semibold text-foreground">{rule.name}</span>
                        {badges.map((tag) => (
                          <Badge key={tag} variant="outline" size="sm">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-foreground">{formatTriggerNaturalSummary(rule)}</p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Switch
                        aria-label={`启停规则 ${rule.name}`}
                        disabled={!canUpdate}
                        checked={rule.is_active}
                        onCheckedChange={() => void handleToggle(rule)}
                      />
                      {canUpdate && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingRule(rule)
                            setDrawerOpen(true)
                          }}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          编辑
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`删除规则 ${rule.name}`}
                          onClick={() => void handleDelete(rule)}
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
        </CardContent>
      </Card>

      <TriggerEditorDrawer
        open={drawerOpen}
        editingRule={editingRule}
        submitting={createTrigger.isPending || updateTrigger.isPending}
        onClose={() => {
          setDrawerOpen(false)
          setEditingRule(null)
        }}
        onSubmit={(input) => void handleSave(input)}
      />
    </div>
  )
}
