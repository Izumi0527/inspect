'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { AlertCircle, Radio, RefreshCw, Siren, Trash2, Zap } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CompactStatCard } from '@/components/shared'
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
      syslogProtocol === 'udp' || syslogProtocol === 'tcp' || syslogProtocol === 'both'
        ? syslogProtocol
        : 'both'
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
    syslogAlertsEnabled, syslogAlertsMaxNewPerMinute, syslogEnabled,
    syslogHost, syslogMaxMessageBytes, syslogPort, syslogProtocol,
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
      const resp = await logsSettingsApi.cleanupDeviceLogs({ retentionDays: cleanupRetentionDays })
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

  const syslogStatus = syslogStatusQuery.data
  const syslogStatusText = syslogStatusQuery.isLoading
    ? '状态加载中'
    : syslogStatusQuery.error
      ? '状态获取失败'
      : syslogStatus?.running
        ? '运行中'
        : '已停止'

  const syslogStatusToneClass = syslogStatusQuery.error
    ? 'text-red-700 dark:text-red-300'
    : syslogStatus?.running
      ? 'text-green-700 dark:text-green-300'
      : 'text-foreground'

  const summaryStats = useMemo(
    () => [
      {
        key: 'received',
        title: '接收总量',
        value: syslogStatus?.received ?? 0,
        icon: Radio,
        iconClassName: 'text-blue-600 dark:text-blue-400',
      },
      {
        key: 'stored',
        title: '落库总量',
        value: syslogStatus?.stored ?? 0,
        icon: Zap,
        iconClassName: 'text-green-600 dark:text-green-400',
      },
      {
        key: 'droppedParse',
        title: '解析丢弃',
        value: syslogStatus?.droppedParse ?? 0,
        icon: AlertCircle,
        iconClassName: 'text-amber-600 dark:text-amber-400',
      },
      {
        key: 'alerts',
        title: '告警联动',
        value: (syslogStatus?.alertsCreated ?? 0) + (syslogStatus?.alertsUpdated ?? 0),
        icon: Siren,
        iconClassName: 'text-purple-600 dark:text-purple-400',
      },
    ],
    [syslogStatus]
  )

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
      <section
        aria-label="日志设置概览"
        className="rounded-xl border border-border bg-card/70 p-5 shadow-sm"
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground">日志设置</h2>
            </div>
            <div className="rounded-xl border border-border bg-background/80 px-4 py-3 xl:min-w-[280px]">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                当前运行摘要
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Syslog 接收器</p>
                  <p className={`text-lg font-semibold ${syslogStatusToneClass}`}>{syslogStatusText}</p>
                </div>
                <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                  {syslogStatus?.config.protocol?.toUpperCase() ?? 'BOTH'}
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                最近刷新：{syslogStatus?.updatedAt ?? '暂无数据'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summaryStats.map((stat) => (
              <CompactStatCard
                key={stat.key}
                title={stat.title}
                value={stat.value}
                icon={stat.icon}
                iconClassName={stat.iconClassName}
                className="bg-background/80"
              />
            ))}
          </div>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
        <div className="space-y-4">
          <section
            aria-label="日志保留策略"
            className="rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <SectionHeader
              title="日志保留策略"
              icon={Zap}
              actions={
                <div role="group" aria-label="日志保留策略操作" className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={disableSaveReset}
                    loading={saving}
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    保存更改
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleReset}
                    disabled={disableSaveReset}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    重置更改
                  </Button>
                </div>
              }
            />

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                  超过该天数的设备日志将被清理（范围 1-3650）。
                </p>
              </div>
            </div>
          </section>

          <section
            aria-label="Syslog 接收配置"
            className="rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <SectionHeader
              title="Syslog 接收配置"
              icon={Radio}
              actions={
                <div role="group" aria-label="Syslog 接收配置操作" className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => void handleApplySyslog()}
                    disabled={saving}
                    loading={applySyslogMutation.isPending}
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    保存并应用 Syslog
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void syslogStatusQuery.refetch()}
                    disabled={disableRefresh}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    刷新运行状态
                  </Button>
                </div>
              }
            />

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                <Select
                  value={syslogProtocol}
                  onValueChange={(v) => updateSyslogProtocol(v as SyslogProtocol)}
                >
                  <SelectTrigger id="syslog-protocol" aria-label="Syslog 协议">
                    <SelectValue placeholder="选择协议" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">UDP + TCP</SelectItem>
                    <SelectItem value="udp">仅 UDP</SelectItem>
                    <SelectItem value="tcp">仅 TCP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="syslog-host">监听地址</Label>
                <Input
                  id="syslog-host"
                  value={syslogHost}
                  onChange={(e) => updateSyslogHost(e.target.value)}
                  placeholder="0.0.0.0"
                />
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
                  防止超大报文占用内存，范围 256 到 1MB。
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

              <div className="space-y-2 lg:col-span-2">
                <Label htmlFor="syslog-alerts-rate">每分钟最多新告警数</Label>
                <Input
                  id="syslog-alerts-rate"
                  type="number"
                  min={0}
                  max={10000}
                  value={syslogAlertsMaxNewPerMinute}
                  onChange={(e) => updateSyslogAlertsMaxNewPerMinute(Number(e.target.value))}
                  className="max-w-xs"
                />
                <p className="text-xs text-muted-foreground">
                  0 表示不限制。超过限制会创建或更新告警风暴告警。
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section
            aria-label="运行状态"
            className="rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <SectionHeader
              title="运行状态"
              icon={Radio}
            />

            <div className="mt-6 space-y-4 text-sm">
              <div className="rounded-lg border border-border/60 bg-background/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">接收器状态</p>
                    <p className={`mt-1 text-lg font-semibold ${syslogStatusToneClass}`}>{syslogStatusText}</p>
                  </div>
                  <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                    {syslogStatus?.config.protocol?.toUpperCase() ?? 'BOTH'}
                  </span>
                </div>
                <dl className="mt-4 space-y-2 text-muted-foreground">
                  <div className="flex items-center justify-between gap-3">
                    <dt>监听地址</dt>
                    <dd className="font-mono text-foreground">{syslogStatus?.config.host ?? syslogHost}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>监听端口</dt>
                    <dd className="font-mono text-foreground">{syslogStatus?.config.port ?? syslogPort}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>刷新策略</dt>
                    <dd className="text-foreground">运行中每 5 秒自动刷新</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>最近刷新</dt>
                    <dd className="text-foreground">{syslogStatus?.updatedAt ?? '暂无数据'}</dd>
                  </div>
                </dl>
              </div>

              {syslogStatusQuery.error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
                  Syslog 状态获取失败：{(syslogStatusQuery.error as Error).message || '未知错误'}
                </div>
              ) : null}
            </div>
          </section>

          <section
            aria-label="实时统计"
            className="rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <SectionHeader
              title="实时统计"
              icon={Zap}
            />

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border p-4">
                <div className="text-xs text-muted-foreground">接收与落库</div>
                <div className="mt-3 space-y-2 text-sm text-foreground">
                  <div className="flex items-center justify-between gap-3">
                    <span>接收</span>
                    <span className="font-mono">{syslogStatus?.received ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>落库</span>
                    <span className="font-mono">{syslogStatus?.stored ?? 0}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4">
                <div className="text-xs text-muted-foreground">丢弃情况</div>
                <div className="mt-3 space-y-2 text-sm text-foreground">
                  <div className="flex items-center justify-between gap-3">
                    <span>未匹配</span>
                    <span className="font-mono">{syslogStatus?.droppedUnmatched ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>解析失败</span>
                    <span className="font-mono">{syslogStatus?.droppedParse ?? 0}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4 sm:col-span-2">
                <div className="text-xs text-muted-foreground">告警联动</div>
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-foreground sm:grid-cols-3">
                  <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
                    <span>新建</span>
                    <span className="font-mono">{syslogStatus?.alertsCreated ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
                    <span>去重更新</span>
                    <span className="font-mono">{syslogStatus?.alertsUpdated ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
                    <span>限流抑制</span>
                    <span className="font-mono">{syslogStatus?.alertsRateLimited ?? 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            aria-label="最近错误"
            className="rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <SectionHeader
              title="最近错误"
              icon={AlertCircle}
            />

            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
              {syslogStatus?.lastError && syslogStatus.lastError.trim() !== ''
                ? `最近错误：${syslogStatus.lastError}`
                : '当前未记录新的接收器错误。'}
            </div>
          </section>
        </div>
      </div>

      <section
        aria-label="手动清理日志"
        className="mt-4 rounded-xl border border-red-200/70 bg-red-50/70 p-5 shadow-sm dark:border-red-900/50 dark:bg-red-950/10"
      >
        <SectionHeader
          title="手动清理日志"
          icon={Trash2}
          actions={
            <Button
              type="button"
              variant="destructive"
              onClick={handleRequestCleanup}
              disabled={disableCleanup}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              立即清理设备日志
            </Button>
          }
        />

        <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="rounded-lg border border-red-200/80 bg-background/80 p-4 text-sm text-muted-foreground dark:border-red-900/50">
            <p className="font-medium text-foreground">清理将按当前页面中的保留天数执行</p>
            <p className="mt-2">
              当前执行范围：清理超过 <span className="font-mono text-foreground">{cleanupRetentionDays}</span> 天的设备日志。该操作不可恢复。
            </p>
          </div>
        </div>
      </section>

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
