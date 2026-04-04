import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { UserMenu } from '@/features/dashboard/components/UserMenu'

const mockLogout = jest.fn()
const mockPush = jest.fn()
const mockClear = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
}))

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    clear: mockClear,
  }),
}))

jest.mock('@/lib/contexts/auth-context', () => ({
  useAuth: () => ({
    user: {
      full_name: '系统管理员',
      username: 'admin',
      email: 'admin@example.com',
    },
    logout: mockLogout,
  }),
}))

describe('UserMenu', () => {
  beforeEach(() => {
    mockLogout.mockResolvedValue(undefined)
    mockPush.mockClear()
    mockClear.mockClear()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('点击退出登录仅调用 logout，不应在菜单内重复 push，并应清理查询缓存', async () => {
    const user = userEvent.setup()
    render(<UserMenu />)

    await user.click(screen.getByRole('button'))
    await user.click(screen.getByText('退出登录'))

    expect(mockLogout).toHaveBeenCalledTimes(1)
    expect(mockClear).toHaveBeenCalledTimes(1)
    expect(mockPush).not.toHaveBeenCalled()
  })
})

