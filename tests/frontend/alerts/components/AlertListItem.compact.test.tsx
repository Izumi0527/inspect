/**
 * 告警列表项紧凑化渲染测试
 *
 * 列表只保留标题、状态、分类、设备、时间与一行摘要；
 * 处置建议、原文块、原文切换均已交给详情弹窗。
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { AlertListItem } from '@/features/alerts/components/AlertListItem'
import type { Alert } from '@/features/alerts/types'

// 详情弹窗只暴露 open 状态，避免其内容干扰列表层的断言
jest.mock('@/features/alerts/components/AlertDetailModal', () => ({
  AlertDetailModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="alert-detail-modal">detail</div> : null,
}))

const matchedAlert: Alert = {
  id: '3001',
  title: '[WARNING] 核心交换机 - Syslog 接口告警 (IFNET)',
  description: '%%01IFNET/4/IF_STATE(l)[0]:Interface GigabitEthernet0/0/1 has turned into DOWN state.',
  device: '核心交换机',
  severity: 'warning',
  status: 'active',
  timestamp: '2026-08-02T10:00:00+08:00',
  category: 'connectivity',
}

const unmatchedAlert: Alert = {
  id: '3002',
  title: '[CRITICAL] test - 设备离线',
  description: '设备 test (192.168.20.1) 无法连通，ICMP 探测失败',
  device: 'test',
  severity: 'critical',
  status: 'resolved',
  timestamp: '2026-09-19T11:42:29+08:00',
  category: 'connectivity',
}

describe('AlertListItem 紧凑展示', () => {
  it('命中解析规则时应显示一行摘要，不再显示处置建议与原文块', () => {
    const { container } = render(
      <AlertListItem alert={matchedAlert} isSelected={false} onSelect={jest.fn()} />,
    )

    expect(container.textContent).toContain('GigabitEthernet0/0/1（千兆以太口）')
    expect(container.textContent).not.toContain('建议：')
    expect(container.textContent).not.toContain('IF_STATE')
    expect(screen.queryByRole('button', { name: /原始信息/ })).not.toBeInTheDocument()
  })

  it('未命中解析规则时摘要位应显示原文而不是兜底句', () => {
    const { container } = render(
      <AlertListItem alert={unmatchedAlert} isSelected={false} onSelect={jest.fn()} />,
    )

    expect(container.textContent).toContain('设备 test (192.168.20.1) 无法连通，ICMP 探测失败')
    expect(container.textContent).not.toContain('暂无匹配的解析规则')
  })

  it('应保留后端告警标题、设备与时间，用户仍能靠它们识别告警', () => {
    const { container } = render(
      <AlertListItem alert={matchedAlert} isSelected={false} onSelect={jest.fn()} />,
    )

    expect(screen.getByText('[WARNING] 核心交换机 - Syslog 接口告警 (IFNET)')).toBeInTheDocument()
    expect(container.textContent).toContain('核心交换机')
    expect(container.textContent).toContain('2026-08-02 10:00:00')
  })

  it('分类应显示为中文而不是后端英文枚举', () => {
    render(<AlertListItem alert={matchedAlert} isSelected={false} onSelect={jest.fn()} />)

    expect(screen.getByText('网络连通性')).toBeInTheDocument()
    expect(screen.queryByText('connectivity')).not.toBeInTheDocument()
  })

  it('未知分类应原样透传而不是被吞掉', () => {
    const vendorAlert: Alert = { ...matchedAlert, category: 'vendor-custom' }
    render(<AlertListItem alert={vendorAlert} isSelected={false} onSelect={jest.fn()} />)

    expect(screen.getByText('vendor-custom')).toBeInTheDocument()
  })

  it('点击卡片应打开详情弹窗，详细信息在弹窗中查看', () => {
    render(<AlertListItem alert={matchedAlert} isSelected={false} onSelect={jest.fn()} />)

    expect(screen.queryByTestId('alert-detail-modal')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('[WARNING] 核心交换机 - Syslog 接口告警 (IFNET)'))
    expect(screen.getByTestId('alert-detail-modal')).toBeInTheDocument()
  })
})
