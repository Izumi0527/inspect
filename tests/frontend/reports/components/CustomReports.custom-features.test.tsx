import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CustomReports } from '@/features/reports/components/CustomReports'
import { Permission } from '@/lib/types/auth.types'

const mockUsePermission = jest.fn()
const mockUseCustomReportConfigs = jest.fn()
const mockUseReportTemplates = jest.fn()
const mockCreateMutateAsync = jest.fn()

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
  useCustomReportConfigs: (...args: unknown[]) => mockUseCustomReportConfigs(...args),
  useReportTemplates: (...args: unknown[]) => mockUseReportTemplates(...args),
  useCreateCustomReportConfig: () => ({
    isPending: false,
    mutateAsync: (...args: unknown[]) => mockCreateMutateAsync(...args),
  }),
  useGenerateFromConfig: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useDeleteCustomReportConfig: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useUpdateCustomReportConfig: () => ({ isPending: false, mutateAsync: jest.fn() }),
  usePreviewCustomReportConfig: () => ({
    data: null,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
}))

jest.mock('@/utils/download', () => ({
  downloadWithAuth: jest.fn(),
}))

jest.mock('@/features/reports/api/reports.api', () => ({
  downloadReport: jest.fn(),
}))

jest.mock('@/components/atoms', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Loading: () => <span>loading</span>,
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: React.ComponentProps<'button'>) => (
    <button type="button" disabled={disabled} onClick={onClick} {...props}>
      {children}
    </button>
  ),
  ConfirmModal: () => null,
  Modal: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  ModalContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SimpleModal: ({
    open,
    title,
    children,
  }: {
    open: boolean
    title?: string
    children: React.ReactNode
  }) =>
    open ? (
      <div>
        {title ? <h2>{title}</h2> : null}
        {children}
      </div>
    ) : null,
  SimpleInput: (props: React.ComponentProps<'input'>) => <input {...props} />,
  TextArea: (props: React.ComponentProps<'textarea'>) => <textarea {...props} />,
}))

const customConfig = {
  id: 'config-1',
  name: '现有自定义配置',
  description: '已有配置',
  type: 'custom',
  isDefault: false,
  isActive: true,
  template: {
    id: 'template-inline',
    name: '自定义模板',
    type: 'custom',
    sections: [],
    styles: {},
  },
  parameters: {},
  charts: [],
  tables: [],
  filters: [],
  layout: { columns: 2, sections: [] },
  lastUsed: '',
  usageCount: 0,
}

const reportTemplate = {
  id: 'tpl-1',
  name: '月度运营模板',
  type: 'custom',
  sections: [
    {
      id: 'summary',
      type: 'summary',
      title: '摘要',
      content: {},
      order: 1,
      visible: true,
    },
  ],
  styles: {
    theme: 'light',
    colors: {},
    fonts: {},
    spacing: {},
  },
}

describe('CustomReports 自定义能力补全', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUsePermission.mockReturnValue(true)
    mockUseCustomReportConfigs.mockReturnValue({
      data: [customConfig],
      isLoading: false,
      error: null,
    })
    mockUseReportTemplates.mockReturnValue({
      data: [reportTemplate],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })
    mockCreateMutateAsync.mockResolvedValue({})
  })

  it('不应再提供「导入模板」入口，避免与「复制配置」重复', () => {
    render(<CustomReports searchText="" />)

    // 后端 ListTemplates 无过滤返回 report_templates 全表，而自定义配置写入的是同一张表，
    // 「导入模板」实际等价于复制用户自己的配置，能力与卡片上的「复制配置」完全重叠。
    expect(screen.queryByRole('button', { name: '导入模板' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '复制配置' })).toBeInTheDocument()
  })

  it('「进入生成器」入口应唯一，不重复渲染', () => {
    render(<CustomReports searchText="" />)

    expect(screen.getAllByRole('button', { name: '进入生成器' })).toHaveLength(1)
  })

  it('进入生成器应打开配置向导并能保存新配置', async () => {
    const user = userEvent.setup()

    render(<CustomReports searchText="" />)

    await user.click(screen.getByRole('button', { name: '进入生成器' }))

    expect(screen.getByRole('heading', { name: '自定义报表生成器' })).toBeInTheDocument()
    expect(screen.getByLabelText('报表名称 *')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('报表名称 *'))
    await user.type(screen.getByLabelText('报表名称 *'), '向导生成配置')
    await user.click(screen.getByRole('button', { name: '保存配置' }))

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '向导生成配置',
          charts: expect.any(Array),
          tables: expect.any(Array),
          filters: expect.any(Array),
          layout: expect.objectContaining({
            columns: 2,
          }),
        })
      )
    })
  })
})
