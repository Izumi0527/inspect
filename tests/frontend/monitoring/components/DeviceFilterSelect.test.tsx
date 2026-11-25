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
  { id: 8, name: 'SW-03', ipAddress: '10.0.0.3', status: 'online', isMonitored: true },
]

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '设备筛选' }))
  return screen.findByRole('group', { name: '设备筛选' })
}

describe('DeviceFilterSelect（多选草稿 + 关闭提交）', () => {
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
    expect(within(panel).getByRole('checkbox', { name: /SW-03/ })).not.toBeChecked()
    expect(within(panel).getByText('192.168.20.1')).toBeInTheDocument()
    expect(within(panel).getByText('可勾选多台设备，点击空白处完成选择')).toBeInTheDocument()
  })

  it('可连续勾选多台非全选设备且面板保持展开，点击空白处关闭时才一次性提交', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<DeviceFilterSelect deviceIds={[]} onChange={onChange} />)

    const trigger = screen.getByRole('button', { name: '设备筛选' })
    const panel = await openPanel(user)

    await user.click(within(panel).getByRole('checkbox', { name: /核心交换机/ }))
    await user.click(within(panel).getByRole('checkbox', { name: /SW-02/ }))

    // 勾选过程中面板不关闭、不中途提交，且触发器/底部提示实时反馈已选数量
    expect(screen.getByRole('group', { name: '设备筛选' })).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(within(panel).getByRole('checkbox', { name: '全部设备' })).not.toBeChecked()
    expect(within(panel).getByRole('checkbox', { name: /核心交换机/ })).toBeChecked()
    expect(within(panel).getByRole('checkbox', { name: /SW-02/ })).toBeChecked()
    expect(within(panel).getByRole('checkbox', { name: /SW-03/ })).not.toBeChecked()
    expect(trigger).toHaveTextContent('已选 2 台')
    expect(within(panel).getByText('已选 2 台，点击空白处完成选择')).toBeInTheDocument()

    // 点击页面空白处关闭面板，一次性回调最终多选结果
    await user.click(document.body)
    expect(screen.queryByRole('group', { name: '设备筛选' })).not.toBeInTheDocument()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith([6, 7])
  })

  it('在面板中勾选又取消回到原集合后点击空白处，不触发无效提交', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<DeviceFilterSelect deviceIds={[6]} onChange={onChange} />)

    const panel = await openPanel(user)
    await user.click(within(panel).getByRole('checkbox', { name: /SW-02/ }))
    await user.click(within(panel).getByRole('checkbox', { name: /SW-02/ }))

    await user.click(document.body)
    expect(screen.queryByRole('group', { name: '设备筛选' })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('取消最后一台设备或勾选「全部设备」后点击空白处，提交空数组回到全部设备', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    const { unmount } = render(<DeviceFilterSelect deviceIds={[6]} onChange={onChange} />)

    let panel = await openPanel(user)
    await user.click(within(panel).getByRole('checkbox', { name: /核心交换机/ }))
    expect(onChange).not.toHaveBeenCalled()
    await user.click(document.body)
    expect(onChange).toHaveBeenLastCalledWith([])
    unmount()

    onChange.mockReset()
    render(<DeviceFilterSelect deviceIds={[6, 7]} onChange={onChange} />)
    panel = await openPanel(user)
    await user.click(within(panel).getByRole('checkbox', { name: '全部设备' }))
    expect(within(panel).getByRole('checkbox', { name: '全部设备' })).toBeChecked()
    expect(within(panel).getByRole('checkbox', { name: /核心交换机/ })).not.toBeChecked()
    expect(onChange).not.toHaveBeenCalled()
    await user.click(document.body)
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('面板宽度随内容自适应，不再使用固定宽度类', async () => {
    const user = userEvent.setup()
    render(<DeviceFilterSelect deviceIds={[]} onChange={jest.fn()} />)

    const panel = await openPanel(user)
    expect(panel.className).not.toMatch(/\bw-60\b/)
    expect(panel.className).toMatch(/\bw-auto\b/)
  })

  // 设备被删除后 localStorage 里持久化的 deviceIds 仍留着它的 ID：请求会带上已删设备
  // （后端按 device_id 过滤，命中残留的指标行），触发器还会显示「已选 1 台」却无对应项。
  it('设备列表就绪后剔除已不存在的已选 ID', () => {
    const onChange = jest.fn()
    render(<DeviceFilterSelect deviceIds={[6, 999]} onChange={onChange} />)

    expect(onChange).toHaveBeenCalledWith([6])
  })

  it('已选设备全部不存在时回到「全部设备」', () => {
    const onChange = jest.fn()
    render(<DeviceFilterSelect deviceIds={[999]} onChange={onChange} />)

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('已选 ID 全部存在时不回调，不打扰用户选择', () => {
    const onChange = jest.fn()
    render(<DeviceFilterSelect deviceIds={[6, 7]} onChange={onChange} />)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('设备列表加载中不清理，避免把选择误清成「全部设备」', () => {
    mockUseMonitoringDevices.mockReturnValue({ data: undefined, isLoading: true, error: null })
    const onChange = jest.fn()
    render(<DeviceFilterSelect deviceIds={[6]} onChange={onChange} />)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('设备列表加载失败不清理', () => {
    mockUseMonitoringDevices.mockReturnValue({ data: undefined, isLoading: false, error: new Error('boom') })
    const onChange = jest.fn()
    render(<DeviceFilterSelect deviceIds={[6]} onChange={onChange} />)

    expect(onChange).not.toHaveBeenCalled()
  })
})
