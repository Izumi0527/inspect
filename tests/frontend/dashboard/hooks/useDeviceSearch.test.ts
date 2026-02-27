import { act, renderHook, waitFor } from '@testing-library/react'

import { useDeviceSearch } from '@/features/dashboard/hooks/useDashboard'

const mockSearchDevices = jest.fn()

jest.mock('@/features/dashboard/api/dashboard.api', () => ({
  fetchDashboardData: jest.fn(),
  performDeviceScan: jest.fn(),
  generateReport: jest.fn(),
  searchDevices: (...args: unknown[]) => mockSearchDevices(...args),
}))

describe('useDeviceSearch', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockSearchDevices.mockResolvedValue([])
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  it('应只触发最后一次防抖搜索请求', async () => {
    const { result } = renderHook(() => useDeviceSearch())

    act(() => {
      result.current.setQuery('s')
      result.current.setQuery('sw')
      result.current.setQuery('sw-0')
    })

    act(() => {
      jest.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(mockSearchDevices).toHaveBeenCalledTimes(1)
    })

    expect(mockSearchDevices).toHaveBeenCalledWith('sw-0')
  })

  it('应忽略过期请求的返回结果，避免搜索结果串台', async () => {
    let resolveFirst: (value: unknown[]) => void
    let resolveSecond: (value: unknown[]) => void

    const firstPromise = new Promise<unknown[]>((resolve) => {
      resolveFirst = resolve
    })
    const secondPromise = new Promise<unknown[]>((resolve) => {
      resolveSecond = resolve
    })

    mockSearchDevices
      .mockReturnValueOnce(firstPromise as unknown as Promise<unknown[]>)
      .mockReturnValueOnce(secondPromise as unknown as Promise<unknown[]>)

    const { result } = renderHook(() => useDeviceSearch())

    act(() => {
      result.current.setQuery('sw')
    })
    act(() => {
      jest.advanceTimersByTime(300)
    })

    act(() => {
      result.current.setQuery('sw-0')
    })
    act(() => {
      jest.advanceTimersByTime(300)
    })

    await act(async () => {
      resolveSecond([
        { id: 2, name: 'SW-B', ip: '10.0.0.2', status: 'online' },
      ])
    })

    await waitFor(() => {
      expect(result.current.results[0]?.name).toBe('SW-B')
    })

    await act(async () => {
      resolveFirst([
        { id: 1, name: 'SW-A', ip: '10.0.0.1', status: 'online' },
      ])
    })

    expect(result.current.results[0]?.name).toBe('SW-B')
  })
})

