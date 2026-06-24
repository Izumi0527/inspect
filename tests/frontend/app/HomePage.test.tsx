import React from 'react'
import { render, screen } from '@testing-library/react'

import HomePage from '@/app/page'

describe('HomePage', () => {
  it('不应在公开首页暴露默认账号或固定口令', () => {
    render(<HomePage />)

    expect(screen.queryByText('admin123')).not.toBeInTheDocument()
    expect(screen.queryByText(/测试账号/)).not.toBeInTheDocument()
  })
})
