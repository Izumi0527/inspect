import { act, renderHook } from '@testing-library/react'
import { useLogFilters } from '@/features/logs/hooks/useLogs'

// 日期筛选产出 YYYY-MM-DD，后端按时间戳比较；查询参数必须转成本地当天的边界时间，
// 否则结束日会被当成 UTC 零点截掉大半天。

describe('useLogFilters 日期范围', () => {
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
