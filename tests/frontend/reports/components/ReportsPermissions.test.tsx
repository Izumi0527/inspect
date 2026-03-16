import React from 'react'
import { render, screen } from '@testing-library/react'
import { StatisticsReports } from '@/features/reports/components/StatisticsReports'
import { CustomReports } from '@/features/reports/components/CustomReports'
import { Permission } from '@/lib/types/auth.types'

const mockUsePermission = jest.fn()
const mockUseStatistics = jest.fn()
const mockUseKPIData = jest.fn()
const mockUseRankings = jest.fn()
const mockUseCustomReportConfigs = jest.fn()

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: (permission: Permission) => mockUsePermission(permission),
}))

jest.mock('@/features/reports/hooks/useReports', () => ({
  useStatistics: (...args: unknown[]) => mockUseStatistics(...args),
  useKPIData: (...args: unknown[]) => mockUseKPIData(...args),
  useRankings: (...args: unknown[]) => mockUseRankings(...args),
  useGenerateStatisticsReport: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useExportToExcel: () => ({ isPending: false, mutateAsync: jest.fn() }),

  useCustomReportConfigs: (...args: unknown[]) => mockUseCustomReportConfigs(...args),
  useGenerateFromConfig: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useDeleteCustomReportConfig: () => ({ isPending: false, mutateAsync: jest.fn() }),

  useCreateCustomReportConfig: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useUpdateCustomReportConfig: () => ({ isPending: false, mutateAsync: jest.fn() }),
}))

jest.mock('@/components/atoms', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Loading: () => <span>loading</span>,
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: {
    children?: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    title?: string
  }) => (
    <button type="button" disabled={disabled} onClick={onClick} {...props}>
      {children}
    </button>
  ),
  ConfirmModal: ({
    isOpen,
    title,
    confirmText = '确认',
    cancelText = '取消',
    confirmDisabled,
    onConfirm,
    onClose,
  }: {
    isOpen: boolean
    title: string
    confirmText?: string
    cancelText?: string
    confirmDisabled?: boolean
    onConfirm: () => void
    onClose: () => void
  }) =>
    isOpen ? (
      <div>
        <div>{title}</div>
        <button type="button" disabled={confirmDisabled} onClick={onConfirm}>
          {confirmText}
        </button>
        <button type="button" onClick={onClose}>
          {cancelText}
        </button>
      </div>
    ) : null,

  CardSkeleton: () => <div />,
  ChartSkeleton: () => <div />,
  TableSkeleton: () => <div />,
  ErrorAlert: ({ title, message }: { title?: string; message: string }) => (
    <div>
      {title ? <div>{title}</div> : null}
      <div>{message}</div>
    </div>
  ),
  DateRangePicker: () => <div />,
  QuickDateRangeButtons: () => <div />,
  MultiSelect: () => <div />,
  BarChartComponent: () => <div />,
  PieChartComponent: () => <div />,

  SimpleModal: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  SimpleInput: (props: React.ComponentProps<'input'>) => <input {...props} />,
  TextArea: (props: React.ComponentProps<'textarea'>) => <textarea {...props} />,
}))

describe('reports 权限控制（P1）', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    mockUseStatistics.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })
    mockUseKPIData.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })
    mockUseRankings.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })
    mockUseCustomReportConfigs.mockReturnValue({
      data: [
        {
          id: 'c1',
          name: '配置1',
          description: 'desc',
          type: 'custom',
          isDefault: false,
          lastUsed: null,
          usageCount: 0,
        },
      ],
      isLoading: false,
      error: null,
    })
  })

  it('无 reports:create 时，统计页不应展示“生成统计报表/导出数据”按钮', () => {
    mockUsePermission.mockReturnValue(false)

    render(<StatisticsReports searchText="" />)

    expect(screen.queryByRole('button', { name: '生成统计报表' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '导出数据' })).not.toBeInTheDocument()
    expect(
      screen.getByText('当前账号暂无生成/导出报表权限，请联系管理员开通。')
    ).toBeInTheDocument()
  })

  it('无 reports:update/delete 时，自定义报表不应展示“编辑/删除”等操作按钮', () => {
    mockUsePermission.mockReturnValue(false)

    render(<CustomReports searchText="" />)

    expect(screen.queryByRole('button', { name: '创建自定义报表' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '导入模板' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '生成报表' })).not.toBeInTheDocument()
    expect(screen.queryByTitle('复制配置')).not.toBeInTheDocument()
    expect(screen.queryByTitle('编辑配置')).not.toBeInTheDocument()
    expect(screen.queryByTitle('删除配置')).not.toBeInTheDocument()
  })
})

