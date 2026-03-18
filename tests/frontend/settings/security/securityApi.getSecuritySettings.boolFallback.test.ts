const mockGet = jest.fn()

jest.mock('@/lib/api-client', () => ({
  httpClient: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

import { securityApi } from '@/features/settings/api/security.api'

describe('securityApi.getSecuritySettings 布尔回退', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('后端返回 false 时不应被 || true 覆盖', async () => {
    mockGet.mockResolvedValue({
      items: [
        {
          key: 'security.session.auto_logout_enabled',
          value: false,
          category: 'security',
        },
      ],
      total: 1,
    })

    const result = await securityApi.getSecuritySettings()

    expect(result.sessionManagement.autoLogoutEnabled).toBe(false)
  })
})

