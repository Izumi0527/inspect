import { act, renderHook } from '@testing-library/react'
import { EXCLUDE_KEYWORDS_DEBOUNCE_MS, useExcludeKeywords } from '@/hooks/useExcludeKeywords'

// 屏蔽关键字是"视图偏好"而非"临时筛选"：要跨刷新保留（localStorage），输入要防抖，
// 清空要即时生效；浏览器禁用 storage 时也不能让页面崩掉。

const KEY = 'test_exclude_keywords'

describe('useExcludeKeywords', () => {
  beforeEach(() => {
    localStorage.clear()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('挂载时从 localStorage 读取，且初始值不经防抖直接生效', () => {
    localStorage.setItem(KEY, 'NTP')

    const { result } = renderHook(() => useExcludeKeywords(KEY))

    expect(result.current.excludeQuery).toBe('NTP')
    expect(result.current.debouncedExcludeQuery).toBe('NTP')
    expect(result.current.excludeKeywords).toEqual(['NTP'])
  })

  it('更新后立即写回 localStorage，防抖窗口后才更新查询值', () => {
    const { result } = renderHook(() => useExcludeKeywords(KEY))

    act(() => {
      result.current.setExcludeQuery('NTP,LLDP')
    })

    expect(localStorage.getItem(KEY)).toBe('NTP,LLDP')
    expect(result.current.debouncedExcludeQuery).toBe('')

    act(() => {
      jest.advanceTimersByTime(EXCLUDE_KEYWORDS_DEBOUNCE_MS)
    })

    expect(result.current.debouncedExcludeQuery).toBe('NTP,LLDP')
    expect(result.current.excludeKeywords).toEqual(['NTP', 'LLDP'])
  })

  it('清空时即时生效并移除 localStorage 条目', () => {
    const { result } = renderHook(() => useExcludeKeywords(KEY))

    act(() => {
      result.current.setExcludeQuery('NTP')
    })
    act(() => {
      jest.advanceTimersByTime(EXCLUDE_KEYWORDS_DEBOUNCE_MS)
    })
    expect(result.current.debouncedExcludeQuery).toBe('NTP')

    act(() => {
      result.current.setExcludeQuery('')
    })

    expect(result.current.debouncedExcludeQuery).toBe('')
    expect(result.current.excludeKeywords).toEqual([])
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('localStorage 抛错时以空值启动且更新不抛异常', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    const { result } = renderHook(() => useExcludeKeywords(KEY))
    expect(result.current.excludeQuery).toBe('')

    expect(() => {
      act(() => {
        result.current.setExcludeQuery('x')
      })
    }).not.toThrow()
    expect(result.current.excludeQuery).toBe('x')
  })
})
