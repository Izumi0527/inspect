import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InspectionTemplates } from '@/features/inspection/components/InspectionTemplates'
import type { InspectionTemplate } from '@/features/inspection/types'

const mockUseInspectionTemplates = jest.fn()
const mockUseInspectionTemplateStats = jest.fn()
const mockDeleteMutateAsync = jest.fn()
const mockCloneMutateAsync = jest.fn()

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    tr: ({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
      <tr {...props}>{children}</tr>
    ),
    button: ({
      children,
      whileHover: _whileHover,
      whileTap: _whileTap,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      whileHover?: unknown
      whileTap?: unknown
    }) => (
      <button type="button" {...props}>
        {children}
      </button>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

jest.mock('@/features/inspection/hooks/useInspection', () => ({
  useInspectionTemplates: (...args: unknown[]) => mockUseInspectionTemplates(...args),
  useInspectionTemplateStats: (...args: unknown[]) => mockUseInspectionTemplateStats(...args),
  useCloneTemplate: () => ({ isPending: false, mutateAsync: mockCloneMutateAsync }),
  useDeleteTemplate: () => ({ isPending: false, mutateAsync: mockDeleteMutateAsync }),
  useBatchDeleteTemplates: () => ({ isPending: false, mutateAsync: jest.fn() }),
}))

jest.mock('@/features/inspection/api/inspection.api', () => ({
  fetchInspectionTemplate: jest.fn(),
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

const sampleTemplates: InspectionTemplate[] = [
  {
    id: '1',
    name: '交换机标准巡检',
    description: '面向核心与汇聚交换机',
    category: 'network',
    deviceTypes: ['switch'],
    checkItems: [
      { id: 'c1', name: 'CPU 使用率', type: 'snmp', metric: 'cpu', weight: 10, config: { threshold: { warning: 75, critical: 90 } } },
      { id: 'c2', name: '内存使用率', type: 'snmp', metric: 'memory', weight: 10, config: {} },
      { id: 'c3', name: '设备连通性', type: 'ping', weight: 8, config: {} },
    ],
    isBuiltIn: true,
    isActive: true,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-26T00:00:00Z',
  },
  {
    id: '2',
    name: '自定义路由器巡检',
    description: '只检查边界路由器关键项',
    category: 'custom',
    deviceTypes: ['router'],
    checkItems: [
      { id: 'c4', name: '设备连通性', type: 'ping', weight: 10, config: {} },
    ],
    isBuiltIn: false,
    isActive: true,
    createdAt: '2026-11-05T00:00:00Z',
    updatedAt: '2026-11-26T00:00:00Z',
  },
]

describe('InspectionTemplates 资产库重构验证', () => {
  beforeEach(() => {
    mockUseInspectionTemplates.mockReset()
    mockUseInspectionTemplateStats.mockReset()
    mockDeleteMutateAsync.mockReset()
    mockCloneMutateAsync.mockReset()
    mockDeleteMutateAsync.mockResolvedValue(true)

    mockUseInspectionTemplates.mockReturnValue({
      data: {
        templates: sampleTemplates,
        total: 2,
        pages: 1,
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })
    mockUseInspectionTemplateStats.mockReturnValue({
      data: {
        builtInTotal: 1,
        customTotal: 1,
        activeTotal: 2,
      },
      isLoading: false,
      error: null,
    })
  })

  it('应展示协议构成摘要、排序分段器，移除统计卡片并支持来源分段筛选', async () => {
    const user = userEvent.setup()
    const { container } = render(<InspectionTemplates />)

    expect(container.querySelectorAll('[data-slot="stat-card"]')).toHaveLength(0)
    expect(screen.getByText('3 项')).toBeInTheDocument()
    expect(screen.getByText('SNMP 2 · Ping 1')).toBeInTheDocument()
    expect(screen.getByText('1 项')).toBeInTheDocument()
    expect(screen.getByText('Ping 1')).toBeInTheDocument()
    const facetGroup = screen.getByRole('group', { name: '按模板来源筛选' })
    const sortGroup = screen.getByRole('group', { name: '模板排序方式' })
    expect(facetGroup).toBeInTheDocument()
    expect(sortGroup).toBeInTheDocument()
    expect(sortGroup).toHaveClass('h-9')
    // 排序分段器位于工具栏筛选组内（紧接在来源分段器右侧），不再渲染「共 X 个模板」
    expect(facetGroup.parentElement).toContainElement(sortGroup)
    expect(screen.queryByText(/共 \d+ 个模板/)).not.toBeInTheDocument()

    // 切换排序方向（当前默认 updated_at desc，点击更新时间切换为 asc）
    await user.click(screen.getByRole('button', { name: '更新时间' }))
    await waitFor(() => {
      expect(mockUseInspectionTemplates).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: 'updated_at', order: 'asc', page: 1 })
      )
    })

    // 点击「内置」来源分段
    await user.click(screen.getByRole('button', { name: /内置/ }))
    await waitFor(() => {
      expect(mockUseInspectionTemplates).toHaveBeenLastCalledWith(
        expect.objectContaining({ isBuiltIn: true, page: 1 })
      )
    })
    expect(screen.getByRole('button', { name: '移除 来源: 内置模板 筛选' })).toBeInTheDocument()

    // 再次点击移除芯片恢复全部
    await user.click(screen.getByRole('button', { name: '移除 来源: 内置模板 筛选' }))
    await waitFor(() => {
      expect(mockUseInspectionTemplates).toHaveBeenLastCalledWith(
        expect.objectContaining({ isBuiltIn: undefined, page: 1 })
      )
    })
  })

  it('点击模板名称应打开详情弹窗并展示结构化指标与阈值', async () => {
    const user = userEvent.setup()
    render(<InspectionTemplates />)

    await user.click(screen.getByRole('button', { name: '交换机标准巡检' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('指标: cpu')).toBeInTheDocument()
    expect(screen.getByText('警告: 75')).toBeInTheDocument()
    expect(screen.getByText('严重: 90')).toBeInTheDocument()
  })

  it('点击自定义模板删除应弹出统一 ConfirmModal 并在确认后删除', async () => {
    const user = userEvent.setup()
    render(<InspectionTemplates />)

    await user.click(screen.getByRole('button', { name: '删除' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('确定要删除巡检模板“自定义路由器巡检”吗？此操作无法撤销。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => {
      expect(mockDeleteMutateAsync).toHaveBeenCalledWith('2')
    })
  })

  it('末页最后一条被删后页码越界时应自动夹紧回退到最后一页', async () => {
    const user = userEvent.setup()
    mockUseInspectionTemplates.mockReturnValue({
      data: {
        templates: sampleTemplates,
        total: 11,
        pages: 2,
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    const { rerender } = render(<InspectionTemplates />)

    // 翻到第 2 页
    await user.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => {
      expect(mockUseInspectionTemplates).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 })
      )
    })

    // 模拟删除后总条数降为 10（totalPages=1）
    mockUseInspectionTemplates.mockReturnValue({
      data: {
        templates: sampleTemplates,
        total: 10,
        pages: 1,
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    rerender(<InspectionTemplates />)

    await waitFor(() => {
      expect(mockUseInspectionTemplates).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1 })
      )
    })
  })
})
