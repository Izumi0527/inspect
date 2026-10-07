import React from 'react'
import { render, screen } from '@testing-library/react'
import { SettingsHeaderRegion } from '@/features/settings/shell/SettingsHeaderRegion'
import { Users } from 'lucide-react'

describe('SettingsHeaderRegion', () => {
  it('在 inline 布局下将统计卡片和工具栏收拢到同一行头部区域', () => {
    render(
      <SettingsHeaderRegion
        headerLayout="inline"
        stats={[
          {
            key: 'total',
            title: '总用户数',
            value: 3,
            icon: Users,
          },
        ]}
        toolbar={{
          layout: 'end',
          search: {
            value: '',
            placeholder: '搜索用户名、邮箱...',
            ariaLabel: '搜索用户',
            onChange: jest.fn(),
          },
        }}
        primaryActions={[
          {
            key: 'create-user',
            label: '添加用户',
            onClick: jest.fn(),
          },
        ]}
      />
    )

    const inlineHeader = screen.getByTestId('settings-header-inline')
    // 壳层约定：统计/工具栏头部区域不再绘制底部分隔线
    expect(inlineHeader).not.toHaveClass('border-b')
    expect(inlineHeader).toContainElement(screen.getByText('总用户数'))
    expect(inlineHeader).toContainElement(
      screen.getByRole('textbox', { name: '搜索用户' })
    )
    expect(inlineHeader).toContainElement(
      screen.getByRole('button', { name: '添加用户' })
    )
  })

  it('统计未就绪回退到堆叠分支时，工具栏同样不得绘制底部分隔线', () => {
    const { container } = render(
      <SettingsHeaderRegion
        headerLayout="inline"
        stats={[]}
        toolbar={{
          layout: 'end',
          search: {
            value: '',
            placeholder: '搜索用户名、邮箱...',
            ariaLabel: '搜索用户',
            onChange: jest.fn(),
          },
        }}
      />
    )

    // stats 为空 → 不满足 inline 分支条件，回退到默认堆叠分支
    expect(screen.queryByTestId('settings-header-inline')).toBeNull()
    // 工具栏确实渲染了（否则断言会空跑）
    expect(screen.getByRole('textbox', { name: '搜索用户' })).toBeInTheDocument()
    expect(container.firstElementChild).not.toHaveClass('border-b')
  })
})
