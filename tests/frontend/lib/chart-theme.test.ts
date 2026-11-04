import { act, renderHook } from '@testing-library/react'
import { resolveChartGridStyle, useDocumentDarkClass } from '@/lib/chart-theme'

describe('resolveChartGridStyle（网格线配色单一来源）', () => {
  it.each([
    ['subdued', false, '#e5e7eb', '3,3'],
    ['subdued', true, '#374151', '3,3'],
    ['prominent', false, '#bcc6d2', '6,5'],
    ['prominent', true, '#4b5563', '6,5'],
  ] as const)('%s / 暗色=%s → %s，虚线 %s', (tone, isDark, stroke, dasharray) => {
    expect(resolveChartGridStyle(tone, isDark)).toEqual({ stroke, dasharray })
  })
})

describe('useDocumentDarkClass（订阅 <html class="dark">）', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark')
  })

  it('初值取自当前 class', () => {
    document.documentElement.classList.add('dark')
    const { result } = renderHook(() => useDocumentDarkClass())
    expect(result.current).toBe(true)
  })

  it('class 变化后无需重新挂载即可拿到新值', async () => {
    const { result } = renderHook(() => useDocumentDarkClass())
    expect(result.current).toBe(false)

    await act(async () => {
      document.documentElement.classList.add('dark')
    })
    expect(result.current).toBe(true)

    await act(async () => {
      document.documentElement.classList.remove('dark')
    })
    expect(result.current).toBe(false)
  })

  it('卸载后断开观察，不再收到变更', async () => {
    const disconnect = jest.spyOn(MutationObserver.prototype, 'disconnect')
    const { unmount } = renderHook(() => useDocumentDarkClass())
    unmount()
    expect(disconnect).toHaveBeenCalled()
  })
})
