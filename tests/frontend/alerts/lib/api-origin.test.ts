describe('api-client getApiOrigin / getApiBaseUrl', () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = originalApiUrl
    jest.resetModules()
  })

  it('当 NEXT_PUBLIC_API_URL 包含 /api/v1 时，应剥离为 origin', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://example.com/api/v1'

    const { getApiOrigin, getApiBaseUrl } = await import('@/lib/api-client')

    expect(getApiOrigin()).toBe('https://example.com')
    expect(getApiBaseUrl()).toBe('https://example.com/api/v1')
  })

  it('当 NEXT_PUBLIC_API_URL 重复拼接 /api/v1 时，也应返回正确 origin', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://example.com/api/v1/api/v1/'

    const { getApiOrigin } = await import('@/lib/api-client')

    expect(getApiOrigin()).toBe('https://example.com')
  })
})

