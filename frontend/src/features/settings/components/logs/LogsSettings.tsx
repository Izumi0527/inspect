'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { AlertCircle, Radio, RefreshCw, Trash2, Zap } from 'lucide-react'
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
import { formatDateTimeYMDHMS } from '@/utils/formatters'

export const LogsSettings: React.FC = () => {
  const queryClient = useQueryClient()
  const {
    retentionDays,
    autoCleanupEnabled,
    pollingIntervalMinutes,
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
    updatePollingIntervalMinutes,
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

  // 区间与后端 generalNumericConstraints["logs.polling.interval_minutes"] 保持同步
  const normalizePollingInterval = useCallback((value: number) => {
    const raw = Number.isFinite(value) ? value : 15
    const floored = Math.floor(raw)
    if (floored < 1) return 1
    if (floored > 1440) return 1440
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
      await saveAll({
        retentionDays: normalizedRetention,
        pollingIntervalMinutes: normalizePollingInterval(pollingIntervalMinutes),
        syslog: normalizedSyslog,
      })
      toast.success('保存成功！日志设置已更新')
    } catch (err) {
      toast.error('保存失败：' + (err as Error).message)
    }
  }, [normalizePollingInterval, normalizeRetentionDays, normalizeSyslog, pollingIntervalMinutes, retentionDays, saveAll])

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
      await saveAll({
        retentionDays: normalizedRetention,
        pollingIntervalMinutes: normalizePollingInterval(pollingIntervalMinutes),
        syslog: normalizedSyslog,
      })
      const status = await applySyslogMutation.mutateAsync()
      queryClient.setQueryData(['syslogStatus'], status)
      toast.success('Syslog 配置已应用')
    } catch (err) {
      toast.error('应用失败：' + (err as Error).message)
    }
  }, [
    applySyslogMutation,
    normalizePollingInterval,
    normalizeRetentionDays,
    normalizeSyslog,
    pollingIntervalMinutes,
    queryClient,
    retentionDays,
    saveAll,
  ])

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
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
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

              <div className="space-y-2">
                <Label htmlFor="logs-polling-interval">设备日志轮询间隔（分钟）</Label>
                <Input
                  id="logs-polling-interval"
                  type="number"
                  min={1}
                  max={1440}
                  value={pollingIntervalMinutes}
                  onChange={(e) => updatePollingIntervalMinutes(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  定时任务读取设备 trapbuffer / 告警缓冲的最小间隔（范围 1-1440）。轮询需 SSH 登录设备，
                  每次登录都会在设备上留下一条登录日志，间隔越短这类噪声越多。
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

              {/* 改拉为推：接收器出厂关闭且设备默认不推送，运维配置接收器时就应看到设备侧对接命令 */}
              <div className="space-y-2 lg:col-span-2 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">设备侧对接（华为 VRP，H3C 类似）</p>
                <p>
                  Syslog 推送：
                  <code className="ml-1 rounded bg-muted px-1 py-0.5 font-mono">
                    info-center loghost &lt;本系统IP&gt; port {syslogPort}
                  </code>
                </p>
                <p>
                  Trap 推送：
                  <code className="ml-1 rounded bg-muted px-1 py-0.5 font-mono">
                    snmp-agent target-host trap address udp-domain &lt;本系统IP&gt; params securityname &lt;团体字&gt;
                  </code>
                  ，并在后端环境变量中设置 SNMP_TRAP_ENABLED=true。
                </p>
                <p>
                  设备开始推送后，定时任务不再为已推送的设备登录 SSH 读取 trapbuffer；
                  Docker 等 NAT 部署请通过 LOCAL_IP_ADDRESSES 告知本系统在设备眼中的 IP。
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
                    <dd className="text-foreground">{syslogStatus?.updatedAt ? formatDateTimeYMDHMS(syslogStatus.updatedAt) : '暂无数据'}</dd>
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

          <section
            aria-label="手动清理日志"
            className="rounded-xl border border-red-200/70 bg-red-50/70 p-5 shadow-sm dark:border-red-900/50 dark:bg-red-950/10"
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

            <div className="mt-6 rounded-lg border border-red-200/80 bg-background/80 p-4 text-sm text-muted-foreground dark:border-red-900/50">
              <p className="font-medium text-foreground">清理将按当前页面中的保留天数执行</p>
              <p className="mt-2">
                当前执行范围：清理超过 <span className="font-mono text-foreground">{cleanupRetentionDays}</span> 天的设备日志。该操作不可恢复。
              </p>
            </div>
          </section>
        </div>
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
