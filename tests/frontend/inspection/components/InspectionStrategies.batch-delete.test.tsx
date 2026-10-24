import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import * as inspectionHooks from '@/features/inspection/hooks/useInspection'
import { InspectionStrategies } from '@/features/inspection/components/InspectionStrategies'

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

jest.mock('@/features/inspection/hooks/useInspection', () => ({
  useInspectionStrategies: jest.fn(),
  useToggleStrategy: jest.fn(),
  useDeleteStrategy: jest.fn(),
  useBatchDeleteStrategies: jest.fn(),
  useTriggerExecution: jest.fn(),
}))

jest.mock('@/features/inspection/components/StrategyModal', () => ({
  StrategyModal: () => null,
}))

describe('InspectionStrategies 底部悬浮批量选择与删除', () => {
  const mockStrategies = [
    {
      id: 'strat-1',
      name: '核心交换机日常巡检',
      description: '每天早上9点检查',
      type: 'scheduled',
      cron: '0 9 * * *',
      devices: [1, 2],
      templates: [10],
      enabled: true,
      nextRunTime: '2026-10-25T09:00:00Z',
      createdAt: '2026-10-24T10:00:00Z',
      updatedAt: '2026-10-24T10:00:00Z',
    },
    {
      id: 'strat-2',
      name: '出口路由器手动巡检',
      description: '手动按需执行',
      type: 'manual',
      devices: [3],
      templates: [20],
      enabled: false,
      nextRunTime: null,
      createdAt: '2026-10-24T11:00:00Z',
      updatedAt: '2026-10-24T11:00:00Z',
    },
  ]

  let mutateAsyncMock: jest.Mock
  let refetchMock: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    refetchMock = jest.fn()
    mutateAsyncMock = jest.fn().mockResolvedValue({ deletedCount: 1 })

    ;(inspectionHooks.useInspectionStrategies as jest.Mock).mockReturnValue({
      data: {
        items: mockStrategies,
        total: 2,
        pages: 1,
      },
      isLoading: false,
      error: null,
      refetch: refetchMock,
    })
    ;(inspectionHooks.useToggleStrategy as jest.Mock).mockReturnValue({ isPending: false })
    ;(inspectionHooks.useDeleteStrategy as jest.Mock).mockReturnValue({ isPending: false })
    ;(inspectionHooks.useTriggerExecution as jest.Mock).mockReturnValue({ isPending: false })
    ;(inspectionHooks.useBatchDeleteStrategies as jest.Mock).mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
    })
  })

  it('表格每项最左侧渲染打勾小方框复选框', () => {
    render(<InspectionStrategies />)

    const checkboxes = screen.getAllByRole('checkbox')
    // 表头复选框 + 2 个行复选框 = 3 个
    expect(checkboxes.length).toBe(3)

    const [headerCheckbox, row1Checkbox, row2Checkbox] = checkboxes
    expect(headerCheckbox).not.toBeChecked()
    expect(row1Checkbox).not.toBeChecked()
    expect(row2Checkbox).not.toBeChecked()
  })

  it('勾选记录后页面正下方弹出悬浮操作栏，点击红色删除触发确认弹窗并执行删除', async () => {
    render(<InspectionStrategies />)

    // 初始状态下无悬浮操作栏
    expect(screen.queryByRole('region', { name: '批量操作栏' })).not.toBeInTheDocument()

    // 勾选第一行策略
    const [, row1Checkbox] = screen.getAllByRole('checkbox')
    fireEvent.click(row1Checkbox)

    // 悬浮操作栏弹出
    const actionBar = screen.getByRole('region', { name: '批量操作栏' })
    expect(actionBar).toBeInTheDocument()
    expect(within(actionBar).getByText('已选择 1 项')).toBeInTheDocument()
    expect(within(actionBar).getByRole('button', { name: '全选当前页' })).toBeInTheDocument()
    expect(within(actionBar).getByRole('button', { name: '全选筛选结果' })).toBeInTheDocument()
    expect(within(actionBar).getByRole('button', { name: '反选当前页' })).toBeInTheDocument()
    expect(within(actionBar).getByRole('button', { name: '取消选择' })).toBeInTheDocument()

    // 点击批量操作栏中的红色删除按钮
    const deleteBtn = within(actionBar).getByRole('button', { name: '删除' })
    expect(deleteBtn).toBeInTheDocument()
    expect(deleteBtn.className).toContain('text-red-600')
    fireEvent.click(deleteBtn)

    // 弹出批量删除确认弹窗
    expect(screen.getByRole('heading', { level: 3, name: '批量删除确认' })).toBeInTheDocument()
    expect(screen.getByText('您确定要批量删除选中的 1 条巡检策略吗？')).toBeInTheDocument()

    // 确认删除
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        selectAllFiltered: false,
        ids: ['strat-1'],
      })
    })

    expect(refetchMock).toHaveBeenCalled()
  })

  it('全选筛选结果模式下调用带 selectAllFiltered 的批量删除', async () => {
    render(<InspectionStrategies />)

    const [, row1Checkbox] = screen.getAllByRole('checkbox')
    fireEvent.click(row1Checkbox)

    const actionBar = screen.getByRole('region', { name: '批量操作栏' })

    // 点击操作栏中的「全选筛选结果」
    fireEvent.click(within(actionBar).getByRole('button', { name: '全选筛选结果' }))

    // 点击删除
    fireEvent.click(within(actionBar).getByRole('button', { name: '删除' }))

    // 确认弹窗展示全选文案
    expect(screen.getByText('您确定要删除当前筛选结果中的全部 2 条巡检策略吗？')).toBeInTheDocument()

    // 确认删除
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        selectAllFiltered: true,
        excludeIds: [],
        type: undefined,
        enabled: undefined,
      })
    })

    expect(refetchMock).toHaveBeenCalled()
  })

  it('支持全选当前页、反选当前页和取消选择操作', () => {
    render(<InspectionStrategies />)

    const [, row1Checkbox] = screen.getAllByRole('checkbox')
    fireEvent.click(row1Checkbox)

    const actionBar = screen.getByRole('region', { name: '批量操作栏' })
    expect(within(actionBar).getByText('已选择 1 项')).toBeInTheDocument()

    // 点击全选当前页
    fireEvent.click(within(actionBar).getByRole('button', { name: '全选当前页' }))
    expect(within(actionBar).getByText('已选择 2 项')).toBeInTheDocument()

    // 点击反选当前页（反选后无选中）
    fireEvent.click(within(actionBar).getByRole('button', { name: '反选当前页' }))
    // 操作栏因选中数为 0 消失
    expect(screen.queryByRole('region', { name: '批量操作栏' })).not.toBeInTheDocument()

    // 再次勾选并点击取消选择
    const [, r1] = screen.getAllByRole('checkbox')
    fireEvent.click(r1)
    const newActionBar = screen.getByRole('region', { name: '批量操作栏' })
    expect(newActionBar).toBeInTheDocument()

    fireEvent.click(within(newActionBar).getByRole('button', { name: '取消选择' }))
    expect(screen.queryByRole('region', { name: '批量操作栏' })).not.toBeInTheDocument()
  })
})
