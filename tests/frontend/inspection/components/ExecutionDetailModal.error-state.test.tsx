import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as inspectionHooks from '@/features/inspection/hooks/useInspection'
import { ExecutionDetailModal } from '@/features/inspection/components/ExecutionDetailModal'

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

jest.mock('@/features/inspection/hooks/useInspection', () => ({
  useExecutionDetail: jest.fn(),
  useGenerateReport: jest.fn(),
}))

jest.mock('@/components/atoms/modal', () => ({
  SimpleModal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/components/atoms/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe('ExecutionDetailModal 错误态', () => {
  it('错误态渲染时不应输出 framer-motion 未知属性警告', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    ;(inspectionHooks.useExecutionDetail as jest.Mock).mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('执行详情加载失败'),
      refetch: jest.fn(),
    })
    ;(inspectionHooks.useGenerateReport as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
    })

    render(
      <ExecutionDetailModal
        open
        onClose={jest.fn()}
        execution={{
          id: '1',
          strategyId: '10',
          strategyName: '策略A',
          triggerType: 'manual',
          status: 'completed',
          progress: 100,
          totalDevices: 1,
          completedDevices: 1,
          startTime: '2026-04-06T10:00:00Z',
          summary: {
            totalChecks: 1,
            passedChecks: 1,
            failedChecks: 0,
            warningChecks: 0,
            score: 100,
            deviceResults: [],
          },
        }}
      />
    )

    const errorMessages = consoleErrorSpy.mock.calls.flat().join('\n')
    expect(errorMessages).not.toContain('whileHover')
    expect(errorMessages).not.toContain('whileTap')

    consoleErrorSpy.mockRestore()
  })

  it('执行详情加载失败时应展示错误提示，而不是空结果态', () => {
    ;(inspectionHooks.useExecutionDetail as jest.Mock).mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('执行详情加载失败'),
      refetch: jest.fn(),
    })
    ;(inspectionHooks.useGenerateReport as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
    })

    render(
      <ExecutionDetailModal
        open
        onClose={jest.fn()}
        execution={{
          id: '1',
          strategyId: '10',
          strategyName: '策略A',
          triggerType: 'manual',
          status: 'completed',
          progress: 100,
          totalDevices: 1,
          completedDevices: 1,
          startTime: '2026-04-06T10:00:00Z',
          summary: {
            totalChecks: 1,
            passedChecks: 1,
            failedChecks: 0,
            warningChecks: 0,
            score: 100,
            deviceResults: [],
          },
        }}
      />
    )

    expect(screen.getByText('执行详情加载失败')).toBeInTheDocument()
    expect(screen.queryByText('暂无设备巡检结果')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无检查项结果')).not.toBeInTheDocument()
  })

  it('详情加载失败后切到设备详情和检查项标签，应继续显示失败占位', async () => {
    const user = userEvent.setup()

    ;(inspectionHooks.useExecutionDetail as jest.Mock).mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('执行详情加载失败'),
      refetch: jest.fn(),
    })
    ;(inspectionHooks.useGenerateReport as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
    })

    render(
      <ExecutionDetailModal
        open
        onClose={jest.fn()}
        execution={{
          id: '1',
          strategyId: '10',
          strategyName: '策略A',
          triggerType: 'manual',
          status: 'completed',
          progress: 100,
          totalDevices: 1,
          completedDevices: 1,
          startTime: '2026-04-06T10:00:00Z',
          summary: {
            totalChecks: 1,
            passedChecks: 1,
            failedChecks: 0,
            warningChecks: 0,
            score: 100,
            deviceResults: [],
          },
        }}
      />
    )

    await user.click(screen.getByRole('button', { name: '设备详情' }))
    expect(screen.getByText('执行详情加载失败')).toBeInTheDocument()
    expect(screen.queryByText('暂无设备巡检结果')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '检查项' }))
    expect(screen.getByText('执行详情加载失败')).toBeInTheDocument()
    expect(screen.queryByText('暂无检查项结果')).not.toBeInTheDocument()
  })
})
