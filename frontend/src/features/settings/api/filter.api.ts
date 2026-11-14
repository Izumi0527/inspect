import { httpClient } from '@/lib/api-client'
import { splitExcludeKeywords } from '@/utils/excludeKeywords'
import { requireBulkSuccess, type BulkUpdateResponse } from './bulk'

export const ALERT_EXCLUDE_KEYWORDS_SETTING_KEY = 'system.alert_exclude_keywords'
export const LOG_EXCLUDE_KEYWORDS_SETTING_KEY = 'logs.exclude_keywords'

export interface FilterRulesSettingsData {
  alertKeywords: string[]
  logKeywords: string[]
}

export interface BackendSettingItem {
  key: string
  value: unknown
  category?: string
}

export async function getFilterRulesSettings(): Promise<FilterRulesSettingsData> {
  const resp = await httpClient.get<BackendSettingItem[] | { items: BackendSettingItem[] }>(
    '/settings/general/settings'
  )
  const items = Array.isArray(resp) ? resp : (resp?.items ?? [])
  const map = new Map<string, unknown>()
  for (const item of items) {
    if (item && typeof item.key === 'string') {
      map.set(item.key, item.value)
    }
  }

  const alertVal =
    typeof map.get(ALERT_EXCLUDE_KEYWORDS_SETTING_KEY) === 'string'
      ? (map.get(ALERT_EXCLUDE_KEYWORDS_SETTING_KEY) as string)
      : ''
  const logVal =
    typeof map.get(LOG_EXCLUDE_KEYWORDS_SETTING_KEY) === 'string'
      ? (map.get(LOG_EXCLUDE_KEYWORDS_SETTING_KEY) as string)
      : ''

  return {
    alertKeywords: splitExcludeKeywords(alertVal),
    logKeywords: splitExcludeKeywords(logVal),
  }
}

export async function saveFilterRulesSettings(data: FilterRulesSettingsData): Promise<void> {
  const alertKeywords = splitExcludeKeywords(data.alertKeywords.join(','))
  const logKeywords = splitExcludeKeywords(data.logKeywords.join(','))

  const resp = await httpClient.post<BulkUpdateResponse>('/settings/general/bulk', {
    settings: {
      [ALERT_EXCLUDE_KEYWORDS_SETTING_KEY]: alertKeywords.join(','),
      [LOG_EXCLUDE_KEYWORDS_SETTING_KEY]: logKeywords.join(','),
    },
  })

  requireBulkSuccess(resp, { action: '保存屏蔽规则' })
}

export const filterRulesApi = {
  getFilterRulesSettings,
  saveFilterRulesSettings,
}
