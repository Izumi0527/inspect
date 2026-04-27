import React from 'react'
import { render, screen } from '@testing-library/react'

import { InspectionView } from '@/features/inspection/components/InspectionView'

jest.mock('@/components/layout', () => ({
  AppLayout: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))

jest.mock('@/features/inspection/hooks/useInspection', () => ({
  useInspectionStats: () => ({
    data: null,
    isLoading: true,
    error: null,
    refetch: jest.fn(),
  }),
}))

jest.mock('@/features/inspection/components/InspectionStrategies', () => ({
  InspectionStrategies: () => <div>策略内容</div>,
}))

jest.mock('@/features/inspection/components/InspectionTemplates', () => ({
  InspectionTemplates: () => <div>模板内容</div>,
}))

jest.mock('@/features/inspection/components/InspectionExecutions', () => ({
  InspectionExecutions: () => <div>执行内容</div>,
}))

jest.mock('@/features/inspection/components/InspectionAnalytics', () => ({
  InspectionAnalytics: () => <div>分析内容</div>,
}))

describe('InspectionView 页签样式', () => {
  it('激活页签使用主题变量而不是浅色蓝底类名', () => {
    render(<InspectionView />)

    const activeTab = screen.getByRole('button', { name: /巡检策略/i })
    const inactiveTab = screen.getByRole('button', { name: /巡检模板/i })

    expect(activeTab.className).not.toContain('bg-blue-50')
    expect(activeTab.className).not.toContain('dark:bg-blue-900/30')
    expect(activeTab.className).not.toContain('text-blue-600')
    expect(activeTab.className).not.toContain('dark:text-blue-400')
    expect(activeTab.className).toContain('bg-primary/10')
    expect(activeTab.className).toContain('dark:bg-primary/12')
    expect(activeTab.className).toContain('text-primary')

    expect(inactiveTab.className).not.toContain('hover:text-blue-600')
    expect(inactiveTab.className).not.toContain('dark:hover:text-blue-400')
    expect(inactiveTab.className).toContain('hover:bg-muted/40')
    expect(inactiveTab.className).toContain('hover:text-foreground')
  })
})
