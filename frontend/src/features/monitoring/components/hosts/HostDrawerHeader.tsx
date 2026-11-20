'use client'

import Link from 'next/link'
import { Copy, ExternalLink, RefreshCw, Wrench, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { HostDetailResponse } from '../../types/zabbix-monitoring.types'
import {
  getHostStatusMeta,
  resolveCollectionErrorText,
} from './hostDisplayHelpers'
import { ProtocolBadges } from './ProtocolBadges'

export interface HostDrawerHeaderProps {
  deviceId: number
  detail?: HostDetailResponse
  collecting: boolean
  cooldownSec: number
  onCollectNow: () => void
  onCopySummary: () => void
  onClose: () => void
}

export function HostDrawerHeader({
  deviceId,
  detail,
  collecting,
  cooldownSec,
  onCollectNow,
  onCopySummary,
  onClose,
}: HostDrawerHeaderProps) {
  const device = detail?.device
  const statusMeta = device ? getHostStatusMeta(device.status) : null
  const diagText = device ? resolveCollectionErrorText(device.collection_state) : ''

  return (
    <div className="space-y-2.5 border-b border-border bg-surface-2/40 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold text-foreground">
              {device ? device.name : `设备 #${deviceId}`}
            </h2>
            {statusMeta && (
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${statusMeta.className}`}>
                {statusMeta.label}
              </span>
            )}
            {device?.in_maintenance && (
              <span className="inline-flex items-center gap-1 rounded bg-info-soft px-1.5 py-0.5 text-[11px] font-medium text-info-soft-foreground">
                <Wrench className="h-3 w-3" />
                维护中
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground tabular-nums">
            <span className="font-mono">{device?.ip_address ?? '—'}</span>
            {device?.vendor && <span>· {device.vendor}</span>}
            {device?.model && <span>· {device.model}</span>}
          </div>
        </div>

        <button
          type="button"
          aria-label="关闭抽屉"
          onClick={onClose}
          className="rounded-lg border border-border bg-card p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {device && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ProtocolBadges
            protocols={device.protocols}
            collectionState={device.collection_state}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={collecting || cooldownSec > 0}
              onClick={onCollectNow}
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${collecting ? 'animate-spin' : ''}`} />
              {collecting
                ? '采集中...'
                : cooldownSec > 0
                  ? `冷却中 (${cooldownSec}s)`
                  : '立即采集一次'}
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!detail}
              onClick={onCopySummary}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              复制诊断摘要
            </Button>

            <Link
              href={`/devices?deviceId=${deviceId}`}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-accent"
            >
              去设备管理编辑凭据
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}

      {(diagText || cooldownSec > 0) && (
        <div className="rounded-lg border border-warning/30 bg-warning-soft/60 px-3 py-1.5 text-xs text-warning-soft-foreground">
          {cooldownSec > 0
            ? `采集冷却中，请 ${cooldownSec} 秒后再试`
            : `采集诊断：${diagText}${device?.collection_state.in_backoff ? '（已进入退避熔断）' : ''}`}
        </div>
      )}
    </div>
  )
}
