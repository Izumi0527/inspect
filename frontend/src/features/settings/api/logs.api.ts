import { httpClient } from '@/lib/api-client'

export interface LogsSettings {
  retentionDays: number
  autoCleanupEnabled: boolean
}

type BackendSettingItem = {
  key: string
  value: unknown
  category?: string
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
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
    }
  },

  async saveLogsSettings(data: LogsSettings): Promise<void> {
    await httpClient.post('/settings/general/bulk', {
      settings: {
        'logs.retention_days': data.retentionDays,
        'logs.auto_cleanup_enabled': data.autoCleanupEnabled,
      },
    })
  },

  async cleanupDeviceLogs(options: { retentionDays: number }): Promise<{ deletedCount: number }> {
    const resp = await httpClient.post<{ deleted_count?: number; deletedCount?: number }>('/logs/cleanup', {
      retention_days: options.retentionDays,
    })

    const raw = (resp as any)?.deleted_count ?? (resp as any)?.deletedCount ?? 0
    return { deletedCount: typeof raw === 'number' && Number.isFinite(raw) ? raw : 0 }
  },
}

