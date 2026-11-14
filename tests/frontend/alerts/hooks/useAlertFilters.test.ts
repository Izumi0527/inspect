import { act, renderHook } from '@testing-library/react'
import { useAlertFilters, ALERT_EXCLUDE_KEYWORDS_STORAGE_KEY } from '@/features/alerts/hooks/useAlerts'
import { DEFAULT_ALERT_FILTERS } from '@/features/alerts/types'

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

describe('useAlertFilters 默认视图', () => {
  beforeEach(() => {
    localStorage.clear()
    mockDisplayPreferences = undefined
  })

  it('默认状态筛选应为活跃，级别、搜索与屏蔽词为空', () => {
    const { result } = renderHook(() => useAlertFilters())

    expect(result.current.filters).toEqual({
      searchQuery: '',
      severityFilter: 'all',
      statusFilter: 'active',
      excludeQuery: '',
    })
    expect(DEFAULT_ALERT_FILTERS.statusFilter).toBe('active')
  })

  it('重置筛选应回到活跃视图而不是“全部”', () => {
    const { result } = renderHook(() => useAlertFilters())

    act(() => {
      result.current.updateFilter('statusFilter', 'resolved')
      result.current.updateFilter('severityFilter', 'critical')
      result.current.updateFilter('searchQuery', 'cpu')
    })
    expect(result.current.filters.statusFilter).toBe('resolved')

    act(() => {
      result.current.resetFilters()
    })
    expect(result.current.filters).toEqual({ ...DEFAULT_ALERT_FILTERS, excludeQuery: '' })
  })

  it('用户仍可切换到“全部”查看历史告警', () => {
    const { result } = renderHook(() => useAlertFilters())

    act(() => {
      result.current.updateFilter('statusFilter', 'all')
    })
    expect(result.current.filters.statusFilter).toBe('all')
  })
})

describe('useAlertFilters 屏蔽关键字与持久化偏好', () => {
  beforeEach(() => {
    localStorage.clear()
    mockDisplayPreferences = undefined
  })

  it('应从 useDisplayPreferences 获取 alert_exclude_keywords 并派生防抖值与切分数组', () => {
    mockDisplayPreferences = {
      alert_exclude_keywords: 'NTP, LLDP, BGP',
    }

    const { result } = renderHook(() => useAlertFilters())

    expect(result.current.filters.excludeQuery).toBe('NTP, LLDP, BGP')
    expect(result.current.debouncedExcludeQuery).toBe('NTP, LLDP, BGP')
    expect(result.current.excludeKeywords).toEqual(['NTP', 'LLDP', 'BGP'])
  })

  it('挂载时应主动清理遗留的 localStorage 本地存储 key', () => {
    localStorage.setItem(ALERT_EXCLUDE_KEYWORDS_STORAGE_KEY, 'legacy_word')

    renderHook(() => useAlertFilters())

    expect(localStorage.getItem(ALERT_EXCLUDE_KEYWORDS_STORAGE_KEY)).toBeNull()
  })
})
