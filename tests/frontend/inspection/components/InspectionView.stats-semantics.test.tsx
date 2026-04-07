import React from 'react'
import { render, screen } from '@testing-library/react'
import * as inspectionHooks from '@/features/inspection/hooks/useInspection'
import { InspectionView } from '@/features/inspection/components/InspectionView'

jest.mock('framer-motion', () => ({
  motion: {
    button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...props}>{children}</button>,
    div: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
}))

jest.mock('@/features/inspection/components/InspectionStrategies', () => ({
  InspectionStrategies: () => <div>InspectionStrategies</div>,
}))

jest.mock('@/features/inspection/components/InspectionTemplates', () => ({
  InspectionTemplates: () => <div>InspectionTemplates</div>,
}))

jest.mock('@/features/inspection/components/InspectionExecutions', () => ({
  InspectionExecutions: () => <div>InspectionExecutions</div>,
}))

jest.mock('@/features/inspection/components/InspectionAnalytics', () => ({
  InspectionAnalytics: () => <div>InspectionAnalytics</div>,
}))

describe('InspectionView 统计语义', () => {
  it('总览卡片应展示执行次数而不是今日执行', () => {
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
    })

    render(<InspectionView />)

    expect(screen.getByText('执行次数')).toBeInTheDocument()
    expect(screen.queryByText('今日执行')).not.toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })
})
