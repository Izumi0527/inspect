import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { useMonitoringV2 } from '@/features/monitoring/hooks/useMonitoringV2'

jest.mock('@/lib/contexts/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'u-test' },
  }),
}))

const mockGet = jest.fn()
const mockPost = jest.fn()

jest.mock('@/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    status: number

    constructor(status: number, message?: string) {
      super(message)
      this.name = 'ApiClientError'
      this.status = status
    }
  },
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useMonitoringV2', () => {
  const now = '2026-02-24T12:00:00.000Z'

  beforeEach(() => {
    jest.clearAllMocks()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ApiClientError } = require('@/lib/api-client') as { ApiClientError: new (status: number, message?: string) => Error & { status: number } }

    mockGet.mockImplementation((url: string) => {
      if (url === '/monitoring/devices/distribution') {
        return Promise.resolve({ healthy: 1, warning: 0, critical: 0, offline: 0 })
      }
      if (url === '/monitoring/availability') {
        return Promise.resolve({ current: 99.9, target: 99.9, trend: 'stable', last_update: now })
      }
      if (url === '/monitoring/stats') {
        return Promise.resolve({ total_devices: 1, availability: 99.9, active_alerts: 0, avg_cpu: 10, avg_memory: 20, avg_network: 0 })
      }
      if (url.startsWith('/alerts/')) {
        return Promise.resolve({ alerts: [] })
      }
      return Promise.reject(new Error(`unexpected GET: ${url}`))
    })

    mockPost.mockImplementation((url: string) => {
      if (url === '/monitoring/dashboard/v2') {
        return Promise.reject(new ApiClientError(404, 'not found'))
      }
      if (url === '/monitoring/system/performance') {
        return Promise.resolve([{ timestamp: now, cpu_usage: 10, memory_usage: 20, network_traffic: 0 }])
      }
      if (url === '/monitoring/devices/temperature') {
        return Promise.resolve([{ timestamp: now, devices: { edge: 40 } }])
      }
      if (url === '/monitoring/network/traffic/history') {
        return Promise.reject(new Error('traffic api failed'))
      }
      return Promise.reject(new Error(`unexpected POST: ${url}`))
    })
  })

  it('应返回含分区状态的监控数据结构', async () => {
    const { result } = renderHook(
      () => useMonitoringV2({ timeRange: '24h', enablePolling: false }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data?.hasPartialFailure).toBe(true)
    expect(result.current.data?.sections.networkTraffic.ok).toBe(false)
    expect(result.current.data?.failedSections).toContain('networkTraffic')
  })
})
