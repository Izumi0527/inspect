import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import * as inspectionHooks from '@/features/inspection/hooks/useInspection'
import { InspectionExecutions } from '@/features/inspection/components/InspectionExecutions'

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    tr: ({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
      <tr {...props}>{children}</tr>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}))

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueriesData: jest.fn(),
    setQueryData: jest.fn(),
  }),
}))

jest.mock('@/features/inspection/hooks/useInspection', () => ({
  useInspectionExecutions: jest.fn(),
  useStopExecution: jest.fn(),
  useGenerateReport: jest.fn(),
  useDeleteExecution: jest.fn(),
  useBatchDeleteExecutions: jest.fn(),
}))

jest.mock('@/features/inspection/hooks/useURLFilters', () => ({
  useURLFilters: () => ({
    filters: {
      page: 1,
      pageSize: 20,
      status: 'all',
      startDate: '',
      endDate: '',
    },
    updateFilter: jest.fn(),
    resetFilters: jest.fn(),
  }),
}))

jest.mock('@/lib/websocket', () => ({
  useWebSocketEvent: jest.fn(),
  WebSocketEvents: {
    CONNECT: 'connect',
    INSPECTION_PROGRESS: 'inspection_progress',
  },
  wsManager: {
    subscribeToInspectionTasks: jest.fn(),
    unsubscribeFromInspectionTasks: jest.fn(),
  },
}))

jest.mock('@/features/inspection/components/ExecutionDetailModal', () => ({
  ExecutionDetailModal: () => null,
}))

describe('InspectionExecutions 底部悬浮批量选择与删除', () => {
  const mockExecutions = [
    {
      id: 'exec-1',
      strategyName: '核心交换机巡检',
      status: 'completed',
      progress: 100,
      completedDevices: 2,
      totalDevices: 2,
      triggerType: 'manual',
      triggerUser: 'admin',
      startTime: '2026-10-24T10:00:00Z',
      duration: 120,
      summary: {
        score: 95,
        passedChecks: 10,
        totalChecks: 10,
        failedChecks: 0,
        warningChecks: 0,
      },
    },
    {
      id: 'exec-2',
      strategyName: '无线 AP 巡检',
      status: 'running',
      progress: 50,
      completedDevices: 1,
      totalDevices: 2,
      triggerType: 'scheduled',
      triggerUser: 'system',
      startTime: '2026-10-24T11:00:00Z',
      duration: 60,
      summary: {
        score: 80,
        passedChecks: 5,
        totalChecks: 10,
        failedChecks: 0,
        warningChecks: 0,
      },
    },
  ]

  let mutateAsyncMock: jest.Mock
  let refetchMock: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    refetchMock = jest.fn()
    mutateAsyncMock = jest.fn().mockResolvedValue({ deletedCount: 1 })

    ;(inspectionHooks.useInspectionExecutions as jest.Mock).mockReturnValue({
      data: {
        items: mockExecutions,
        total: 2,
        pages: 1,
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: refetchMock,
    })
    ;(inspectionHooks.useStopExecution as jest.Mock).mockReturnValue({ isPending: false })
    ;(inspectionHooks.useGenerateReport as jest.Mock).mockReturnValue({ isPending: false })
    ;(inspectionHooks.useDeleteExecution as jest.Mock).mockReturnValue({ isPending: false })
    ;(inspectionHooks.useBatchDeleteExecutions as jest.Mock).mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
    })
  })

  it('表格每项最左侧渲染复选框，running 状态禁用并提示', () => {
    render(<InspectionExecutions />)

    const checkboxes = screen.getAllByRole('checkbox')
    // 表头复选框 + 2 个行复选框 = 3 个
    expect(checkboxes.length).toBe(3)

    const [headerCheckbox, row1Checkbox, row2Checkbox] = checkboxes

    expect(headerCheckbox).not.toBeChecked()
    expect(row1Checkbox).not.toBeChecked()
    expect(row1Checkbox).not.toBeDisabled()

    // 第二行为 running 任务，复选框应禁用且悬停提示
    expect(row2Checkbox).toBeDisabled()
    expect(row2Checkbox).toHaveAttribute('title', '执行中的任务不可删除')
  })

  it('勾选记录后页面正下方弹出悬浮操作栏，点击红色删除触发确认弹窗并执行删除', async () => {
    render(<InspectionExecutions />)

    // 初始状态下无悬浮操作栏
    expect(screen.queryByRole('region', { name: '批量操作栏' })).not.toBeInTheDocument()

    // 勾选第一行
    const [, row1Checkbox] = screen.getAllByRole('checkbox')
    fireEvent.click(row1Checkbox)

    // 悬浮操作栏弹出
    const actionBar = screen.getByRole('region', { name: '批量操作栏' })
    expect(actionBar).toBeInTheDocument()
    expect(screen.getByText('已选择 1 项')).toBeInTheDocument()

    // 点击醒目的红色删除字样按钮
    const deleteBtn = screen.getByRole('button', { name: '删除' })
    expect(deleteBtn).toBeInTheDocument()
    expect(deleteBtn.className).toContain('text-red-600')
    fireEvent.click(deleteBtn)

    // 弹出确认弹窗
    expect(screen.getByRole('heading', { level: 3, name: '批量删除确认' })).toBeInTheDocument()
    expect(screen.getByText('您确定要批量删除选中的 1 项记录吗？')).toBeInTheDocument()

    // 点击确认删除
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        selectAllFiltered: false,
        ids: ['exec-1'],
      })
    })

    expect(refetchMock).toHaveBeenCalled()
  })

  it('全选筛选结果模式下调用带 selectAllFiltered 的批量删除', async () => {
    render(<InspectionExecutions />)

    const [, row1Checkbox] = screen.getAllByRole('checkbox')
    fireEvent.click(row1Checkbox)

    // 点击操作栏中的「全选筛选结果」
    fireEvent.click(screen.getByRole('button', { name: '全选筛选结果' }))

    // 点击删除
    fireEvent.click(screen.getByRole('button', { name: '删除' }))

    // 确认删除弹窗展示全选文案
    expect(screen.getByText('您确定要删除当前筛选结果中的全部 1 项记录吗？')).toBeInTheDocument()

    // 确认删除
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        selectAllFiltered: true,
        excludeIds: [],
        status: undefined,
        startDate: undefined,
        endDate: undefined,
      })
    })
  })
})
