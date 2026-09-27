import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuickTemplateCreate } from '@/features/inspection/components/QuickTemplateCreate'
import * as inspectionHooks from '@/features/inspection/hooks/useInspection'

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className }: React.HTMLAttributes<HTMLDivElement>) => <div className={className}>{children}</div>,
  },
}))

jest.mock('@/features/inspection/hooks/useInspection', () => ({
  useInspectionTemplates: jest.fn(),
  useCloneTemplate: jest.fn(),
}))

const builtInTemplates = [
  {
    id: '11', name: '交换机巡检', description: '面向接入、汇聚与核心交换机', category: 'network',
    deviceTypes: ['switch'], isBuiltIn: true, isActive: true, createdAt: '', updatedAt: '',
    checkItems: [
      { id: 'connectivity', name: '设备连通性', type: 'ping', weight: 8, config: {} },
      { id: 'poe_status', name: 'PoE 供电余量', type: 'snmp', metric: 'poe', weight: 6, config: {} },
    ],
  },
  {
    id: '14', name: '服务器巡检', description: '面向 Linux / Windows 服务器', category: 'system',
    deviceTypes: ['server'], isBuiltIn: true, isActive: true, createdAt: '', updatedAt: '',
    checkItems: [{ id: 'disk_usage', name: '磁盘使用率', type: 'snmp', metric: 'disk_usage', weight: 10, config: {} }],
  },
]

// 快速创建不再在前端硬编码预设：预设即后端内置模板，基于它复制出自建模板，
// 检查项与内置模板永远一致，新增检查项时前端无需同步。
describe('QuickTemplateCreate', () => {
  const clone = jest.fn()

  beforeEach(() => {
    clone.mockResolvedValue({})
    ;(inspectionHooks.useInspectionTemplates as jest.Mock).mockReturnValue({
      data: { templates: builtInTemplates }, isLoading: false,
    })
    ;(inspectionHooks.useCloneTemplate as jest.Mock).mockReturnValue({ mutateAsync: clone, isPending: false })
  })

  it('只列出后端内置模板，并用中文标出适用设备类型', () => {
    render(<QuickTemplateCreate onClose={jest.fn()} onSuccess={jest.fn()} />)

    expect(inspectionHooks.useInspectionTemplates).toHaveBeenCalledWith(expect.objectContaining({ isBuiltIn: true }))
    expect(screen.getByText('交换机巡检')).toBeInTheDocument()
    expect(screen.getByText('服务器巡检')).toBeInTheDocument()
    expect(screen.getByText('交换机')).toBeInTheDocument()
    expect(screen.getByText('服务器')).toBeInTheDocument()
    expect(screen.queryByText('switch')).not.toBeInTheDocument()
  })

  it('选中后改名，调用复制接口生成自建模板', async () => {
    const user = userEvent.setup()
    const onSuccess = jest.fn()
    render(<QuickTemplateCreate onClose={jest.fn()} onSuccess={onSuccess} />)

    await user.click(screen.getByRole('button', { name: /服务器巡检/ }))
    const nameInput = screen.getByPlaceholderText('输入模板名称')
    expect(nameInput).toHaveValue('服务器巡检（副本）')
    await user.clear(nameInput)
    await user.type(nameInput, '数据库服务器巡检')
    await user.click(screen.getByRole('button', { name: '创建模板' }))

    expect(clone).toHaveBeenCalledWith({ id: '14', name: '数据库服务器巡检' })
    expect(onSuccess).toHaveBeenCalled()
  })
})
