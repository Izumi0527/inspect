import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { useDeviceInterfaceTraffic } from '@/features/monitoring/hooks/useDeviceInterfaceTraffic'
import type { DeviceInterfaceTraffic } from '@/features/monitoring/types'

jest.mock('@/lib/contexts/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u-test' } }),
}))

const mockFetch = jest.fn<Promise<DeviceInterfaceTraffic>, [number, string, string?]>()

jest.mock('@/features/monitoring/api/monitoring.api', () => ({
  fetchDeviceInterfaceTraffic: (...args: [number, string, string?]) => mockFetch(...args),
}))

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

const sample: DeviceInterfaceTraffic = {
  deviceId: 6,
  interface: '',
  interfaces: [{ name: 'if6', label: 'GigabitEthernet0/0/1' }],
  points: [],
}

describe('useDeviceInterfaceTraffic', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockResolvedValue(sample)
  })

  it('未选中单台设备（deviceId 为 null）时不发起请求', async () => {
    const { result } = renderHook(
      () => useDeviceInterfaceTraffic({ deviceId: null, timeRange: '1h', interfaceName: '' }),
      { wrapper: createWrapper() }
    )

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
  })

  it('按设备、时间范围与接口发起请求，并返回归一化数据', async () => {
    const { result } = renderHook(
      () => useDeviceInterfaceTraffic({ deviceId: 6, timeRange: '24h', interfaceName: 'if6' }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.data).toEqual(sample))
    expect(mockFetch).toHaveBeenCalledWith(6, '24h', 'if6')
  })
})
