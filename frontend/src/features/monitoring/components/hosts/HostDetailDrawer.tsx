'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  CollectCooldownError,
  getMonitoringHostDetail,
  triggerDeviceCollectNow,
} from '../../api/monitoring-hosts.api'
import { MONITORING_HOSTS_QUERY_KEY } from '../../hooks/useMonitoringHosts'
import type { HostDetailResponse } from '../../types/zabbix-monitoring.types'
import { buildSanitizedDiagnosticSummary } from './hostDisplayHelpers'
import { HostActiveAlertsPanel, HostLatestMetricsPanel } from './HostAlertsAndLatestPanel'
import { HostCrossPagePanel } from './HostCrossPagePanel'
import { HostDrawerHeader } from './HostDrawerHeader'
import { HostHardwarePanel } from './HostHardwarePanel'
import { HostInterfacesPanel } from './HostInterfacesPanel'
import { HostOverviewPanel } from './HostOverviewPanel'

export interface HostDetailDrawerProps {
  deviceId: number | null
  onClose: () => void
  onSelectHost?: (deviceId: number) => void
}

type DrawerTabKey =
  | 'overview'
  | 'interfaces'
  | 'hardware'
  | 'latest'
  | 'alerts'
  | 'logs'

const DRAWER_TABS: ReadonlyArray<{ key: DrawerTabKey; label: string }> = [
  { key: 'overview', label: '运行概览' },
  { key: 'interfaces', label: '端口监控' },
  { key: 'hardware', label: '硬件与链路' },
  { key: 'latest', label: '实时指标' },
  { key: 'alerts', label: '活跃告警' },
  { key: 'logs', label: '关联日志与 Trap' },
]

function DrawerTabBody({
  activeTab,
  detail,
  onSelectHost,
  onMutated,
}: {
  activeTab: DrawerTabKey
  detail: HostDetailResponse
  onSelectHost: (id: number) => void
  onMutated: () => void
}) {
  switch (activeTab) {
    case 'overview':
      return <HostOverviewPanel detail={detail} onSelectHost={onSelectHost} />
    case 'interfaces':
      return (
        <HostInterfacesPanel
          deviceId={detail.device.id}
          interfaces={detail.interfaces}
        />
      )
    case 'hardware':
      return <HostHardwarePanel extensions={detail.snmp_extensions} />
    case 'latest':
      return <HostLatestMetricsPanel deviceId={detail.device.id} />
    case 'alerts':
      return (
        <HostActiveAlertsPanel
          deviceId={detail.device.id}
          deviceName={detail.device.name}
          alerts={detail.active_alerts}
          permission={detail.permissions.alerts}
          onMutated={onMutated}
        />
      )
    case 'logs':
      return (
        <HostCrossPagePanel
          deviceId={detail.device.id}
          logs={detail.recent_logs}
          errorLogCount24h={detail.error_log_count_24h}
          trapLogCount24h={detail.trap_log_count_24h}
          permission={detail.permissions.logs}
        />
      )
  }
}

export function HostDetailDrawer({
  deviceId,
  onClose,
  onSelectHost,
}: HostDetailDrawerProps) {
  const queryClient = useQueryClient()
  const [internalHostId, setInternalHostId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<DrawerTabKey>('overview')
  const [cooldownSec, setCooldownSec] = useState(0)

  useEffect(() => {
    setInternalHostId(null)
    setActiveTab('overview')
    setCooldownSec(0)
  }, [deviceId])

  const effectiveDeviceId = deviceId !== null ? (internalHostId ?? deviceId) : null

  useEffect(() => {
    if (effectiveDeviceId === null) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [effectiveDeviceId, onClose])

  useEffect(() => {
    if (cooldownSec <= 0) return
    const timer = window.setInterval(() => {
      setCooldownSec((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [cooldownSec])

  const detailQuery = useQuery({
    queryKey: ['monitoring-host-detail', effectiveDeviceId],
    queryFn: () => getMonitoringHostDetail(effectiveDeviceId as number),
    enabled: effectiveDeviceId !== null,
    staleTime: 20_000,
    retry: 1,
  })

  const collectMutation = useMutation({
    mutationFn: (id: number) => triggerDeviceCollectNow(id),
    onSuccess: (res) => {
      toast.success(`采集完成：更新 ${res.metrics_written} 项指标（${res.collection_time_ms}ms）`)
      void queryClient.invalidateQueries({ queryKey: ['monitoring-host-detail', effectiveDeviceId] })
      void queryClient.invalidateQueries({ queryKey: [MONITORING_HOSTS_QUERY_KEY] })
    },
    onError: (err) => {
      if (err instanceof CollectCooldownError) {
        setCooldownSec(err.retryAfterSeconds)
        toast.error(err.message)
        return
      }
      toast.error(err instanceof Error ? err.message : '立即采集失败')
    },
  })

  if (effectiveDeviceId === null) return null

  const handleCopySummary = async () => {
    if (!detailQuery.data) return
    try {
      await navigator.clipboard.writeText(buildSanitizedDiagnosticSummary(detailQuery.data))
      toast.success('已复制脱敏诊断摘要')
    } catch {
      toast.error('剪贴板写入受限，请检查浏览器权限')
    }
  }

  const handleSwitchHost = (nextId: number) => {
    if (onSelectHost) {
      onSelectHost(nextId)
    } else {
      setInternalHostId(nextId)
      setActiveTab('overview')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        aria-label="关闭详情遮罩"
        onClick={onClose}
        className="fixed inset-0 bg-background/60 backdrop-blur-xs"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="设备监控详情抽屉"
        className="relative z-10 flex h-full w-full max-w-3xl flex-col border-l border-border bg-card shadow-overlay"
      >
        <HostDrawerHeader
          deviceId={effectiveDeviceId}
          detail={detailQuery.data}
          collecting={collectMutation.isPending}
          cooldownSec={cooldownSec}
          onCollectNow={() => collectMutation.mutate(effectiveDeviceId)}
          onCopySummary={() => void handleCopySummary()}
          onClose={onClose}
        />

        <div
          role="tablist"
          aria-label="单机观测视角切换"
          className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-surface-2/30 px-5 py-2"
        >
          {DRAWER_TABS.map((tab) => {
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.key)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {detailQuery.isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              正在加载设备全景观测数据...
            </div>
          ) : detailQuery.isError || !detailQuery.data ? (
            <div className="rounded-xl border border-danger/30 bg-danger-soft/40 p-6 text-center text-sm text-danger">
              {detailQuery.error instanceof Error
                ? detailQuery.error.message
                : '加载设备详情失败'}
            </div>
          ) : (
            <DrawerTabBody
              activeTab={activeTab}
              detail={detailQuery.data}
              onSelectHost={handleSwitchHost}
              onMutated={() => {
                void queryClient.invalidateQueries({
                  queryKey: ['monitoring-host-detail', effectiveDeviceId],
                })
                void queryClient.invalidateQueries({ queryKey: [MONITORING_HOSTS_QUERY_KEY] })
              }}
            />
          )}
        </div>
      </aside>
    </div>
  )
}
