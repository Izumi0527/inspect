'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { AlertCircle, RefreshCw, Trash2, Zap } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { SyslogProtocol, SyslogSettings } from '@/features/settings/api/logs.api'
import { logsSettingsApi } from '@/features/settings/api/logs.api'
import { SectionHeader } from '@/features/settings/components/shared/SectionHeader'
import { useLogsSettings } from '@/features/settings/hooks/useLogsSettings'
import { useSettingsTabCapabilities } from '@/features/settings/hooks/useSettingsTabCapabilities'
import { SettingsConfirmDialog } from '@/features/settings/shell/SettingsConfirmDialog'

export const LogsSettings: React.FC = () => {
  const queryClient = useQueryClient()
  const {
    retentionDays,
    autoCleanupEnabled,
    syslogEnabled,
    syslogProtocol,
    syslogHost,
    syslogPort,
    syslogMaxMessageBytes,
    syslogAlertsEnabled,
    syslogAlertsMaxNewPerMinute,
    isLoading,
    isSaving,
    isDirty,
    error,
    updateRetentionDays,
    updateAutoCleanupEnabled,
    updateSyslogEnabled,
    updateSyslogProtocol,
    updateSyslogHost,
    updateSyslogPort,
    updateSyslogMaxMessageBytes,
    updateSyslogAlertsEnabled,
    updateSyslogAlertsMaxNewPerMinute,
    saveAll,
    resetAll,
  } = useLogsSettings()

  const normalizeRetentionDays = useCallback((value: number) => {
    const raw = Number.isFinite(value) ? value : 90
    const floored = Math.floor(raw)
    if (floored < 1) return 1
    if (floored > 3650) return 3650
    return floored
  }, [])

  const normalizeSyslog = useCallback((): SyslogSettings => {
    const protocol: SyslogProtocol =
      syslogProtocol === 'udp' || syslogProtocol === 'tcp' || syslogProtocol === 'both' ? syslogProtocol : 'both'

    const host = (syslogHost || '').trim() || '0.0.0.0'

    const rawPort = Number.isFinite(syslogPort) ? syslogPort : 5514
    const port = Math.min(65535, Math.max(1, Math.floor(rawPort)))

    const rawMaxBytes = Number.isFinite(syslogMaxMessageBytes) ? syslogMaxMessageBytes : 8192
    const maxMessageBytes = Math.min(1024 * 1024, Math.max(256, Math.floor(rawMaxBytes)))

    const rawMaxNew = Number.isFinite(syslogAlertsMaxNewPerMinute) ? syslogAlertsMaxNewPerMinute : 30
    const alertsMaxNewPerMinute = Math.min(10000, Math.max(0, Math.floor(rawMaxNew)))

    return {
      enabled: Boolean(syslogEnabled),
      protocol,
      host,
      port,
      maxMessageBytes,
      alertsEnabled: Boolean(syslogAlertsEnabled),
      alertsMaxNewPerMinute,
    }
  }, [
    syslogAlertsEnabled,
    syslogAlertsMaxNewPerMinute,
    syslogEnabled,
    syslogHost,
    syslogMaxMessageBytes,
    syslogPort,
    syslogProtocol,
  ])

  const syslogStatusQuery = useQuery({
    queryKey: ['syslogStatus'],
    queryFn: logsSettingsApi.getSyslogStatus,
    staleTime: 5 * 1000,
    retry: 1,
    refetchInterval: (q) => (q.state.data?.running ? 5000 : false),
  })

  const applySyslogMutation = useMutation({
    mutationFn: logsSettingsApi.applySyslogConfig,
    onSuccess: (status) => {
      queryClient.setQueryData(['syslogStatus'], status)
    },
  })

  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false)
  const [cleanupPending, setCleanupPending] = useState(false)

  const cleanupRetentionDays = useMemo(
    () => normalizeRetentionDays(retentionDays),
    [normalizeRetentionDays, retentionDays]
  )

  const handleSave = useCallback(async () => {
    try {
      const normalizedRetention = normalizeRetentionDays(retentionDays)
      const normalizedSyslog = normalizeSyslog()
      await saveAll({ retentionDays: normalizedRetention, syslog: normalizedSyslog })
      toast.success('保存成功！日志设置已更新')
    } catch (err) {
      toast.error('保存失败：' + (err as Error).message)
    }
  }, [normalizeRetentionDays, normalizeSyslog, retentionDays, saveAll])

  const handleReset = useCallback(() => {
    resetAll()
    toast.success('已重置为服务器配置')
  }, [resetAll])

  const handleRequestCleanup = useCallback(() => {
    setCleanupDialogOpen(true)
  }, [])

  const handleConfirmCleanup = useCallback(async () => {
    setCleanupPending(true)
    try {
      const resp = await logsSettingsApi.cleanupDeviceLogs({
        retentionDays: cleanupRetentionDays,
      })
      toast.success(`已清理 ${resp.deletedCount} 条设备日志`)
      setCleanupDialogOpen(false)
    } catch (err) {
      toast.error('清理失败：' + (err as Error).message)
    } finally {
      setCleanupPending(false)
    }
  }, [cleanupRetentionDays])

  const handleApplySyslog = useCallback(async () => {
    try {
      const normalizedRetention = normalizeRetentionDays(retentionDays)
      const normalizedSyslog = normalizeSyslog()

      // apply 接口从服务端 settings 读取，所以这里先保存再应用，确保即时生效。
      await saveAll({ retentionDays: normalizedRetention, syslog: normalizedSyslog })
      const status = await applySyslogMutation.mutateAsync()
      queryClient.setQueryData(['syslogStatus'], status)
      toast.success('Syslog 配置已应用')
    } catch (err) {
      toast.error('应用失败：' + (err as Error).message)
    }
  }, [applySyslogMutation, normalizeRetentionDays, normalizeSyslog, queryClient, retentionDays, saveAll])

  const saving = Boolean(isSaving || applySyslogMutation.isPending || cleanupPending)
  const disableSaveReset = Boolean(!isDirty || saving)
  const disableRefresh = Boolean(syslogStatusQuery.isFetching || applySyslogMutation.isPending)
  const disableCleanup = Boolean(saving)

  useSettingsTabCapabilities('logs', {
    dirty: isDirty,
    saving,
    blockLeave: Boolean(isDirty),
  })

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 flex items-start space-x-4">
          <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">
              加载日志设置失败
            </h3>
            <p className="text-sm text-red-700 dark:text-red-300">
              {(error as Error).message || '无法连接到服务器，请检查网络连接或稍后重试'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
          <section className="py-6">
            <SectionHeader
              title="数据保留"
              description="配置设备日志的自动清理策略。该配置将影响系统定时数据清理任务中的日志清理行为。"
              icon={Zap}
              actions={
                <div
                  role="group"
                  aria-label="数据保留操作"
                  className="flex flex-wrap items-center gap-2"
                >
                  <Button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={disableSaveReset}
                    loading={saving}
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    保存
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleApplySyslog()}
                    disabled={saving}
                    loading={applySyslogMutation.isPending}
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    应用配置
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleReset}
                    disabled={disableSaveReset}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    重置
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void syslogStatusQuery.refetch()}
                    disabled={disableRefresh}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    刷新状态
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleRequestCleanup}
                    disabled={disableCleanup}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    立即清理
                  </Button>
                </div>
              }
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="logs-auto-cleanup">启用自动清理</Label>
                  <Switch
                    id="logs-auto-cleanup"
                    checked={autoCleanupEnabled}
                    onCheckedChange={(value) => updateAutoCleanupEnabled(Boolean(value))}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  关闭后系统不会自动清理历史设备日志。
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="logs-retention-days">设备日志保留天数</Label>
                <Input
                  id="logs-retention-days"
                  type="number"
                  min={1}
                  max={3650}
                  value={retentionDays}
                  onChange={(e) => updateRetentionDays(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  超过该天数的设备日志将被清理。范围 1 到 3650。
                </p>
              </div>
            </div>
          </section>

          <section className="py-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Syslog 接收</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  开启后后端将监听设备 Syslog 上报（UDP/TCP），并写入日志中心。日志级别为 warning/error/critical 时可联动生成告警。
                </p>
              </div>
              <div className="text-sm text-muted-foreground whitespace-nowrap">
                {syslogStatusQuery.isLoading ? (
                  '状态加载中...'
                ) : syslogStatusQuery.data ? (
                  syslogStatusQuery.data.running ? (
                    <span className="text-green-700 dark:text-green-400 font-medium">运行中</span>
                  ) : (
                    <span className="text-foreground/90 font-medium">已停止</span>
                  )
                ) : (
                  <span className="text-muted-foreground">未获取</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="syslog-enabled">启用 Syslog 接收</Label>
                  <Switch
                    id="syslog-enabled"
                    checked={syslogEnabled}
                    onCheckedChange={(value) => updateSyslogEnabled(Boolean(value))}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  监听地址默认为 <span className="font-mono">{syslogHost}:{syslogPort}</span>，端口默认 5514。
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="syslog-protocol">协议</Label>
                <Select value={syslogProtocol} onValueChange={(v) => updateSyslogProtocol(v as SyslogProtocol)}>
                  <SelectTrigger id="syslog-protocol">
                    <SelectValue placeholder="选择协议" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">UDP + TCP</SelectItem>
                    <SelectItem value="udp">仅 UDP</SelectItem>
                    <SelectItem value="tcp">仅 TCP</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  建议默认使用 UDP + TCP，兼容更多设备。
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="syslog-host">监听地址</Label>
                <Input
                  id="syslog-host"
                  value={syslogHost}
                  onChange={(e) => updateSyslogHost(e.target.value)}
                  placeholder="0.0.0.0"
                />
                <p className="text-xs text-muted-foreground">
                  一般保持 <span className="font-mono">0.0.0.0</span> 监听所有网卡。
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="syslog-port">端口</Label>
                <Input
                  id="syslog-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={syslogPort}
                  onChange={(e) => updateSyslogPort(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  默认端口 5514（避免与 514 冲突及权限问题）。
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="syslog-max-bytes">单条消息最大字节数</Label>
                <Input
                  id="syslog-max-bytes"
                  type="number"
                  min={256}
                  max={1024 * 1024}
                  value={syslogMaxMessageBytes}
                  onChange={(e) => updateSyslogMaxMessageBytes(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  用于防止超大报文占用内存，范围 256 到 1MB。
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="syslog-alerts-enabled">联动告警</Label>
                  <Switch
                    id="syslog-alerts-enabled"
                    checked={syslogAlertsEnabled}
                    onCheckedChange={(value) => updateSyslogAlertsEnabled(Boolean(value))}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  warning/error/critical 将触发告警（带去重与风暴保护）。
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="syslog-alerts-rate">每分钟最多新告警数</Label>
                <Input
                  id="syslog-alerts-rate"
                  type="number"
                  min={0}
                  max={10000}
                  value={syslogAlertsMaxNewPerMinute}
                  onChange={(e) => updateSyslogAlertsMaxNewPerMinute(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  0 表示不限制。超过限制会创建/更新“告警风暴”告警。
                </p>
              </div>
            </div>

            <p className="mt-6 text-sm text-muted-foreground">配置保存/应用/状态刷新等操作已调整到“数据保留”标题右侧按钮区。</p>

            {syslogStatusQuery.error && (
              <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-sm text-red-700 dark:text-red-300">
                Syslog 状态获取失败：{(syslogStatusQuery.error as Error).message || '未知错误'}
              </div>
            )}

            {syslogStatusQuery.data && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl">
                <div className="rounded-lg border border-border p-4">
                  <div className="text-xs text-muted-foreground">接收 / 落库</div>
                  <div className="mt-2 text-sm text-foreground">
                    接收：<span className="font-mono">{syslogStatusQuery.data.received}</span>
                    <br />
                    落库：<span className="font-mono">{syslogStatusQuery.data.stored}</span>
                  </div>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <div className="text-xs text-muted-foreground">丢弃</div>
                  <div className="mt-2 text-sm text-foreground">
                    未匹配设备：<span className="font-mono">{syslogStatusQuery.data.droppedUnmatched}</span>
                    <br />
                    解析丢弃：<span className="font-mono">{syslogStatusQuery.data.droppedParse}</span>
                  </div>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <div className="text-xs text-muted-foreground">告警联动</div>
                  <div className="mt-2 text-sm text-foreground">
                    新建：<span className="font-mono">{syslogStatusQuery.data.alertsCreated}</span>
                    <br />
                    去重更新：<span className="font-mono">{syslogStatusQuery.data.alertsUpdated}</span>
                    <br />
                    限流：<span className="font-mono">{syslogStatusQuery.data.alertsRateLimited}</span>
                  </div>
                </div>
                {syslogStatusQuery.data.lastError && syslogStatusQuery.data.lastError.trim() !== '' && (
                  <div className="md:col-span-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-sm text-amber-800 dark:text-amber-200">
                    最近错误：{syslogStatusQuery.data.lastError}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="py-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-foreground">手动清理</h3>
              <p className="text-sm text-muted-foreground mt-1">
                可立即清理超过保留天数的设备日志，用于空间回收或应急处理。
              </p>
            </div>

            <p className="text-sm text-muted-foreground">
              当前保留天数为 <span className="font-mono">{cleanupRetentionDays}</span>。请使用“数据保留”标题右侧按钮区中的{' '}
              <span className="font-medium text-foreground">“立即清理”</span> 操作。
            </p>
          </section>
        </div>

      <SettingsConfirmDialog
        open={cleanupDialogOpen}
        onOpenChange={setCleanupDialogOpen}
        tone="danger"
        title="确认立即清理设备日志？"
        description={`将清理超过 ${cleanupRetentionDays} 天的设备日志，此操作不可恢复。`}
        confirmText="继续清理"
        cancelText="取消"
        confirmLoading={cleanupPending}
        onConfirm={() => void handleConfirmCleanup()}
      />
    </div>
  )
}
