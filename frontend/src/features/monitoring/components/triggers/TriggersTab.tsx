'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { BellRing, Edit3, ExternalLink, Lock, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Badge, Button, Card, CardContent } from '@/components/atoms'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { DEVICE_GROUPS_QUERY_KEY, getDeviceGroups } from '@/features/devices/api/devices.api'
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
import {
  formatDurationCN,
  formatTriggerNaturalSummary,
  resolveMetricMeta,
  SEVERITY_META,
} from './triggerHelpers'

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
  const canConfigNotifications = usePermission(Permission.SYSTEM_CONFIG)

  const [severityFilter, setSeverityFilter] = useState<string>('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<TriggerRule | null>(null)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmDeleteRule, setConfirmDeleteRule] = useState<TriggerRule | null>(null)

  const v2Query = useMonitoringV2({ enablePolling: false })
  const channels =
    notificationChannelSummary ?? v2Query.data?.data.notificationChannelSummary ?? []

  const { data: groups = [] } = useQuery({
    queryKey: DEVICE_GROUPS_QUERY_KEY,
    queryFn: getDeviceGroups,
    enabled: canRead,
    staleTime: 60_000,
  })

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
    const ruleId = Number(rule.id)
    if (togglingId === ruleId) return
    setTogglingId(ruleId)
    try {
      await toggleTrigger.mutateAsync(ruleId)
      toast.success(`已${rule.is_active ? '停用' : '启用'}规则「${rule.name}」`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '切换规则状态失败')
    } finally {
      setTogglingId(null)
    }
  }

  const handleConfirmDelete = async () => {
    if (!confirmDeleteRule) return
    const rule = confirmDeleteRule
    const ruleId = Number(rule.id)
    if (deletingId === ruleId) return
    setDeletingId(ruleId)
    try {
      await deleteTrigger.mutateAsync(ruleId)
      toast.success(`已删除规则「${rule.name}」`)
      setConfirmDeleteRule(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除规则失败')
    } finally {
      setDeletingId(null)
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
        {canConfigNotifications && (
          <Link
            href="/settings?tab=notifications"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            配置通知渠道
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
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
                const ruleId = Number(rule.id)
                const sev = SEVERITY_META[rule.severity.toLowerCase()] ?? {
                  label: rule.severity,
                  badgeVariant: 'info' as const,
                }
                const badges = getRuleModeBadges(rule)
                const metricMeta = resolveMetricMeta(rule.metric_name)
                const cooldownMinutes =
                  typeof rule.cooldown_minutes === 'number' && Number.isFinite(rule.cooldown_minutes)
                    ? rule.cooldown_minutes
                    : 15
                const emailEnabled = Boolean(rule.email_enabled ?? rule.notify_email)
                const webhookEnabled = Boolean(rule.webhook_enabled)

                const groupNames = (rule.device_groups ?? []).map(
                  (gid) => groups.find((g) => g.id === gid)?.name ?? `分组 #${gid}`
                )
                const specificCount = rule.specific_devices?.length ?? 0
                const scopeParts: string[] = []
                if (groupNames.length > 0) {
                  scopeParts.push(`分组: ${groupNames.join('、')}`)
                }
                if (specificCount > 0) {
                  scopeParts.push(`指定设备 ${specificCount} 台`)
                }
                const scopeSummary = scopeParts.length > 0 ? scopeParts.join(' · ') : '适用范围：全部设备'

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
                        <Badge variant="secondary" size="sm">
                          {metricMeta.label}
                        </Badge>
                        {badges.map((tag) => (
                          <Badge key={tag} variant="outline" size="sm">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-foreground">{formatTriggerNaturalSummary(rule)}</p>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge variant="outline" size="sm">
                          {`冷却 ${cooldownMinutes} 分钟`}
                        </Badge>
                        {emailEnabled && (
                          <Badge variant="info" size="sm">
                            邮件告警
                          </Badge>
                        )}
                        {webhookEnabled && (
                          <Badge variant="info" size="sm">
                            Webhook 告警
                          </Badge>
                        )}
                        <span>{scopeSummary}</span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Switch
                        aria-label={`启停规则 ${rule.name}`}
                        disabled={!canUpdate || togglingId === ruleId}
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
                          disabled={deletingId === ruleId}
                          onClick={() => setConfirmDeleteRule(rule)}
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

      <Dialog
        open={confirmDeleteRule !== null}
        onOpenChange={(open) => {
          if (!open && deletingId === null) setConfirmDeleteRule(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除告警规则</DialogTitle>
            <DialogDescription>
              {confirmDeleteRule
                ? `确定删除告警规则「${confirmDeleteRule.name}」？删除后将停止该规则的告警评估。`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deletingId !== null}
              onClick={() => setConfirmDeleteRule(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={deletingId !== null}
              disabled={deletingId !== null}
              onClick={() => void handleConfirmDelete()}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
