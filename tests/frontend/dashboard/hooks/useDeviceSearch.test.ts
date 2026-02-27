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
})

