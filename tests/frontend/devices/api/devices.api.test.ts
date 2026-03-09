import { fetchDevice, fetchDevices } from '@/features/devices/api/devices.api'

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

  it('设备列表未返回性能字段时，不应默认补成 0，避免伪造 0.0% 采样值', async () => {
    mockGet.mockResolvedValueOnce({
      devices: [
        {
          id: 3,
          name: 'edge-03',
          ip_address: '10.0.0.3',
          device_type: 'router',
          status: 'online',
        },
      ],
      total: 1,
      page: 1,
      page_size: 10,
    })

    const result = await fetchDevices({ page: 1, page_size: 10 })

    expect(result.devices[0]?.cpu_usage).toBeUndefined()
    expect(result.devices[0]?.memory_usage).toBeUndefined()
  })

  it('设备详情应保留 snmp_port 到 snmp_config.port，并移除响应中的敏感字段', async () => {
    mockGet.mockResolvedValueOnce({
      id: 7,
      name: 'edge-01',
      ip_address: '10.0.0.7',
      device_type: 'router',
      status: 'online',
      snmp_port: 1161,
      tags: {
        cli_config: {
          ssh_config: {
            username: 'netops',
            password: 'secret-password',
            private_key: 'PRIVATE-KEY-DATA',
            port: 2222,
            password_configured: true,
            private_key_configured: true,
          },
        },
        snmp_config: {
          version: 'v2c',
          port: 1161,
          v2c_config: {
            community: 'secret-community',
            write_community: 'write-secret',
            community_configured: true,
            write_community_configured: true,
          },
        },
      },
    })

    const result = await fetchDevice(7)

    expect(result?.snmp_config?.port).toBe(1161)
    expect(result?.ssh_config?.password).toBe('')
    expect((result?.tags as Record<string, any>)?.cli_config?.ssh_config?.password).toBeUndefined()
    expect((result?.tags as Record<string, any>)?.snmp_config?.v2c_config?.community).toBeUndefined()
  })
})

