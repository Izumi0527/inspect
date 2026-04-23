import React from 'react'
import { render, screen } from '@testing-library/react'
import { SettingsToolbar } from '../SettingsToolbar'

describe('SettingsToolbar', () => {
  it('在 start 布局下将搜索框和主按钮收拢到同一左侧操作区', () => {
    render(
      <SettingsToolbar
        toolbar={
          {
            layout: 'start',
            search: {
              value: '',
              placeholder: '搜索用户名、邮箱...',
              ariaLabel: '搜索用户',
              onChange: jest.fn(),
            },
          } as never
        }
        primaryActions={[
          {
            key: 'create-user',
            label: '添加用户',
            onClick: jest.fn(),
          },
        ]}
      />
    )

    const startGroup = screen.getByTestId('settings-toolbar-start-group')
    expect(startGroup).toContainElement(
      screen.getByRole('textbox', { name: '搜索用户' })
    )
    expect(startGroup).toContainElement(
      screen.getByRole('button', { name: '添加用户' })
    )
  })

  it('在 end 布局下将搜索框和主按钮收拢到同一右侧操作区', () => {
    render(
      <SettingsToolbar
        toolbar={
          {
            layout: 'end',
            search: {
              value: '',
              placeholder: '搜索用户名、邮箱...',
              ariaLabel: '搜索用户',
              onChange: jest.fn(),
            },
          } as never
        }
        primaryActions={[
          {
            key: 'create-user',
            label: '添加用户',
            onClick: jest.fn(),
          },
        ]}
      />
    )

    const endGroup = screen.getByTestId('settings-toolbar-end-group')
    expect(endGroup).toContainElement(
      screen.getByRole('textbox', { name: '搜索用户' })
    )
    expect(endGroup).toContainElement(
      screen.getByRole('button', { name: '添加用户' })
    )
  })
})
