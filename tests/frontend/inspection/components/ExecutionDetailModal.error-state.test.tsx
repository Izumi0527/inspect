import React from 'react'
import { render, screen } from '@testing-library/react'
import * as inspectionHooks from '@/features/inspection/hooks/useInspection'
import { ExecutionDetailModal } from '@/features/inspection/components/ExecutionDetailModal'

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...props}>{children}</button>,
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
})
