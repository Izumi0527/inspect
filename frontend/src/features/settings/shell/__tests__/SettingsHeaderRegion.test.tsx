import React from 'react'
import { render, screen } from '@testing-library/react'
import { SettingsHeaderRegion } from '../SettingsHeaderRegion'
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
    expect(inlineHeader).toContainElement(screen.getByText('总用户数'))
    expect(inlineHeader).toContainElement(
      screen.getByRole('textbox', { name: '搜索用户' })
    )
    expect(inlineHeader).toContainElement(
      screen.getByRole('button', { name: '添加用户' })
    )
  })
})
