import { act, renderHook } from '@testing-library/react'
import { useAlertFilters } from '@/features/alerts/hooks/useAlerts'
import { DEFAULT_ALERT_FILTERS } from '@/features/alerts/types'

// 告警中心默认视图为「活跃」：打开页面先看还没处理的告警，而不是被历史的已解决记录淹没。

describe('useAlertFilters 默认视图', () => {
  it('默认状态筛选应为活跃，级别与搜索为空', () => {
    const { result } = renderHook(() => useAlertFilters())

    expect(result.current.filters).toEqual({
      searchQuery: '',
      severityFilter: 'all',
      statusFilter: 'active',
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
    expect(result.current.filters).toEqual(DEFAULT_ALERT_FILTERS)
  })

  it('用户仍可切换到“全部”查看历史告警', () => {
    const { result } = renderHook(() => useAlertFilters())

    act(() => {
      result.current.updateFilter('statusFilter', 'all')
    })
    expect(result.current.filters.statusFilter).toBe('all')
  })
})
