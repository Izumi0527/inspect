import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InspectionStrategies } from '@/features/inspection/components/InspectionStrategies'

const mockUseInspectionStrategies = jest.fn()
const mockUseInspectionTemplates = jest.fn()
const mockToggleMutateAsync = jest.fn()
const mockTriggerMutateAsync = jest.fn()

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    tr: ({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
      <tr {...props}>{children}</tr>
    ),
  },
}))

jest.mock('@/features/inspection/hooks/useInspection', () => ({
  useInspectionStrategies: (...args: unknown[]) => mockUseInspectionStrategies(...args),
  useInspectionTemplates: (...args: unknown[]) => mockUseInspectionTemplates(...args),
  useToggleStrategy: () => ({ isPending: false, mutateAsync: mockToggleMutateAsync }),
  useDeleteStrategy: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useBatchDeleteStrategies: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useTriggerExecution: () => ({ isPending: false, mutateAsync: mockTriggerMutateAsync }),
}))

jest.mock('@/features/inspection/components/StrategyModal', () => ({
  StrategyModal: () => null,
}))

describe('InspectionStrategies 运维调度台重构验证', () => {
  beforeEach(() => {
    mockUseInspectionStrategies.mockReset()
    mockUseInspectionTemplates.mockReset()
    mockToggleMutateAsync.mockReset()
    mockTriggerMutateAsync.mockReset()

    mockUseInspectionTemplates.mockReturnValue({
      data: {
        templates: [
          {
            id: '10',
            name: '华为交换机日常巡检模板',
            deviceTypes: ['switch'],
            isBuiltIn: true,
          },
        ],
      },
    })

    mockUseInspectionStrategies.mockReturnValue({
      data: {
        items: [
          {
            id: 's1',
            name: '核心交换机定时巡检',
            description: '每日凌晨巡检核心交换机',
            type: 'scheduled',
            cron: '0 0 2 * * ?',
            devices: [1, 2, 3],
            templates: [10],
            enabled: true,
            nextRunTime: '2099-01-01T02:00:00Z',
            createdAt: '2026-11-01T00:00:00Z',
            updatedAt: '2026-11-01T00:00:00Z',
          },
          {
            id: 's2',
            name: 'test',
            description: '',
            type: 'manual',
            devices: [],
            templates: [],
            enabled: false,
            createdAt: '2026-11-02T00:00:00Z',
            updatedAt: '2026-11-02T00:00:00Z',
          },
          {
            id: 's3',
            name: '暂停的定时策略',
            description: '暂时停用',
            type: 'scheduled',
            cron: '0 30 9 ? * WED',
            devices: [5],
            templates: [10],
            enabled: false,
            nextRunTime: '2099-01-01T09:30:00Z',
            createdAt: '2026-11-03T00:00:00Z',
            updatedAt: '2026-11-03T00:00:00Z',
          },
        ],
        total: 3,
        pages: 1,
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })
  })

  it('应展示关联模板名、中文调度计划、配置缺失警告及暂停调度文案', () => {
    render(<InspectionStrategies />)

    expect(screen.getAllByText('华为交换机日常巡检模板').length).toBe(2)
    expect(screen.getByText('每天 02:00')).toBeInTheDocument()
    expect(screen.getByText('每周三 09:30')).toBeInTheDocument()
    expect(screen.getByText('3 台')).toBeInTheDocument()
    expect(screen.getByText('0 台 · 未配置')).toBeInTheDocument()
    expect(screen.getByText('未配置模板')).toBeInTheDocument()
    expect(screen.getByText('待完善')).toBeInTheDocument()
    expect(screen.getByText('已暂停调度')).toBeInTheDocument()

    // 禁用或配置不全的策略应禁用执行按钮
    const runButtons = screen.getAllByRole('button', { name: '手动执行' })
    expect(runButtons[0]).not.toBeDisabled()
    expect(runButtons[1]).toBeDisabled()
    expect(runButtons[2]).toBeDisabled()
  })

  it('应支持通过行内 Switch 开关切换策略启停，且不干扰 checkbox 计数', async () => {
    const user = userEvent.setup()
    render(<InspectionStrategies />)

    // 表头 1 + 3 行 = 4 个 checkbox
    expect(screen.getAllByRole('checkbox')).toHaveLength(4)

    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(3)
    expect(switches[0]).toBeChecked()
    expect(switches[1]).not.toBeChecked()

    await user.click(switches[0])
    await waitFor(() => {
      expect(mockToggleMutateAsync).toHaveBeenCalledWith({
        id: 's1',
        enabled: false,
      })
    })
  })

  it('应支持按关键词搜索并展示空结果重置按钮', async () => {
    const user = userEvent.setup()
    render(<InspectionStrategies />)

    const searchInput = screen.getByLabelText('搜索巡检策略')
    await user.type(searchInput, '核心交换机')

    expect(screen.getByText('核心交换机定时巡检')).toBeInTheDocument()
    expect(screen.queryByText('test')).not.toBeInTheDocument()

    // 搜索态下勾选结果行，悬浮批量栏不应出现“全选筛选结果”（防止跨搜索边界误删）
    const [, firstVisibleRowCheckbox] = screen.getAllByRole('checkbox')
    await user.click(firstVisibleRowCheckbox)
    expect(screen.getByRole('region', { name: '批量操作栏' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '全选筛选结果' })).not.toBeInTheDocument()

    await user.clear(searchInput)
    await user.type(searchInput, '不存在的策略关键词')

    expect(screen.getByText('未找到匹配的巡检策略')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '清空筛选' }))

    expect(screen.getByText('核心交换机定时巡检')).toBeInTheDocument()
    expect(screen.getByText('test')).toBeInTheDocument()
  })
})
