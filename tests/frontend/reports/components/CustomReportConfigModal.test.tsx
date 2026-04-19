import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CustomReportConfigModal } from '@/features/reports/components/CustomReportConfigModal'

const mockCreateMutateAsync = jest.fn()
const mockUpdateMutateAsync = jest.fn()

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/features/reports/hooks/useReports', () => ({
  useCreateCustomReportConfig: () => ({
    isPending: false,
    mutateAsync: (...args: unknown[]) => mockCreateMutateAsync(...args),
  }),
  useUpdateCustomReportConfig: () => ({
    isPending: false,
    mutateAsync: (...args: unknown[]) => mockUpdateMutateAsync(...args),
  }),
}))

jest.mock('@/components/atoms', () => ({
  SimpleModal: ({
    open,
    title,
    children,
  }: {
    open: boolean
    title?: string
    children: React.ReactNode
  }) => (open ? (
    <div>
      <div>{title}</div>
      {children}
    </div>
  ) : null),
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button type="button" disabled={disabled} onClick={onClick} {...props}>
      {children}
    </button>
  ),
  SimpleInput: ({
    value,
    onChange,
    placeholder,
    ...props
  }: {
    value: string
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
    placeholder?: string
  }) => (
    <input value={value} onChange={onChange} placeholder={placeholder} {...props} />
  ),
  TextArea: ({
    value,
    onChange,
    placeholder,
    ...props
  }: {
    value: string
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
    placeholder?: string
  }) => (
    <textarea value={value} onChange={onChange} placeholder={placeholder} {...props} />
  ),
}))

describe('CustomReportConfigModal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateMutateAsync.mockResolvedValue({})
    mockUpdateMutateAsync.mockResolvedValue({})
  })

  it('create 模式：填写名称后应调用创建接口并关闭', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()

    render(
      <CustomReportConfigModal
        isOpen
        mode="create"
        initialConfig={null}
        onClose={onClose}
      />
    )

    await user.type(
      screen.getByPlaceholderText('例如：月度运营摘要'),
      '自定义配置A'
    )

    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1)
    expect(mockCreateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '自定义配置A',
        description: '',
        template: expect.any(Object),
        parameters: expect.any(Object),
        charts: expect.any(Array),
        tables: expect.any(Array),
        filters: expect.any(Array),
        layout: expect.any(Object),
      })
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('edit 模式：应调用更新接口并携带 id', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()

    render(
      <CustomReportConfigModal
        isOpen
        mode="edit"
        initialConfig={{
          id: '123',
          name: '旧配置',
          description: 'desc',
          template: {},
          parameters: {},
          charts: [],
          tables: [],
          filters: [],
          layout: { columns: 2, sections: [] },
        }}
        onClose={onClose}
      />
    )

    const nameInput = screen.getByPlaceholderText('例如：月度运营摘要')
    await user.clear(nameInput)
    await user.type(nameInput, '新配置')

    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1)
    expect(mockUpdateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '123',
        updates: expect.objectContaining({
          name: '新配置',
        }),
      })
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('JSON 非法时应提示错误且不调用接口', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()

    render(
      <CustomReportConfigModal
        isOpen
        mode="create"
        initialConfig={null}
        onClose={onClose}
      />
    )

    await user.type(
      screen.getByPlaceholderText('例如：月度运营摘要'),
      '配置-JSON错误'
    )

    const textarea = screen.getByPlaceholderText('请填写/粘贴 JSON（template/parameters/charts/tables/filters/layout）')
    fireEvent.change(textarea, { target: { value: '{bad json' } })

    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(screen.getByText('配置 JSON 解析失败，请检查格式是否正确')).toBeInTheDocument()
    expect(mockCreateMutateAsync).toHaveBeenCalledTimes(0)
    expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(0)
    expect(onClose).toHaveBeenCalledTimes(0)
  })

  it('应为表单字段提供可访问的 label 关联与 name 属性', () => {
    render(
      <CustomReportConfigModal
        isOpen
        mode="create"
        initialConfig={null}
        onClose={jest.fn()}
      />
    )

    expect(screen.getByLabelText('名称 *')).toHaveAttribute('name', 'name')
    expect(screen.getByLabelText('描述')).toHaveAttribute('name', 'description')
    expect(screen.getByLabelText('配置 JSON')).toHaveAttribute('name', 'configText')
  })
})
