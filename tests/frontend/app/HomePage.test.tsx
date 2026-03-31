import React from 'react'
import { render, screen } from '@testing-library/react'

import HomePage from '@/app/page'

describe('HomePage', () => {
  it('应展示与登录页一致的测试账号密码提示', () => {
    render(<HomePage />)

    expect(screen.getByText('测试账号：')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('admin123')).toBeInTheDocument()
    expect(screen.queryByText('Admin123!')).not.toBeInTheDocument()
  })
})
