import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as inspectionHooks from '@/features/inspection/hooks/useInspection'
import { InspectionExecutions } from '@/features/inspection/components/InspectionExecutions'
import { ExecutionDetailModal } from '@/features/inspection/components/ExecutionDetailModal'
import type { InspectionExecution } from '@/features/inspection/types'

const updateFilterMock = jest.fn()
const updateFiltersMock = jest.fn()
const resetFiltersMock = jest.fn()

let mockUrlFilters = {
  page: 1,
  pageSize: 10,
  status: 'all',
  startDate: '',
  endDate: '',
  deviceId: '',
}

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
  useExecutionDetail: jest.fn(),
  useStopExecution: jest.fn(),
  useGenerateReport: jest.fn(),
  useDeleteExecution: jest.fn(),
  useBatchDeleteExecutions: jest.fn(),
}))

jest.mock('@/features/inspection/hooks/useURLFilters', () => ({
  useURLFilters: () => ({
    filters: mockUrlFilters,
    updateFilter: updateFilterMock,
    updateFilters: updateFiltersMock,
    resetFilters: resetFiltersMock,
  }),
}))

jest.mock('@/features/inspection/hooks/useDateFilters', () => ({
  useDateFilters: () => ({
    getDateRange: jest.fn(() => ({ startDate: '2026-11-26', endDate: '2026-11-26' })),
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

const sampleExecution: InspectionExecution = {
  id: 'exec-100',
  strategyId: '1',
  strategyName: '核心网络巡检',
  triggerType: 'manual',
  triggerUser: '系统管理员',
  status: 'completed',
  progress: 100,
  totalDevices: 2,
  completedDevices: 2,
  startTime: '2026-11-26T12:27:13Z',
  duration: 3,
  summary: {
    totalChecks: 20,
    passedChecks: 11,
    warningChecks: 3,
    failedChecks: 6,
    score: 73,
    deviceResults: [
      {
        deviceId: 'd-1',
        deviceName: 'Core-SW-01',
        deviceType: 'switch',
        deviceIp: '10.0.0.1',
        status: 'warning',
        score: 73,
        passedChecks: 6,
        totalChecks: 10,
        executionTime: 2,
        checkResults: [
          {
            checkItemId: 'c-1',
            checkItemName: 'CPU 使用率',
            status: 'pass',
            actualValue: '28%',
            expectedValue: '< 80%',
            executionTime: 10,
          },
          {
            checkItemId: 'c-2',
            checkItemName: '端口错包率',
            status: 'warning',
            actualValue: '1.2%',
            expectedValue: '< 0.5%',
            message: 'GigabitEthernet0/1 存在少量 CRC 错包',
            executionTime: 15,
          },
          {
            checkItemId: 'c-3',
            checkItemName: '电源冗余状态',
            status: 'fail',
            actualValue: '异常',
            expectedValue: '正常',
            message: 'PWR2 未就绪',
            executionTime: 12,
          },
        ],
      },
      {
        deviceId: 'd-2',
        deviceName: 'Edge-FW-02',
        deviceType: 'firewall',
        deviceIp: '10.0.0.2',
        status: 'success',
        score: 96,
        passedChecks: 10,
        totalChecks: 10,
        executionTime: 1,
        checkResults: [],
      },
    ],
  },
}

describe('执行历史与详情弹窗重设计', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUrlFilters = {
      page: 1,
      pageSize: 10,
      status: 'all',
      startDate: '',
      endDate: '',
      deviceId: '',
    }

    ;(inspectionHooks.useInspectionExecutions as jest.Mock).mockReturnValue({
      data: {
        items: [sampleExecution],
        total: 1,
        pages: 1,
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    })
    ;(inspectionHooks.useExecutionDetail as jest.Mock).mockReturnValue({
      data: sampleExecution,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })
    ;(inspectionHooks.useStopExecution as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    })
    ;(inspectionHooks.useGenerateReport as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    })
    ;(inspectionHooks.useDeleteExecution as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue(undefined),
      isPending: false,
    })
    ;(inspectionHooks.useBatchDeleteExecutions as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    })
  })

  it('列表移除次级统计卡片，展示警告/失败构成且可点击策略名打开详情，无硬编码色板', async () => {
    const user = userEvent.setup()
    const { container } = render(<InspectionExecutions />)

    // 不再有次级 5 张统计卡
    expect(screen.queryByText('总执行数')).not.toBeInTheDocument()
    expect(screen.queryByText('平均评分')).not.toBeInTheDocument()

    // 默认无筛选且无运行中任务时，不显示顶栏条数汇总与自动同步提示
    expect(screen.queryByText(/共 \d+ 条执行记录/)).not.toBeInTheDocument()
    expect(screen.queryByText(/自动同步/)).not.toBeInTheDocument()
    expect(container.querySelector('[data-slot="table-footer"]')).toBeInTheDocument()

    // 巡检结果列展示分数及警告/失败明细
    expect(screen.getByText('73.0')).toBeInTheDocument()
    expect(screen.getByText('通过 11/20')).toBeInTheDocument()
    expect(screen.getByText('警告 3')).toBeInTheDocument()
    expect(screen.getByText('失败 6')).toBeInTheDocument()

    // 不含硬编码蓝/紫/青梯度/红颜色
    expect(container.innerHTML).not.toMatch(/purple-|teal-|cyan-|bg-blue-600|bg-red-600/)

    // 点击策略名直接打开详情弹窗
    await user.click(screen.getByRole('button', { name: '核心网络巡检' }))
    expect(screen.getByRole('dialog', { name: '执行详情 - 核心网络巡检' })).toBeInTheDocument()
  })

  it('展示激活筛选芯片并支持单项移除与全量重置', async () => {
    const user = userEvent.setup()
    mockUrlFilters = {
      page: 1,
      pageSize: 10,
      status: 'failed',
      startDate: '2026-11-26',
      endDate: '2026-11-26',
      deviceId: '12',
    }

    render(<InspectionExecutions />)

    const statusChip = screen.getByRole('button', { name: '移除 状态: 失败 筛选' })
    expect(statusChip).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '移除 设备 #12 筛选' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '移除 日期: 2026-11-26 筛选' })).toBeInTheDocument()

    await user.click(statusChip)
    expect(updateFilterMock).toHaveBeenCalledWith('status', 'all')

    await user.click(screen.getByRole('button', { name: '重置筛选' }))
    expect(resetFiltersMock).toHaveBeenCalledTimes(1)
  })

  it('末页仅剩 1 条记录单条删除成功后自动回退上一页，且删除进行中禁用关闭', async () => {
    const user = userEvent.setup()
    const mutateAsyncMock = jest.fn().mockResolvedValue(undefined)
    mockUrlFilters = {
      ...mockUrlFilters,
      page: 2,
    }
    ;(inspectionHooks.useInspectionExecutions as jest.Mock).mockReturnValue({
      data: {
        items: [sampleExecution],
        total: 11,
        pages: 2,
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    })
    ;(inspectionHooks.useDeleteExecution as jest.Mock).mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
    })

    const { rerender } = render(<InspectionExecutions />)

    await user.click(screen.getByRole('button', { name: '删除记录' }))
    expect(screen.getByRole('dialog', { name: '确认删除执行记录' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith('exec-100')
    })
    expect(updateFilterMock).toHaveBeenCalledWith('page', 1)

    // 模拟先打开弹窗，再进入删除进行中状态：取消按钮禁用且不可通过 Escape 关闭弹窗
    await user.click(screen.getByRole('button', { name: '删除记录' }))
    expect(screen.getByRole('dialog', { name: '确认删除执行记录' })).toBeInTheDocument()

    ;(inspectionHooks.useDeleteExecution as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: true,
    })
    rerender(<InspectionExecutions />)

    const cancelBtn = screen.getByRole('button', { name: '取消' })
    expect(cancelBtn).toBeDisabled()
    expect(screen.getByRole('button', { name: '删除中...' })).toBeDisabled()

    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: '确认删除执行记录' })).toBeInTheDocument()
  })

  it('ExecutionDetailModal 中文化设备状态并支持检查项异常快捷过滤，无硬编码紫色', async () => {
    const user = userEvent.setup()
    render(<ExecutionDetailModal open onClose={jest.fn()} execution={sampleExecution} />)

    // 切到设备详情验证中文状态
    await user.click(screen.getByRole('button', { name: '设备详情' }))
    expect(screen.getByText('警告')).toBeInTheDocument()
    expect(screen.getByText('正常')).toBeInTheDocument()
    expect(screen.queryByText(/^warning$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^success$/)).not.toBeInTheDocument()

    // 切到检查项验证状态过滤
    await user.click(screen.getByRole('button', { name: '检查项' }))
    expect(screen.getByText('CPU 使用率')).toBeInTheDocument()
    expect(screen.getByText('端口错包率')).toBeInTheDocument()
    expect(screen.getByText('电源冗余状态')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '仅异常 (2)' }))
    expect(screen.queryByText('CPU 使用率')).not.toBeInTheDocument()
    expect(screen.getByText('端口错包率')).toBeInTheDocument()
    expect(screen.getByText('电源冗余状态')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '通过 (1)' }))
    expect(screen.getByText('CPU 使用率')).toBeInTheDocument()
    expect(screen.queryByText('电源冗余状态')).not.toBeInTheDocument()

    // 确认 Portal 中的模态框也不含硬编码 purple-/teal-
    expect(document.body.innerHTML).not.toMatch(/purple-|from-teal-50|to-cyan-50/)
  })

  it('summary 缺失或 device.score 为 NaN 时安全兜底且不崩溃', async () => {
    const user = userEvent.setup()
    const malformedExecution = {
      ...sampleExecution,
      id: 'exec-malformed',
      summary: undefined,
    } as unknown as InspectionExecution

    ;(inspectionHooks.useInspectionExecutions as jest.Mock).mockReturnValue({
      data: {
        items: [malformedExecution],
        total: 1,
        pages: 1,
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    })

    render(<InspectionExecutions />)
    expect(screen.getByText('0.0')).toBeInTheDocument()
    expect(screen.getByText('通过 0/0')).toBeInTheDocument()

    const nanDeviceExecution = {
      ...sampleExecution,
      summary: {
        ...sampleExecution.summary,
        deviceResults: [
          {
            ...sampleExecution.summary.deviceResults[0],
            score: Number.NaN,
          },
        ],
      },
    }
    ;(inspectionHooks.useExecutionDetail as jest.Mock).mockReturnValue({
      data: nanDeviceExecution,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    render(<ExecutionDetailModal open onClose={jest.fn()} execution={nanDeviceExecution} />)
    await user.click(screen.getByRole('button', { name: '设备详情' }))
    expect(screen.getByText('评分: —')).toBeInTheDocument()
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
  })
})
