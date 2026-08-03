/**
 * 告警列表项人话化渲染测试
 *
 * 覆盖：人话摘要与处置建议、分类中文化、原文默认隐藏与就地展开。
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { AlertListItem } from '@/features/alerts/components/AlertListItem'
import type { Alert } from '@/features/alerts/types'

// 详情弹窗会把原文一并渲染进 DOM，干扰「原文默认隐藏」的断言，故隔离
jest.mock('@/features/alerts/components/AlertDetailModal', () => ({
  AlertDetailModal: () => null,
}))

const baseAlert: Alert = {
  id: '3001',
  title: '[WARNING] 核心交换机 - Syslog 接口告警 (IFNET)',
  description: '%%01IFNET/4/IF_STATE(l)[0]:Interface GigabitEthernet0/0/1 has turned into DOWN state.',
  device: '核心交换机',
  severity: 'warning',
  status: 'active',
  timestamp: '2026-08-02T10:00:00+08:00',
  category: 'connectivity',
}

describe('AlertListItem 解读展示', () => {
  it('应展示解读摘要与处置建议，并隐藏设备原文', () => {
    const { container } = render(
      <AlertListItem alert={baseAlert} isSelected={false} onSelect={jest.fn()} />,
    )

    // 接口名保留原始命名并附类型注解
    expect(container.textContent).toContain('GigabitEthernet0/0/1（千兆以太口）')
    expect(container.textContent).toContain('建议：')
    expect(container.textContent).toContain('display interface')

    // 原文默认不出现
    expect(container.textContent).not.toContain('IF_STATE')
  })

  it('应保留后端告警标题，用户仍能靠它识别告警', () => {
    render(<AlertListItem alert={baseAlert} isSelected={false} onSelect={jest.fn()} />)

    expect(
      screen.getByText('[WARNING] 核心交换机 - Syslog 接口告警 (IFNET)'),
    ).toBeInTheDocument()
  })

  it('分类应显示为中文而不是后端英文枚举', () => {
    render(<AlertListItem alert={baseAlert} isSelected={false} onSelect={jest.fn()} />)

    expect(screen.getByText('网络连通性')).toBeInTheDocument()
    expect(screen.queryByText('connectivity')).not.toBeInTheDocument()
  })

  it('点击「原文」应就地展开原始告警信息', () => {
    const { container } = render(
      <AlertListItem alert={baseAlert} isSelected={false} onSelect={jest.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: '展开告警 3001 的原始信息' }))

    expect(container.textContent).toContain('IF_STATE')
  })

  it('未知分类应原样透传而不是被吞掉', () => {
    const vendorAlert: Alert = { ...baseAlert, category: 'vendor-custom' }
    render(<AlertListItem alert={vendorAlert} isSelected={false} onSelect={jest.fn()} />)

    expect(screen.getByText('vendor-custom')).toBeInTheDocument()
  })
})
