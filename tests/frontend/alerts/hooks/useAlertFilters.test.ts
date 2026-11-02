import { act, renderHook } from '@testing-library/react'
import { useAlertFilters, ALERT_EXCLUDE_KEYWORDS_STORAGE_KEY } from '@/features/alerts/hooks/useAlerts'
import { DEFAULT_ALERT_FILTERS } from '@/features/alerts/types'

// 告警中心默认视图为「活跃」：打开页面先看还没处理的告警，而不是被历史的已解决记录淹没。
// 屏蔽关键字是"视图偏好"而非"筛选"：重置筛选不清它，刷新页面也不丢。

describe('useAlertFilters 默认视图', () => {
  beforeEach(() => {
    localStorage.clear()
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

describe('useAlertFilters 屏蔽关键字', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('重置筛选应保留屏蔽词', () => {
    const { result } = renderHook(() => useAlertFilters())

    act(() => {
      result.current.updateFilter('excludeQuery', 'NTP')
      result.current.updateFilter('statusFilter', 'resolved')
    })

    act(() => {
      result.current.resetFilters()
    })

    expect(result.current.filters.excludeQuery).toBe('NTP')
    expect(result.current.filters.statusFilter).toBe('active')
  })

  it('屏蔽词应从 localStorage 回放并立即进入防抖值', () => {
    localStorage.setItem(ALERT_EXCLUDE_KEYWORDS_STORAGE_KEY, 'LLDP')

    const { result } = renderHook(() => useAlertFilters())

    expect(result.current.filters.excludeQuery).toBe('LLDP')
    expect(result.current.debouncedExcludeQuery).toBe('LLDP')
    expect(result.current.excludeKeywords).toEqual(['LLDP'])
  })
})
