import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrategyModal } from '@/features/inspection/components/StrategyModal'
import * as inspectionHooks from '@/features/inspection/hooks/useInspection'
import * as deviceHooks from '@/features/devices/hooks/useDevices'

const mockCreateStrategy = jest.fn()
const mockUpdateStrategy = jest.fn()

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}))

jest.mock('@/features/inspection/hooks/useInspection', () => ({
  useCreateStrategy: jest.fn(),
  useUpdateStrategy: jest.fn(),
  useInspectionTemplates: jest.fn(),
}))

jest.mock('@/features/devices/hooks/useDevices', () => ({
  useDevices: jest.fn(),
}))

jest.mock('@/components/atoms', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
  }: {
    children: React.ReactNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
  }) => (
    <button type={type ?? 'button'} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  SimpleInput: ({
    value,
    onChange,
    placeholder,
    className,
    maxLength,
    ...props
  }: {
    value?: string
    onChange?: React.ChangeEventHandler<HTMLInputElement>
    placeholder?: string
    className?: string
    maxLength?: number
  } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      maxLength={maxLength}
      {...props}
    />
  ),
  Badge: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/components/ui/select', () => {
  const React = require('react') as typeof import('react')

  type SelectContextValue = {
    value?: string
    open: boolean
    setOpen: (open: boolean) => void
    onValueChange?: (value: string) => void
  }

  const SelectContext = React.createContext<SelectContextValue | null>(null)

  const useSelectContext = () => {
    const context = React.useContext(SelectContext)
    if (!context) {
      throw new Error('Select mock context is missing')
    }
    return context
  }

  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string
      onValueChange?: (value: string) => void
      children: React.ReactNode
    }) => {
      const [open, setOpen] = React.useState(false)
      return (
        <SelectContext.Provider value={{ value, open, setOpen, onValueChange }}>
          <div>{children}</div>
        </SelectContext.Provider>
      )
    },
    SelectTrigger: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
      const { open, setOpen } = useSelectContext()
      return (
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          {...props}
        >
          {children}
        </button>
      )
    },
    SelectValue: ({ placeholder }: { placeholder?: string }) => <>{placeholder ?? null}</>,
    SelectContent: ({ children }: { children: React.ReactNode }) => {
      const { open } = useSelectContext()
      return open ? <div role="listbox">{children}</div> : null
    },
    SelectItem: ({
      value,
      children,
    }: {
      value: string
      children: React.ReactNode
    }) => {
      const { value: currentValue, onValueChange, setOpen } = useSelectContext()
      return (
        <button
          type="button"
          role="option"
          aria-selected={currentValue === value}
          onClick={() => {
            onValueChange?.(value)
            setOpen(false)
          }}
        >
          {children}
        </button>
      )
    },
  }
})

describe('StrategyModal 下拉统一化', () => {
  beforeEach(() => {
    mockCreateStrategy.mockReset()
    mockUpdateStrategy.mockReset()
    mockCreateStrategy.mockResolvedValue({})
    mockUpdateStrategy.mockResolvedValue({})

    ;(inspectionHooks.useCreateStrategy as jest.Mock).mockReturnValue({
      mutateAsync: mockCreateStrategy,
      isPending: false,
    })

    ;(inspectionHooks.useUpdateStrategy as jest.Mock).mockReturnValue({
      mutateAsync: mockUpdateStrategy,
      isPending: false,
    })

    ;(inspectionHooks.useInspectionTemplates as jest.Mock).mockReturnValue({
      data: {
        templates: [
          { id: '1', name: '模板A', isBuiltIn: false, deviceTypes: ['switch'] },
          { id: '2', name: '路由器巡检', isBuiltIn: true, deviceTypes: ['router'] },
        ],
      },
      isLoading: false,
    })

    ;(deviceHooks.useDevices as jest.Mock).mockReturnValue({
      devices: [
        { id: 1, name: '设备A', ip: '10.0.0.1', device_type: 'switch' },
        { id: 2, name: '出口路由器', ip: '10.0.0.2', device_type: 'router' },
        { id: 3, name: '办公区AP', ip: '10.0.0.3', device_type: 'wireless_ap' },
      ],
      loading: false,
      loadDevices: jest.fn(),
    })
  })

  it('应使用统一 Select 实现策略类型与通俗执行频率下拉', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <StrategyModal strategy={null} onClose={jest.fn()} onSuccess={jest.fn()} />
    )

    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: '策略类型' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '执行频率' })).toBeInTheDocument()
    expect(screen.getByLabelText('执行时刻')).toBeInTheDocument()
    expect(screen.queryByText(/Cron表达式/)).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Cron 预设' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: '策略类型' }))
    await user.click(screen.getByRole('option', { name: '手动巡检' }))
    expect(screen.queryByRole('combobox', { name: '执行频率' })).not.toBeInTheDocument()
  })

  it('创建定时策略时应通过中文执行时间配置生成 Cron 表达式', async () => {
    const user = userEvent.setup()
    const onSuccess = jest.fn()

    render(<StrategyModal strategy={null} onClose={jest.fn()} onSuccess={onSuccess} />)

    await user.type(screen.getByPlaceholderText('请输入策略名称'), '核心设备周检')
    await user.click(screen.getByRole('radio', { name: /模板A/ }))
    await user.click(screen.getByRole('checkbox', { name: /设备A/ }))

    await user.click(screen.getByRole('combobox', { name: '执行频率' }))
    await user.click(screen.getByRole('option', { name: '每周' }))
    await user.click(screen.getByRole('combobox', { name: '每周执行日' }))
    await user.click(screen.getByRole('option', { name: '周三' }))
    await user.clear(screen.getByLabelText('执行时刻'))
    await user.type(screen.getByLabelText('执行时刻'), '09:30')

    await user.click(screen.getByRole('button', { name: '创建策略' }))

    expect(mockCreateStrategy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '核心设备周检',
        type: 'scheduled',
        cron: '0 30 9 ? * WED',
        devices: [1],
        templates: [1],
      })
    )
    expect(onSuccess).toHaveBeenCalled()
  })

  // 交换机模板只巡检交换机：设备列表按所选模板的适用类型过滤，并用中文标出类型
  it('先选模板，设备列表只列出适用类型的设备', async () => {
    const user = userEvent.setup()
    render(<StrategyModal strategy={null} onClose={jest.fn()} onSuccess={jest.fn()} />)

    expect(screen.getByText('请先选择巡检模板')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /设备A/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /模板A/ }))

    expect(screen.getByRole('checkbox', { name: /设备A/ })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /出口路由器/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /办公区AP/ })).not.toBeInTheDocument()
  })

  it('模板选项标出适用设备类型', () => {
    render(<StrategyModal strategy={null} onClose={jest.fn()} onSuccess={jest.fn()} />)
    expect(screen.getByRole('radio', { name: /模板A/ }).closest('label')).toHaveTextContent('交换机')
  })

  it('切换模板时移除类型不符的已选设备并提示', async () => {
    const user = userEvent.setup()
    render(<StrategyModal strategy={null} onClose={jest.fn()} onSuccess={jest.fn()} />)

    await user.click(screen.getByRole('radio', { name: /模板A/ }))
    await user.click(screen.getByRole('checkbox', { name: /设备A/ }))
    await user.click(screen.getByRole('radio', { name: /路由器巡检/ }))

    expect(screen.getByText(/已移除 1 台与「路由器巡检」适用类型（路由器）不符的设备/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /出口路由器/ })).not.toBeChecked()
  })

  it('编辑存量策略时，含类型不符的设备不能保存', async () => {
    const user = userEvent.setup()
    render(
      <StrategyModal
        strategy={{
          id: '9', name: '混合策略', description: '', type: 'manual', devices: [1, 2], templates: [1],
          enabled: true, createdAt: '', updatedAt: '',
        }}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: '保存修改' }))

    expect(screen.getByText(/出口路由器（路由器）/)).toBeInTheDocument()
    expect(mockUpdateStrategy).not.toHaveBeenCalled()
  })
})
