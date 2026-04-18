import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import {
  useCreateStrategy,
  useDeleteExecution,
  useDeleteStrategy,
  useToggleStrategy,
  useTriggerExecution,
  useUpdateStrategy,
} from '@/features/inspection/hooks/useInspection'
import {
  createInspectionStrategy,
  deleteInspectionStrategy,
  toggleInspectionStrategy,
  triggerStrategyExecution,
  updateInspectionStrategy,
} from '@/features/inspection/api/inspection.api'

const mockDelete = jest.fn()

jest.mock('@/features/inspection/api/inspection.api', () => {
  const actual = jest.requireActual('@/features/inspection/api/inspection.api')
  return {
    ...actual,
    createInspectionStrategy: jest.fn(),
    updateInspectionStrategy: jest.fn(),
    deleteInspectionStrategy: jest.fn(),
    toggleInspectionStrategy: jest.fn(),
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

  it('useCreateStrategy 成功后应刷新策略列表和统计卡片', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    ;(createInspectionStrategy as jest.Mock).mockResolvedValue({
      id: '1',
      name: '新策略',
    })

    const { result } = renderHook(() => useCreateStrategy(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync({
        name: '新策略',
        devices: [1],
        templates: [101],
        enabled: true,
      })
    })

    expect(createInspectionStrategy).toHaveBeenCalledWith({
      name: '新策略',
      devices: [1],
      templates: [101],
      enabled: true,
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspection', 'strategies'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspection', 'stats'] })
  })

  it('useUpdateStrategy 成功后应刷新策略列表和统计卡片', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    ;(updateInspectionStrategy as jest.Mock).mockResolvedValue({
      id: '1',
      name: '更新后策略',
      enabled: false,
    })

    const { result } = renderHook(() => useUpdateStrategy(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync({
        id: '1',
        data: {
          name: '更新后策略',
          enabled: false,
        },
      })
    })

    expect(updateInspectionStrategy).toHaveBeenCalledWith('1', {
      name: '更新后策略',
      enabled: false,
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspection', 'strategies'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspection', 'stats'] })
  })

  it('useDeleteStrategy 成功后应刷新策略列表和统计卡片', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    ;(deleteInspectionStrategy as jest.Mock).mockResolvedValue(undefined)

    const { result } = renderHook(() => useDeleteStrategy(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync('1')
    })

    expect(deleteInspectionStrategy).toHaveBeenCalledWith('1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspection', 'strategies'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspection', 'stats'] })
  })

  it('useToggleStrategy 成功后应刷新策略列表和统计卡片', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    ;(toggleInspectionStrategy as jest.Mock).mockResolvedValue({
      id: '1',
      enabled: false,
    })

    const { result } = renderHook(() => useToggleStrategy(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync({
        id: '1',
        enabled: false,
      })
    })

    expect(toggleInspectionStrategy).toHaveBeenCalledWith('1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspection', 'strategies'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspection', 'stats'] })
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
