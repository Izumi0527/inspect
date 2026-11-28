import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CreateTemplateWizard, isLowerBoundedMetric } from '@/features/inspection/components/CreateTemplateWizard'
import * as inspectionHooks from '@/features/inspection/hooks/useInspection'
import type { InspectionTemplate } from '@/features/inspection/types'

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className }: React.HTMLAttributes<HTMLDivElement>) => <div className={className}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

jest.mock('@/features/inspection/hooks/useInspection', () => ({
  useCreateTemplate: jest.fn(),
  useUpdateTemplate: jest.fn(),
  useInspectionTemplates: jest.fn(),
}))

// Radix Select 在 jsdom 下不可交互，换成等价的按钮实现（同 StrategyModal 测试）
jest.mock('@/components/ui/select', () => {
  const React = require('react') as typeof import('react')
  type Ctx = { value?: string; open: boolean; setOpen: (o: boolean) => void; onValueChange?: (v: string) => void }
  const SelectContext = React.createContext<Ctx | null>(null)
  const useCtx = () => React.useContext(SelectContext) as Ctx
  return {
    Select: ({ value, onValueChange, children }: { value?: string; onValueChange?: (v: string) => void; children: React.ReactNode }) => {
      const [open, setOpen] = React.useState(false)
      return <SelectContext.Provider value={{ value, open, setOpen, onValueChange }}><div>{children}</div></SelectContext.Provider>
    },
    SelectTrigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
      const { open, setOpen } = useCtx()
      return <button type="button" role="combobox" aria-expanded={open} onClick={() => setOpen(!open)} {...props}>{children}</button>
    },
    SelectValue: ({ placeholder }: { placeholder?: string }) => <>{placeholder ?? null}</>,
    SelectContent: ({ children }: { children: React.ReactNode }) => (useCtx().open ? <div role="listbox">{children}</div> : null),
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const { value: current, onValueChange, setOpen } = useCtx()
      return (
        <button type="button" role="option" aria-selected={current === value} onClick={() => { onValueChange?.(value); setOpen(false) }}>
          {children}
        </button>
      )
    },
  }
})

const builtIn = (id: string, name: string, deviceType: string, items: InspectionTemplate['checkItems']): InspectionTemplate => ({
  id, name, description: '', category: 'network', deviceTypes: [deviceType], checkItems: items,
  isBuiltIn: true, isActive: true, createdAt: '', updatedAt: '',
})

const builtInTemplates = [
  builtIn('11', '交换机巡检', 'switch', [
    { id: 'connectivity', name: '设备连通性', type: 'ping', weight: 8, config: {} },
    { id: 'poe_status', name: 'PoE 供电余量', type: 'snmp', metric: 'poe', weight: 6, config: {} },
  ]),
  builtIn('14', '服务器巡检', 'server', [
    { id: 'connectivity', name: '设备连通性', type: 'ping', weight: 8, config: {} },
    { id: 'disk_usage', name: '磁盘使用率', type: 'snmp', metric: 'disk_usage', weight: 10, config: { threshold: { warning: 80, critical: 90 } } },
  ]),
]

const create = jest.fn()
const update = jest.fn()

beforeEach(() => {
  create.mockResolvedValue({})
  update.mockResolvedValue({})
  ;(inspectionHooks.useCreateTemplate as jest.Mock).mockReturnValue({ mutateAsync: create, isPending: false })
  ;(inspectionHooks.useUpdateTemplate as jest.Mock).mockReturnValue({ mutateAsync: update, isPending: false })
  ;(inspectionHooks.useInspectionTemplates as jest.Mock).mockReturnValue({ data: { templates: builtInTemplates }, isLoading: false })
})

const gotoDeviceTypeStep = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByPlaceholderText(/例如：/), '自建模板')
  await user.click(screen.getByRole('button', { name: /下一步/ }))
}

describe('CreateTemplateWizard 设备类型', () => {
  it('只能从四类可巡检设备中单选一种，不再支持自定义类型', async () => {
    const user = userEvent.setup()
    render(<CreateTemplateWizard onClose={jest.fn()} onSuccess={jest.fn()} />)
    await gotoDeviceTypeStep(user)

    const radios = screen.getAllByRole('radio')
    expect(radios.map(r => r.textContent)).toEqual(['🔀交换机', '🌐路由器', '🛡️防火墙', '🖥️服务器'])
    expect(screen.queryByPlaceholderText('输入自定义设备类型')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /交换机/ }))
    await user.click(screen.getByRole('radio', { name: /服务器/ }))
    expect(screen.getByRole('radio', { name: /服务器/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: /交换机/ })).toHaveAttribute('aria-checked', 'false')
  })

  it('未选择设备类型时不能进入下一步', async () => {
    const user = userEvent.setup()
    render(<CreateTemplateWizard onClose={jest.fn()} onSuccess={jest.fn()} />)
    await gotoDeviceTypeStep(user)

    await user.click(screen.getByRole('button', { name: /下一步/ }))
    expect(screen.getByText('请选择模板适用的设备类型')).toBeInTheDocument()
  })

  it('编辑声明了多种类型的存量模板时要求重新选择', async () => {
    const user = userEvent.setup()
    const legacy: InspectionTemplate = {
      ...builtIn('30', '旧全面巡检（副本）', 'switch', [{ id: 'c', name: '设备连通性', type: 'ping', weight: 1, config: {} }]),
      deviceTypes: ['switch', 'router'],
      isBuiltIn: false,
    }
    render(<CreateTemplateWizard template={legacy} onClose={jest.fn()} onSuccess={jest.fn()} />)
    await user.click(screen.getByRole('button', { name: /下一步/ }))

    expect(screen.getByText(/原先声明适用于 交换机、路由器/)).toBeInTheDocument()
    expect(screen.getAllByRole('radio').every(r => r.getAttribute('aria-checked') === 'false')).toBe(true)
  })
})

describe('CreateTemplateWizard 检查项', () => {
  const gotoCheckItemStep = async (user: ReturnType<typeof userEvent.setup>) => {
    await gotoDeviceTypeStep(user)
    await user.click(screen.getByRole('radio', { name: /服务器/ }))
    await user.click(screen.getByRole('button', { name: /下一步/ }))
  }

  it('可一键添加所选类型内置模板的检查项', async () => {
    const user = userEvent.setup()
    render(<CreateTemplateWizard onClose={jest.fn()} onSuccess={jest.fn()} />)
    await gotoCheckItemStep(user)

    await user.click(screen.getByRole('button', { name: /从内置「服务器巡检」添加/ }))

    expect(screen.getByText('磁盘使用率')).toBeInTheDocument()
    expect(screen.queryByText('PoE 供电余量')).not.toBeInTheDocument()
  })

  it('SNMP 检查项必须选择采集指标，选项来自内置模板', async () => {
    const user = userEvent.setup()
    render(<CreateTemplateWizard onClose={jest.fn()} onSuccess={jest.fn()} />)
    await gotoCheckItemStep(user)

    await user.click(screen.getByRole('button', { name: /添加检查项/ }))
    await user.type(screen.getByPlaceholderText('例如：CPU 使用率'), '数据盘')
    await user.click(screen.getByRole('button', { name: /下一步/ }))
    expect(screen.getByText(/SNMP 检查项必须选择采集指标/)).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: '采集指标' }))
    expect(screen.getByRole('option', { name: /PoE 供电余量/ })).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: /磁盘使用率/ }))
    await user.click(screen.getByRole('button', { name: /下一步/ }))
    await user.click(screen.getByRole('button', { name: /创建模板/ }))

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      deviceTypes: ['server'],
      checkItems: [expect.objectContaining({ name: '数据盘', type: 'snmp', metric: 'disk_usage' })],
    }))
  })

  it('仅填警告阈值时应阻断保存，清空两侧阈值后应移除 threshold 对象', async () => {
    const user = userEvent.setup()
    render(<CreateTemplateWizard onClose={jest.fn()} onSuccess={jest.fn()} />)
    await gotoCheckItemStep(user)

    await user.click(screen.getByRole('button', { name: /添加检查项/ }))
    await user.type(screen.getByPlaceholderText('例如：CPU 使用率'), '内存')
    await user.click(screen.getByRole('combobox', { name: '采集指标' }))
    await user.click(screen.getByRole('option', { name: /磁盘使用率/ }))

    const warningInput = screen.getByLabelText('警告阈值')
    const criticalInput = screen.getByLabelText('严重阈值')

    await user.type(warningInput, '75')
    await user.click(screen.getByRole('button', { name: /下一步/ }))
    expect(screen.getByText('警告阈值和严重阈值需同时填写，或全部留空')).toBeInTheDocument()

    // 填齐后可清空两侧，保存 payload 不含残余空 threshold
    await user.type(criticalInput, '90')
    await user.clear(warningInput)
    await user.clear(criticalInput)
    await user.click(screen.getByRole('button', { name: /下一步/ }))
    await user.click(screen.getByRole('button', { name: /创建模板/ }))

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      checkItems: [
        expect.not.objectContaining({ config: expect.objectContaining({ threshold: expect.anything() }) }),
      ],
    }))
  })

  it('isLowerBoundedMetric 仅对 poe / optical_power / stp_status 返回 true', () => {
    expect(isLowerBoundedMetric('poe')).toBe(true)
    expect(isLowerBoundedMetric('optical_power')).toBe(true)
    expect(isLowerBoundedMetric('stp_status')).toBe(true)
    expect(isLowerBoundedMetric(' PoE ')).toBe(true)
    expect(isLowerBoundedMetric('cpu')).toBe(false)
    expect(isLowerBoundedMetric('flash_usage')).toBe(false)
    expect(isLowerBoundedMetric(undefined)).toBe(false)
  })

  it('下限型指标（PoE/光功率/STP）应提示并校验警告阈值大于严重阈值，常规指标保持小于校验', async () => {
    const user = userEvent.setup()
    render(<CreateTemplateWizard onClose={jest.fn()} onSuccess={jest.fn()} />)
    await gotoCheckItemStep(user)

    await user.click(screen.getByRole('button', { name: /添加检查项/ }))
    await user.type(screen.getByPlaceholderText('例如：CPU 使用率'), 'PoE 供电')

    // 常规态默认提示“警告阈值应小于严重阈值”
    expect(screen.getByText('警告阈值应小于严重阈值')).toBeInTheDocument()

    // 切换为 poe 指标后提示变为反向阈值语义
    await user.click(screen.getByRole('combobox', { name: '采集指标' }))
    await user.click(screen.getByRole('option', { name: /PoE 供电余量/ }))
    expect(screen.getByText('该指标数值越低越危险，警告阈值应大于严重阈值')).toBeInTheDocument()

    const warningInput = screen.getByLabelText('警告阈值')
    const criticalInput = screen.getByLabelText('严重阈值')

    // 反向指标填 warning <= critical 应阻断
    await user.type(warningInput, '10')
    await user.type(criticalInput, '30')
    await user.click(screen.getByRole('button', { name: /下一步/ }))
    expect(screen.getByText('该指标数值越低越危险，警告阈值必须大于严重阈值')).toBeInTheDocument()

    // 改为 warning > critical (30 > 10) 应放行
    await user.clear(warningInput)
    await user.clear(criticalInput)
    await user.type(warningInput, '30')
    await user.type(criticalInput, '10')
    await user.click(screen.getByRole('button', { name: /下一步/ }))
    await user.click(screen.getByRole('button', { name: /创建模板/ }))

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      checkItems: [
        expect.objectContaining({
          metric: 'poe',
          config: expect.objectContaining({ threshold: { warning: 30, critical: 10 } }),
        }),
      ],
    }))
  })

  it('常规指标警告阈值大于等于严重阈值时仍阻断保存', async () => {
    const user = userEvent.setup()
    render(<CreateTemplateWizard onClose={jest.fn()} onSuccess={jest.fn()} />)
    await gotoCheckItemStep(user)

    await user.click(screen.getByRole('button', { name: /添加检查项/ }))
    await user.type(screen.getByPlaceholderText('例如：CPU 使用率'), '系统盘')
    await user.click(screen.getByRole('combobox', { name: '采集指标' }))
    await user.click(screen.getByRole('option', { name: /磁盘使用率/ }))

    await user.type(screen.getByLabelText('警告阈值'), '90')
    await user.type(screen.getByLabelText('严重阈值'), '80')
    await user.click(screen.getByRole('button', { name: /下一步/ }))

    expect(screen.getByText('警告阈值必须小于严重阈值')).toBeInTheDocument()
  })
})
