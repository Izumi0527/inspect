import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { QuickActionsCard } from '@/features/dashboard/components/QuickActionsCard'

const mockPush = jest.fn()
const mockExecuteAction = jest.fn()
const mockUseQuickActions = jest.fn()

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

jest.mock('@/features/dashboard/hooks/useDashboard', () => ({
  useQuickActions: () => mockUseQuickActions(),
}))

describe('QuickActionsCard', () => {
  beforeEach(() => {
    mockUseQuickActions.mockReturnValue({
      loading: {},
      error: null,
      executeAction: mockExecuteAction,
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it.each([
    ['设备扫描', 'deviceScan', '/devices'],
    ['手动巡检', 'manualInspection', '/inspection'],
    ['生成报表', 'generateReport', '/reports'],
    ['系统配置', 'systemConfig', '/settings'],
  ])('点击%s应触发动作并跳转到目标模块', async (buttonText, actionKey, targetPath) => {
    const user = userEvent.setup()
    mockExecuteAction.mockResolvedValueOnce(undefined)

    render(<QuickActionsCard />)

    await user.click(screen.getByRole('button', { name: buttonText }))

    expect(mockExecuteAction).toHaveBeenCalledWith(actionKey)
    expect(mockPush).toHaveBeenCalledWith(targetPath)
  })

  it('动作执行失败时仍应完成跳转', async () => {
    const user = userEvent.setup()
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockExecuteAction.mockRejectedValueOnce(new Error('执行失败'))

    render(<QuickActionsCard />)

    await user.click(screen.getByRole('button', { name: '设备扫描' }))

    expect(mockPush).toHaveBeenCalledWith('/devices')
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    consoleErrorSpy.mockRestore()
  })
})
