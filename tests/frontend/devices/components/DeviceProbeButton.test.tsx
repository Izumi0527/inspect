import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { DeviceProbeButton } from '@/features/devices/components/DeviceProbeButton'
import type { DeviceProbeResult } from '@/features/devices/types'

const mockProbeDevice = jest.fn()
const mockToastSuccess = jest.fn()
const mockToastError = jest.fn()

jest.mock('@/features/devices/api/devices.api', () => ({
  probeDevice: (...args: unknown[]) => mockProbeDevice(...args),
}))

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

const baseResult: DeviceProbeResult = {
  device_id: 7,
  ip_address: '10.0.0.7',
  icmp_reachable: true,
  icmp_response_time: 1.2,
  snmp_reachable: true,
  snmp_response_time: 8.5,
  probed_at: '2026-09-03T00:00:00Z',
}

const clickProbe = () => {
  fireEvent.click(screen.getByRole('button', { name: /探测设备 core-sw 的连接状态/ }))
}

describe('DeviceProbeButton 探测结果反馈', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('ICMP 离线时 toast 附带后端返回的 icmp_error 首行，便于直接看到失败原因', async () => {
    mockProbeDevice.mockResolvedValueOnce({
      ...baseResult,
      icmp_reachable: false,
      icmp_response_time: undefined,
      icmp_error:
        'ping: socket: Operation not permitted\nping: => missing cap_net_raw+p capability or setuid?',
    })

    render(<DeviceProbeButton deviceId={7} deviceName="core-sw" />)
    clickProbe()

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledTimes(1))
    const message = String(mockToastSuccess.mock.calls[0][0])
    expect(message).toContain('ICMP: 离线')
    expect(message).toContain('ping: socket: Operation not permitted')
    // 只取首行：第二行是 ping 的补充提示，塞进 toast 会把关键信息挤出可视区
    expect(message).not.toContain('missing cap_net_raw')
  })

  it('SNMP 失败时 toast 附带 snmp_error', async () => {
    mockProbeDevice.mockResolvedValueOnce({
      ...baseResult,
      snmp_reachable: false,
      snmp_response_time: 15003,
      snmp_error: 'request timeout (after 2 retries)',
    })

    render(<DeviceProbeButton deviceId={7} deviceName="core-sw" />)
    clickProbe()

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledTimes(1))
    const message = String(mockToastSuccess.mock.calls[0][0])
    expect(message).toContain('SNMP: 失败')
    expect(message).toContain('request timeout (after 2 retries)')
  })

  it('过长的错误文本截断到 80 字符，避免 toast 被撑爆', async () => {
    const longError = 'x'.repeat(200)
    mockProbeDevice.mockResolvedValueOnce({
      ...baseResult,
      icmp_reachable: false,
      icmp_error: longError,
    })

    render(<DeviceProbeButton deviceId={7} deviceName="core-sw" />)
    clickProbe()

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledTimes(1))
    const message = String(mockToastSuccess.mock.calls[0][0])
    expect(message).not.toContain(longError)
    expect(message).toContain('x'.repeat(80))
    expect(message).toContain('…')
  })

  it('探测全部成功时 toast 不出现原因分隔符', async () => {
    mockProbeDevice.mockResolvedValueOnce({ ...baseResult })

    render(<DeviceProbeButton deviceId={7} deviceName="core-sw" />)
    clickProbe()

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledTimes(1))
    const message = String(mockToastSuccess.mock.calls[0][0])
    expect(message).toContain('ICMP: 在线 (1.2ms)')
    expect(message).toContain('SNMP: 成功 (8.5ms)')
    expect(message).not.toContain('—')
  })

  it('结果图标的 title 同样携带失败原因', async () => {
    mockProbeDevice.mockResolvedValueOnce({
      ...baseResult,
      icmp_reachable: false,
      icmp_error: 'ping: socket: Operation not permitted',
      snmp_reachable: false,
      snmp_error: 'request timeout (after 2 retries)',
    })

    render(<DeviceProbeButton deviceId={7} deviceName="core-sw" />)
    clickProbe()

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledTimes(1))
    expect(screen.getByTitle(/ICMP 离线.*Operation not permitted/)).toBeInTheDocument()
    expect(screen.getByTitle(/SNMP 失败.*request timeout/)).toBeInTheDocument()
  })
})
