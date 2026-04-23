import React from 'react'
import { render, screen } from '@testing-library/react'
import { ReportsToolbar } from '@/features/reports/components/shared/ReportsToolbar'

describe('ReportsToolbar', () => {
  it('应复刻审计日志页的紧凑搜索框与操作按钮样式', () => {
    render(
      <ReportsToolbar
        search={{
          value: '',
          placeholder: '搜索趋势数据...',
          ariaLabel: '搜索趋势分析',
          onChange: jest.fn(),
        }}
        secondaryActions={[
          {
            key: 'refresh',
            label: '刷新',
            onClick: jest.fn(),
          },
        ]}
        primaryActions={[
          {
            key: 'export',
            label: '导出趋势',
            onClick: jest.fn(),
          },
        ]}
      />
    )

    expect(screen.getByTestId('reports-toolbar-end-group')).toBeInTheDocument()

    const searchInput = screen.getByRole('textbox', { name: '搜索趋势分析' })
    expect(searchInput).toHaveClass('pl-10')
    expect(searchInput).toHaveClass('h-9')
    expect(searchInput).toHaveClass('text-sm')

    expect(screen.getByRole('button', { name: '刷新' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出趋势' })).toBeInTheDocument()
  })
})
