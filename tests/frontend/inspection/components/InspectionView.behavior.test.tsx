import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as inspectionHooks from '@/features/inspection/hooks/useInspection'
import { InspectionView } from '@/features/inspection/components/InspectionView'

jest.mock('framer-motion', () => ({
  motion: {
    button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...props}>{children}</button>,
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}))

jest.mock('@/features/inspection/hooks/useInspection', () => ({
  useInspectionStats: jest.fn(),
}))

jest.mock('@/components/layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/components/shared', () => ({
  CompactStatCard: ({ title, value }: { title: string; value: string | number }) => (
    <div>
      <span>{title}</span>
      <span>{value}</span>
    </div>
  ),
}))

jest.mock('@/components/atoms', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: React.MouseEventHandler<HTMLButtonElement> }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
}))

jest.mock('@/features/inspection/components/InspectionStrategies', () => {
  const React = require('react') as typeof import('react')
  return {
    InspectionStrategies: () => {
      const [count, setCount] = React.useState(0)
      return (
        <button type="button" onClick={() => setCount((value: number) => value + 1)}>
          {`策略局部状态 ${count}`}
        </button>
      )
    },
  }
})

jest.mock('@/features/inspection/components/InspectionTemplates', () => ({
  InspectionTemplates: () => <div>InspectionTemplates</div>,
}))

jest.mock('@/features/inspection/components/InspectionExecutions', () => ({
  InspectionExecutions: () => <div>InspectionExecutions</div>,
}))

jest.mock('@/features/inspection/components/InspectionAnalytics', () => ({
  InspectionAnalytics: () => <div>InspectionAnalytics</div>,
}))

describe('InspectionView 行为', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('统计接口失败时应展示错误提示和重试入口', async () => {
    const user = userEvent.setup()
    const refetch = jest.fn()

    ;(inspectionHooks.useInspectionStats as jest.Mock).mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('统计加载失败'),
      refetch,
    })

    render(<InspectionView />)

    expect(screen.getByText('统计加载失败')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重试统计' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('切换标签后应保留子页本地状态，而不是重置组件', async () => {
    const user = userEvent.setup()

    ;(inspectionHooks.useInspectionStats as jest.Mock).mockReturnValue({
      data: {
        totalStrategies: 8,
        activeStrategies: 5,
        executionCount: 12,
        successRate: 98,
        avgScore: 91.5,
        changes: {
          executionsChange: '+3.0%',
          successRateChange: '+1.0%',
          avgScoreChange: '+1.0%',
          strategiesChange: '0',
        },
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    render(<InspectionView />)

    await user.click(screen.getByRole('button', { name: '策略局部状态 0' }))
    expect(screen.getByRole('button', { name: '策略局部状态 1' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '巡检模板' }))
    await user.click(screen.getByRole('button', { name: '巡检策略' }))

    expect(screen.getByRole('button', { name: '策略局部状态 1' })).toBeInTheDocument()
  })
})
