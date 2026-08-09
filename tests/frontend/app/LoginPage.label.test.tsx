/**
 * 登录表单标签关联回归测试
 *
 * 背景：「记住我」复选框漏写 id，而其 <label htmlFor="remember_me"> 指向该 id，
 * 导致 for 失联。后果不止是 a11y 告警——点击「记住我」文字无法切换勾选状态，
 * 屏幕阅读器读不出关联，浏览器自动填充也可能失效。
 *
 * getByLabelText 正是按 label→控件的关联来定位元素，关联断裂时会直接抛错，
 * 因此可作为该缺陷的精确护栏。
 */
import React from 'react'
import { render, screen } from '@testing-library/react'

jest.mock('@/lib/contexts/auth-context', () => ({
  useAuth: () => ({
    login: jest.fn(),
    isLoading: false,
    error: null,
    clearError: jest.fn(),
  }),
  // 本用例聚焦表单本体，访客守卫直接透传
  withGuest: (Component: unknown) => Component,
}))

import LoginPage from '@/app/(auth)/login/page'

describe('登录表单标签关联', () => {
  it('「记住我」复选框必须能通过其可见标签定位', () => {
    render(<LoginPage />)

    expect(screen.getByLabelText('记住我')).toHaveAttribute('type', 'checkbox')
  })

  it('用户名与密码输入框同样应可通过标签定位', () => {
    render(<LoginPage />)

    expect(screen.getByLabelText('用户名')).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText('密码')).toBeInTheDocument()
  })
})
