import { act, renderHook } from '@testing-library/react'
import { useLogFilters, LOG_EXCLUDE_KEYWORDS_STORAGE_KEY } from '@/features/logs/hooks/useLogs'

// 日期筛选产出 YYYY-MM-DD，后端按时间戳比较；查询参数必须转成本地当天的边界时间，
// 否则结束日会被当成 UTC 零点截掉大半天。

describe('useLogFilters 日期范围', () => {
  beforeEach(() => {
    localStorage.clear()
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

  it('设置 excludeQuery 防抖后生成 queryParams.exclude_search', () => {
    jest.useFakeTimers()
    const { result } = renderHook(() => useLogFilters())

    expect(result.current.queryParams.exclude_search).toBeUndefined()

    act(() => {
      result.current.updateFilter('excludeQuery', 'NTP,LLDP')
    })

    // 防抖 350ms 前不应立即更新
    expect(result.current.queryParams.exclude_search).toBeUndefined()

    act(() => {
      jest.advanceTimersByTime(350)
    })

    expect(result.current.queryParams.exclude_search).toBe('NTP,LLDP')

    // 清空时立即置空
    act(() => {
      result.current.updateFilter('excludeQuery', '')
    })

    expect(result.current.queryParams.exclude_search).toBeUndefined()
    jest.useRealTimers()
  })
})

// 屏蔽关键字是"视图偏好"：刷新页面后仍在，且首帧请求就带上，不等防抖。
describe('useLogFilters 屏蔽关键字持久化', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('屏蔽词应从 localStorage 回放且首帧即进入 queryParams', () => {
    localStorage.setItem(LOG_EXCLUDE_KEYWORDS_STORAGE_KEY, 'NTP')

    const { result } = renderHook(() => useLogFilters())

    expect(result.current.filters.excludeQuery).toBe('NTP')
    expect(result.current.queryParams.exclude_search).toBe('NTP')
  })

  it('更新屏蔽词应写回 localStorage', () => {
    const { result } = renderHook(() => useLogFilters())

    act(() => {
      result.current.updateFilter('excludeQuery', 'LLDP')
    })

    expect(localStorage.getItem(LOG_EXCLUDE_KEYWORDS_STORAGE_KEY)).toBe('LLDP')
  })
})
