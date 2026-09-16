import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { LogFiltersBar } from '@/features/logs/components/LogFiltersBar'

// 本系统自身活动（任务 C）：SSH 轮询设备日志时本系统的登录记录被设备记下再采回，
// 列表默认隐藏这类记录，筛选栏提供勾选框显式包含。

jest.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

jest.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: () => null,
  SelectItem: () => null,
}))

describe('LogFiltersBar 本系统活动开关', () => {
  it('勾选"显示本系统活动"应把 includeSelf 置为 true', () => {
    const onFilterChange = jest.fn()
    render(
      <LogFiltersBar
        filters={{
          searchQuery: '',
          levelFilter: 'all',
          facilityFilter: 'all',
          sourceFilter: 'all',
          includeSelf: false,
        }}
        onFilterChange={onFilterChange}
      />
    )

    const toggle = screen.getByRole('checkbox', { name: '显示本系统活动' })
    expect(toggle).not.toBeChecked()

    fireEvent.click(toggle)
    expect(onFilterChange).toHaveBeenCalledWith('includeSelf', true)
  })

  it('includeSelf 为 true 时开关应处于选中态', () => {
    render(
      <LogFiltersBar
        filters={{
          searchQuery: '',
          levelFilter: 'all',
          facilityFilter: 'all',
          sourceFilter: 'all',
          includeSelf: true,
        }}
        onFilterChange={jest.fn()}
      />
    )

    expect(screen.getByRole('checkbox', { name: '显示本系统活动' })).toBeChecked()
  })
})
