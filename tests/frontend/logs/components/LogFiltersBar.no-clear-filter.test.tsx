import React from 'react'
import { render, screen } from '@testing-library/react'
import { LogFiltersBar } from '@/features/logs/components/LogFiltersBar'

// Radix Select 依赖 jsdom 缺失的指针/尺寸 API，此处仅需静态渲染，故替换为最简实现。
jest.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" role="combobox" {...props}>
      {children}
    </button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <>{placeholder ?? null}</>,
  SelectContent: () => null,
  SelectItem: () => null,
}))

describe('LogFiltersBar 清除过滤按钮', () => {
  it('筛选条件激活时不应渲染清除过滤按钮', () => {
    render(
      <LogFiltersBar
        filters={{
          searchQuery: 'login',
          levelFilter: 'error',
          facilityFilter: 'security',
          sourceFilter: 'syslog',
        }}
        onFilterChange={jest.fn()}
        renderAsToolbar
      />
    )

    expect(screen.queryByRole('button', { name: /清除过滤/ })).toBeNull()
    expect(screen.queryByText('清除过滤')).toBeNull()
  })
})
