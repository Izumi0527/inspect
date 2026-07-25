import { httpClient } from '@/lib/api-client'
import { requireBulkSuccess, type BulkUpdateResponse } from './bulk'

export type SyslogProtocol = 'udp' | 'tcp' | 'both'

export interface SyslogSettings {
  enabled: boolean
  protocol: SyslogProtocol
  host: string
  port: number
  maxMessageBytes: number
  alertsEnabled: boolean
  alertsMaxNewPerMinute: number
}

export interface LogsSettings {
  retentionDays: number
  autoCleanupEnabled: boolean
  syslog: SyslogSettings
}

type BackendSettingItem = {
  key: string
  value: unknown
  category?: string
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return fallback
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase()
    if (trimmed === 'true') return true
    if (trimmed === 'false') return false
  }
  return fallback
}

function toProtocol(value: unknown, fallback: SyslogProtocol): SyslogProtocol {
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    if (v === 'udp' || v === 'tcp' || v === 'both') return v
  }
  return fallback
}

export interface SyslogStatus {
  running: boolean
  config: SyslogSettings
  received: number
  stored: number
  droppedUnmatched: number
  droppedParse: number
  alertsCreated: number
  alertsUpdated: number
  alertsRateLimited: number
  lastError?: string
  updatedAt?: string
}

type BackendSyslogStatus = {
  running?: unknown
  config?: Record<string, unknown>
  received?: unknown
  stored?: unknown
  dropped_unmatched?: unknown
  dropped_parse?: unknown
  alerts_created?: unknown
  alerts_updated?: unknown
  alerts_rate_limited?: unknown
  last_error?: unknown
  updated_at?: unknown
}

function normalizeSyslogSettings(map: Map<string, unknown>): SyslogSettings {
  return {
    enabled: toBoolean(map.get('logs.syslog.enabled'), false),
    protocol: toProtocol(map.get('logs.syslog.protocol'), 'both'),
    host: String(map.get('logs.syslog.host') ?? '0.0.0.0').trim() || '0.0.0.0',
    port: toNumber(map.get('logs.syslog.port'), 5514),
    maxMessageBytes: toNumber(map.get('logs.syslog.max_message_bytes'), 8192),
    alertsEnabled: toBoolean(map.get('logs.syslog.alerts.enabled'), true),
    alertsMaxNewPerMinute: toNumber(map.get('logs.syslog.alerts.max_new_per_minute'), 30),
  }
}

function normalizeSyslogStatus(raw: BackendSyslogStatus | null | undefined): SyslogStatus {
  const cfg = (raw?.config ?? {}) as Record<string, unknown>
  const config: SyslogSettings = {
    enabled: toBoolean(cfg.enabled, false),
    protocol: toProtocol(cfg.protocol, 'both'),
    host: String(cfg.host ?? '0.0.0.0').trim() || '0.0.0.0',
    port: toNumber(cfg.port, 5514),
    maxMessageBytes: toNumber(cfg.max_message_bytes, 8192),
    alertsEnabled: toBoolean(cfg.alerts_enabled, true),
    alertsMaxNewPerMinute: toNumber(cfg.alerts_max_new_per_minute, 30),
  }

  return {
    running: Boolean(raw?.running),
    config,
    received: toNumber(raw?.received, 0),
    stored: toNumber(raw?.stored, 0),
    droppedUnmatched: toNumber(raw?.dropped_unmatched, 0),
    droppedParse: toNumber(raw?.dropped_parse, 0),
    alertsCreated: toNumber(raw?.alerts_created, 0),
    alertsUpdated: toNumber(raw?.alerts_updated, 0),
    alertsRateLimited: toNumber(raw?.alerts_rate_limited, 0),
    lastError: typeof raw?.last_error === 'string' ? raw?.last_error : undefined,
    updatedAt: typeof raw?.updated_at === 'string' ? raw?.updated_at : undefined,
  }
}

export const logsSettingsApi = {
  async getLogsSettings(): Promise<LogsSettings> {
    const items = await httpClient.get<BackendSettingItem[]>('/settings/general/settings?category=logs')
    const map = new Map<string, unknown>()
    for (const item of items ?? []) {
      if (!item || typeof item.key !== 'string') continue
      map.set(item.key, item.value)
    }

    return {
      retentionDays: toNumber(map.get('logs.retention_days'), 90),
      autoCleanupEnabled: toBoolean(map.get('logs.auto_cleanup_enabled'), true),
      syslog: normalizeSyslogSettings(map),
    }
  },

  async saveLogsSettings(data: LogsSettings): Promise<void> {
    const resp = await httpClient.post<BulkUpdateResponse>('/settings/general/bulk', {
      settings: {
        'logs.retention_days': data.retentionDays,
        'logs.auto_cleanup_enabled': data.autoCleanupEnabled,
        'logs.syslog.enabled': data.syslog.enabled,
        'logs.syslog.protocol': data.syslog.protocol,
        'logs.syslog.host': data.syslog.host,
        'logs.syslog.port': data.syslog.port,
        'logs.syslog.max_message_bytes': data.syslog.maxMessageBytes,
        'logs.syslog.alerts.enabled': data.syslog.alertsEnabled,
        'logs.syslog.alerts.max_new_per_minute': data.syslog.alertsMaxNewPerMinute,
      },
    })

    requireBulkSuccess(resp, { action: '保存日志设置配置' })
  },

  async getSyslogStatus(): Promise<SyslogStatus> {
    const resp = await httpClient.get<BackendSyslogStatus>('/logs/syslog/status')
    return normalizeSyslogStatus(resp)
  },

  async applySyslogConfig(): Promise<SyslogStatus> {
    const resp = await httpClient.post<BackendSyslogStatus>('/logs/syslog/apply', {})
    return normalizeSyslogStatus(resp)
  },

  async cleanupDeviceLogs(options: { retentionDays: number }): Promise<{ deletedCount: number }> {
    const resp = await httpClient.post<{ deleted_count?: number; deletedCount?: number }>('/logs/cleanup', {
      retention_days: options.retentionDays,
    })

    const respObj = resp as { deleted_count?: unknown; deletedCount?: unknown } | null | undefined
    const raw = respObj?.deleted_count ?? respObj?.deletedCount ?? 0
    return { deletedCount: typeof raw === 'number' && Number.isFinite(raw) ? raw : 0 }
  },
}
