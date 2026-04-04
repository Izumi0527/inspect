import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { QuickActionsCard } from '@/features/dashboard/components/QuickActionsCard'
import { Permission } from '@/lib/types/auth.types'

const mockPush = jest.fn()
const mockUsePermission = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
}))

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: (permission: Permission) => mockUsePermission(permission),
}))

describe('QuickActionsCard', () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockUsePermission.mockImplementation(() => true)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it.each([
    ['设备扫描', 'deviceScan', '/devices'],
    ['手动巡检', 'manualInspection', '/inspection'],
    ['生成报表', 'generateReport', '/reports'],
    ['系统配置', 'systemConfig', '/settings'],
  ])('点击%s应只跳转到目标模块，不在首页直接触发后台动作', async (buttonText, _actionKey, targetPath) => {
    const user = userEvent.setup()

    render(<QuickActionsCard />)

    await user.click(screen.getByRole('button', { name: buttonText }))

    expect(mockPush).toHaveBeenCalledWith(targetPath)
  })

  it('应按权限隐藏当前账号不可进入的快捷入口', () => {
    mockUsePermission.mockImplementation((permission: Permission) => permission === Permission.REPORTS_READ)

    render(<QuickActionsCard />)

    expect(screen.getByRole('button', { name: '生成报表' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '设备扫描' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '手动巡检' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '系统配置' })).not.toBeInTheDocument()
  })

  it('当没有任何可用快捷入口时应展示明确空状态', () => {
    mockUsePermission.mockImplementation(() => false)

    render(<QuickActionsCard />)

    expect(screen.getByText('当前账号暂无可用快捷入口')).toBeInTheDocument()
  })
})
