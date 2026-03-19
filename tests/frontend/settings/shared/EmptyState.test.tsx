import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { EmptyState } from '@/features/settings/components/shared/EmptyState'

describe('EmptyState', () => {
  it('action 按钮应为 type="button" 且可点击触发回调', async () => {
    const user = userEvent.setup()
    const onClick = jest.fn()

    render(
      <EmptyState
        title="暂无数据"
        description="请稍后重试"
        action={{ label: '重试', onClick }}
      />
    )

    const button = screen.getByRole('button', { name: '重试' })
    expect(button).toHaveAttribute('type', 'button')

    await user.click(button)
    expect(onClick).toHaveBeenCalled()
  })

  it('图标应为纯装饰，避免被读屏器当作可见内容', () => {
    const { container } = render(<EmptyState title="暂无数据" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })
})
