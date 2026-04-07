import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { useDeleteExecution, useTriggerExecution } from '@/features/inspection/hooks/useInspection'
import { triggerStrategyExecution } from '@/features/inspection/api/inspection.api'

const mockDelete = jest.fn()

jest.mock('@/features/inspection/api/inspection.api', () => {
  const actual = jest.requireActual('@/features/inspection/api/inspection.api')
  return {
    ...actual,
    triggerStrategyExecution: jest.fn(),
  }
})

jest.mock('@/lib/api-client', () => ({
  api: {
    delete: (...args: unknown[]) => mockDelete(...args),
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
  TokenManager: {
    getAccessToken: jest.fn(),
  },
  getApiOrigin: jest.fn(() => 'http://localhost:3000'),
}))

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

const createWrapper = (queryClient: QueryClient) => {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useInspection 执行后缓存失效', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('useTriggerExecution 成功后应补齐统计分析相关缓存失效', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    ;(triggerStrategyExecution as jest.Mock).mockResolvedValue({
      message: '巡检任务已启动',
      inspection_ids: [1],
    })

    const { result } = renderHook(() => useTriggerExecution(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync('strategy-1')
    })

    expect(triggerStrategyExecution).toHaveBeenCalledWith('strategy-1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspection', 'executions'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspection', 'strategies'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspection', 'stats'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspection', 'trends'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspection', 'device-distribution'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspection', 'problem-distribution'] })
  })

  it('useDeleteExecution 成功后应补齐统计分析相关缓存失效', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    mockDelete.mockResolvedValue({
      code: 200,
      data: {},
    })

    const { result } = renderHook(() => useDeleteExecution(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync('execution-1')
    })

    expect(mockDelete).toHaveBeenCalledWith('/inspection/executions/execution-1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspection', 'executions'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspection', 'stats'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspection', 'trends'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspection', 'device-distribution'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspection', 'problem-distribution'] })
  })
})
