import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeviceFilterSelect } from '@/features/monitoring/components/shared/DeviceFilterSelect'
import type { MonitoringDeviceOption } from '@/features/monitoring/types'

const mockUseMonitoringDevices = jest.fn()

jest.mock('@/features/monitoring/hooks/useMonitoringDevices', () => ({
  useMonitoringDevices: () => mockUseMonitoringDevices(),
}))

const devices: MonitoringDeviceOption[] = [
  { id: 6, name: '核心交换机', ipAddress: '192.168.20.1', status: 'online', isMonitored: true },
  { id: 7, name: 'SW-02', ipAddress: '10.0.0.2', status: 'offline', isMonitored: true },
]

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '设备筛选' }))
  return screen.findByRole('group', { name: '设备筛选' })
}

describe('DeviceFilterSelect（勾选框列表）', () => {
  beforeEach(() => {
    mockUseMonitoringDevices.mockReturnValue({ data: devices, isLoading: false, error: null })
  })

  it('每台设备与「全部设备」前都有勾选框；未筛选时只有「全部设备」被勾选', async () => {
    const user = userEvent.setup()
    render(<DeviceFilterSelect deviceIds={[]} onChange={jest.fn()} />)

    const panel = await openPanel(user)

    expect(within(panel).getByRole('checkbox', { name: '全部设备' })).toBeChecked()
    expect(within(panel).getByRole('checkbox', { name: /核心交换机/ })).not.toBeChecked()
    expect(within(panel).getByRole('checkbox', { name: /SW-02/ })).not.toBeChecked()
    expect(within(panel).getByText('192.168.20.1')).toBeInTheDocument()
  })

  it('勾选设备后回调该设备 ID；已筛选时「全部设备」不再勾选', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    const { rerender } = render(<DeviceFilterSelect deviceIds={[]} onChange={onChange} />)

    const panel = await openPanel(user)
    await user.click(within(panel).getByRole('checkbox', { name: /核心交换机/ }))
    expect(onChange).toHaveBeenCalledWith([6])

    rerender(<DeviceFilterSelect deviceIds={[6]} onChange={onChange} />)
    expect(within(panel).getByRole('checkbox', { name: '全部设备' })).not.toBeChecked()
    expect(within(panel).getByRole('checkbox', { name: /核心交换机/ })).toBeChecked()
  })

  it('取消最后一台设备或勾选「全部设备」都回到空筛选', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<DeviceFilterSelect deviceIds={[6]} onChange={onChange} />)

    const panel = await openPanel(user)
    await user.click(within(panel).getByRole('checkbox', { name: /核心交换机/ }))
    expect(onChange).toHaveBeenLastCalledWith([])

    await user.click(within(panel).getByRole('checkbox', { name: '全部设备' }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('面板宽度随内容自适应，不再使用固定宽度类', async () => {
    const user = userEvent.setup()
    render(<DeviceFilterSelect deviceIds={[]} onChange={jest.fn()} />)

    const panel = await openPanel(user)
    expect(panel.className).not.toMatch(/\bw-60\b/)
    expect(panel.className).toMatch(/\bw-auto\b/)
  })
})
