import React from 'react'
import { render, screen } from '@testing-library/react'

import { ReportsView } from '@/features/reports/components/ReportsView'

jest.mock('@/components/layout', () => ({
  AppLayout: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))

jest.mock('@/features/reports/components/InspectionReports', () => ({
  InspectionReports: () => <div>巡检报告内容</div>,
}))

jest.mock('@/features/reports/components/TrendAnalysis', () => ({
  TrendAnalysis: () => <div>趋势分析内容</div>,
}))

jest.mock('@/features/reports/components/StatisticsReports', () => ({
  StatisticsReports: () => <div>统计报表内容</div>,
}))

jest.mock('@/features/reports/components/CustomReports', () => ({
  CustomReports: () => <div>自定义报表内容</div>,
}))

describe('ReportsView 页签样式', () => {
  it('激活页签使用主题变量而不是浅色蓝底类名', () => {
    render(<ReportsView />)

    const activeTab = screen.getByRole('button', { name: /巡检报告/i })
    const inactiveTab = screen.getByRole('button', { name: /趋势分析/i })

    expect(activeTab.className).not.toContain('bg-blue-50')
    expect(activeTab.className).not.toContain('dark:bg-blue-900/20')
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
