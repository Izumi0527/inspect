import { fetchDevices } from '@/features/devices/api/devices.api'

const mockGet = jest.fn()

jest.mock('@/lib/api-client', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
  },
  ApiClientError: class ApiClientError extends Error {},
}))

describe('devices.api fetchDevices', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('后端返回 device_type=ap 时应映射为 wireless_ap', async () => {
    mockGet.mockResolvedValueOnce({
      devices: [
        {
          id: 1,
          name: 'ap-01',
          ip_address: '192.168.1.10',
          device_type: 'ap',
          status: 'online',
        },
      ],
      total: 1,
      page: 1,
      page_size: 10,
    })

    const result = await fetchDevices({ page: 1, page_size: 10 })

    expect(result.total).toBe(1)
    expect(result.devices[0]?.device_type).toBe('wireless_ap')
  })

  it('筛选 device_type=wireless_ap 时应请求后端 device_type=ap', async () => {
    mockGet.mockResolvedValueOnce({
      devices: [],
      total: 0,
      page: 1,
      page_size: 10,
    })

    await fetchDevices({ device_type: 'wireless_ap', page: 1, page_size: 10 })

    expect(mockGet).toHaveBeenCalledWith('/devices?device_type=ap&page=1&page_size=10')
  })
})

