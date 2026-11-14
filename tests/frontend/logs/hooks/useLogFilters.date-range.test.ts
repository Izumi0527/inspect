import { act, renderHook } from '@testing-library/react'
import { useLogFilters, LOG_EXCLUDE_KEYWORDS_STORAGE_KEY } from '@/features/logs/hooks/useLogs'

let mockDisplayPreferences:
  | {
      timezone?: string
      time_format?: '12h' | '24h'
      application_name?: string
      alert_exclude_keywords?: string
      log_exclude_keywords?: string
    }
  | undefined = undefined

jest.mock('@/hooks/useDatetimePreferencesSync', () => ({
  useDisplayPreferences: () => ({
    data: mockDisplayPreferences,
  }),
}))

describe('useLogFilters 日期范围', () => {
  beforeEach(() => {
    localStorage.clear()
    mockDisplayPreferences = undefined
  })

  it('默认不带 start_time / end_time', () => {
    const { result } = renderHook(() => useLogFilters())

    expect(result.current.queryParams.start_time).toBeUndefined()
    expect(result.current.queryParams.end_time).toBeUndefined()
  })

  it('设置 startDate / endDate 后应转为本地日边界 ISO 时间', () => {
    const { result } = renderHook(() => useLogFilters())

    act(() => {
      result.current.updateFilter('startDate', '2026-09-05')
      result.current.updateFilter('endDate', '2026-09-12')
    })

    expect(result.current.queryParams.start_time).toBe(new Date(2026, 8, 5, 0, 0, 0, 0).toISOString())
    expect(result.current.queryParams.end_time).toBe(new Date(2026, 8, 12, 23, 59, 59, 999).toISOString())
  })

  it('只选了开始日期时不应带 end_time', () => {
    const { result } = renderHook(() => useLogFilters())

    act(() => {
      result.current.updateFilter('startDate', '2026-09-05')
      result.current.updateFilter('endDate', '')
    })

    expect(result.current.queryParams.start_time).toBe(new Date(2026, 8, 5, 0, 0, 0, 0).toISOString())
    expect(result.current.queryParams.end_time).toBeUndefined()
  })
})

describe('useLogFilters 屏蔽关键字持久化偏好', () => {
  beforeEach(() => {
    localStorage.clear()
    mockDisplayPreferences = undefined
  })

  it('屏蔽词应从 useDisplayPreferences 读取并注入 queryParams.exclude_search', () => {
    mockDisplayPreferences = {
      log_exclude_keywords: 'NTP, LLDP',
    }

    const { result } = renderHook(() => useLogFilters())

    expect(result.current.filters.excludeQuery).toBe('NTP, LLDP')
    expect(result.current.queryParams.exclude_search).toBe('NTP, LLDP')
  })

  it('无屏蔽词时不应注入 queryParams.exclude_search', () => {
    mockDisplayPreferences = {
      log_exclude_keywords: '',
    }

    const { result } = renderHook(() => useLogFilters())

    expect(result.current.queryParams.exclude_search).toBeUndefined()
  })

  it('挂载时应主动清理遗留的 localStorage 本地存储 key', () => {
    localStorage.setItem(LOG_EXCLUDE_KEYWORDS_STORAGE_KEY, 'NTP')

    renderHook(() => useLogFilters())

    expect(localStorage.getItem(LOG_EXCLUDE_KEYWORDS_STORAGE_KEY)).toBeNull()
  })
})
