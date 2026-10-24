import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import * as inspectionHooks from '@/features/inspection/hooks/useInspection'
import { InspectionTemplates } from '@/features/inspection/components/InspectionTemplates'

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
  useInspectionTemplates: jest.fn(),
  useInspectionTemplateStats: jest.fn(),
  useCloneTemplate: jest.fn(),
  useDeleteTemplate: jest.fn(),
  useBatchDeleteTemplates: jest.fn(),
}))

jest.mock('@/features/inspection/api/inspection.api', () => ({
  fetchInspectionTemplate: jest.fn(),
}))

jest.mock('@/features/inspection/components/TemplateDetailModal', () => ({
  TemplateDetailModal: () => null,
}))

jest.mock('@/features/inspection/components/TemplateImportModal', () => ({
  TemplateImportModal: () => null,
}))

jest.mock('@/features/inspection/components/CreateTemplateWizard', () => ({
  CreateTemplateWizard: () => null,
}))

jest.mock('@/features/inspection/components/QuickTemplateCreate', () => ({
  QuickTemplateCreate: () => null,
}))

describe('InspectionTemplates 底部悬浮批量选择与删除', () => {
  const mockTemplates = [
    {
      id: 1,
      name: '内置交换机巡检模板',
      description: '系统内置模板，不可删除',
      category: 'hardware',
      deviceTypes: ['switch'],
      checkItems: [],
      isBuiltIn: true,
      isActive: true,
      createdAt: '2026-10-24T10:00:00Z',
      updatedAt: '2026-10-24T10:00:00Z',
    },
    {
      id: 2,
      name: '自定义核心交换机模板',
      description: '手动新增的巡检模板',
      category: 'performance',
      deviceTypes: ['switch'],
      checkItems: [],
      isBuiltIn: false,
      isActive: true,
      createdAt: '2026-10-24T11:00:00Z',
      updatedAt: '2026-10-24T11:00:00Z',
    },
    {
      id: 3,
      name: '自定义路由器模板',
      description: '手动新增的路由器模板',
      category: 'network',
      deviceTypes: ['router'],
      checkItems: [],
      isBuiltIn: false,
      isActive: true,
      createdAt: '2026-10-24T12:00:00Z',
      updatedAt: '2026-10-24T12:00:00Z',
    },
  ]

  let mutateAsyncMock: jest.Mock
  let refetchMock: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    refetchMock = jest.fn()
    mutateAsyncMock = jest.fn().mockResolvedValue({ deletedCount: 1 })

    ;(inspectionHooks.useInspectionTemplates as jest.Mock).mockReturnValue({
      data: {
        templates: mockTemplates,
        total: 3,
        page: 1,
        page_size: 20,
      },
      isLoading: false,
      error: null,
      refetch: refetchMock,
    })
    ;(inspectionHooks.useInspectionTemplateStats as jest.Mock).mockReturnValue({
      data: {
        builtInTotal: 1,
        customTotal: 2,
        activeTotal: 3,
      },
    })
    ;(inspectionHooks.useCloneTemplate as jest.Mock).mockReturnValue({ isPending: false })
    ;(inspectionHooks.useDeleteTemplate as jest.Mock).mockReturnValue({ isPending: false })
    ;(inspectionHooks.useBatchDeleteTemplates as jest.Mock).mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
    })
  })

  it('内置模板复选框为 disabled 且带有内置模板不可删除提示，只有自定义模板可勾选', () => {
    render(<InspectionTemplates />)

    const checkboxes = screen.getAllByRole('checkbox')
    // 表头复选框 + 3 个行复选框 = 4 个
    expect(checkboxes.length).toBe(4)

    const [, row1Checkbox, row2Checkbox, row3Checkbox] = checkboxes

    // 第 1 行为内置模板：复选框禁用并带有提示
    expect(row1Checkbox).toBeDisabled()
    expect(row1Checkbox).toHaveAttribute('title', '内置模板不可删除')

    // 第 2、3 行为自定义模板：复选框可用
    expect(row2Checkbox).not.toBeDisabled()
    expect(row2Checkbox).not.toBeChecked()
    expect(row3Checkbox).not.toBeDisabled()
    expect(row3Checkbox).not.toBeChecked()
  })

  it('勾选自定义模板弹出悬浮操作栏，点击红色删除弹出确认弹窗并执行删除', async () => {
    render(<InspectionTemplates />)

    // 初始状态下无悬浮操作栏
    expect(screen.queryByRole('region', { name: '批量操作栏' })).not.toBeInTheDocument()

    // 勾选自定义模板（第 2 行）
    const [, , row2Checkbox] = screen.getAllByRole('checkbox')
    fireEvent.click(row2Checkbox)

    // 悬浮操作栏弹出
    const actionBar = screen.getByRole('region', { name: '批量操作栏' })
    expect(actionBar).toBeInTheDocument()
    expect(within(actionBar).getByText('已选择 1 项')).toBeInTheDocument()

    // 点击批量操作栏中的红色删除按钮
    const deleteBtn = within(actionBar).getByRole('button', { name: '删除' })
    expect(deleteBtn).toBeInTheDocument()
    expect(deleteBtn.className).toContain('text-red-600')
    fireEvent.click(deleteBtn)

    // 弹出批量删除确认弹窗
    expect(screen.getByRole('heading', { level: 3, name: '批量删除确认' })).toBeInTheDocument()
    expect(screen.getByText('您确定要批量删除选中的 1 个自定义模板吗？')).toBeInTheDocument()

    // 确认删除
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        selectAllFiltered: false,
        ids: [2],
      })
    })

    expect(refetchMock).toHaveBeenCalled()
  })

  it('点击全选当前页和全选筛选结果自动排除内置模板', async () => {
    render(<InspectionTemplates />)

    const [, , row2Checkbox] = screen.getAllByRole('checkbox')
    fireEvent.click(row2Checkbox)

    const actionBar = screen.getByRole('region', { name: '批量操作栏' })

    // 点击全选当前页：仅包含 2 个自定义模板，排除内置模板
    fireEvent.click(within(actionBar).getByRole('button', { name: '全选当前页' }))
    expect(within(actionBar).getByText('已选择 2 项')).toBeInTheDocument()

    // 点击全选筛选结果
    fireEvent.click(within(actionBar).getByRole('button', { name: '全选筛选结果' }))

    // 点击删除
    fireEvent.click(within(actionBar).getByRole('button', { name: '删除' }))

    // 确认弹窗展示全选文案（针对 2 个自定义模板）
    expect(screen.getByText('您确定要删除当前筛选结果中的全部 2 个自定义模板吗？')).toBeInTheDocument()

    // 确认删除
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        selectAllFiltered: true,
        excludeIds: [],
        vendor: undefined,
        deviceType: undefined,
        category: undefined,
        search: undefined,
      })
    })

    expect(refetchMock).toHaveBeenCalled()
  })
})
