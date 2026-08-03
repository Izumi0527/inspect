/**
 * 日志列表项人话化渲染测试
 *
 * 覆盖本次改造的核心诉求：默认只给人话、原文收起，需要时可就地展开。
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { LogListItem } from '@/features/logs/components/LogListItem'
import type { DeviceLog } from '@/features/logs/types'

const baseLog: DeviceLog = {
  id: 7001,
  device_id: 12,
  device_name: '核心交换机',
  device_ip: '10.0.0.1',
  level: 'warning',
  facility: 'interface',
  source: 'syslog',
  message: '%%01IFNET/4/IF_STATE(l)[0]:Interface GigabitEthernet0/0/1 has turned into DOWN state.',
  raw_message: '<188>Aug  2 10:00:00 core %%01IFNET/4/IF_STATE(l)[0]:Interface GigabitEthernet0/0/1 has turned into DOWN state.',
  source_ip: '10.0.0.1',
  source_process: 'IFNET',
  log_timestamp: '2026-08-02T10:00:00+08:00',
  collected_at: '2026-08-02T10:00:01+08:00',
  created_at: '2026-08-02T10:00:02+08:00',
}

describe('LogListItem 解读展示', () => {
  it('应展示解读结果，并把设备原文隐藏起来', () => {
    const { container } = render(<LogListItem log={baseLog} enableSelection={false} />)

    // 解读结果可见
    expect(screen.getByText('接口链路 Down')).toBeInTheDocument()
    // 接口名保留原始命名并附类型注解
    expect(container.textContent).toContain('GigabitEthernet0/0/1（千兆以太口）')
    expect(container.textContent).toContain('失去网络连通性')

    // 设备原文默认不出现
    expect(container.textContent).not.toContain('IF_STATE')
  })

  it('点击「原文」后应就地展开原始信息，再次点击收起', () => {
    const { container } = render(<LogListItem log={baseLog} enableSelection={false} />)

    const toggle = screen.getByRole('button', { name: '展开日志 7001 的原始信息' })
    fireEvent.click(toggle)
    expect(container.textContent).toContain('IF_STATE')

    fireEvent.click(screen.getByRole('button', { name: '收起日志 7001 的原始信息' }))
    expect(container.textContent).not.toContain('IF_STATE')
  })

  it('点击「原文」不应触发详情回调，避免误开弹窗', () => {
    const onClick = jest.fn()
    render(<LogListItem log={baseLog} enableSelection={false} onClick={onClick} />)

    fireEvent.click(screen.getByRole('button', { name: '展开日志 7001 的原始信息' }))

    expect(onClick).not.toHaveBeenCalled()
  })

  it('无法解析的日志应直接展示原文，而不是把用户晾在无用的兜底文案上', () => {
    const unknownLog: DeviceLog = {
      ...baseLog,
      id: 7002,
      message: '%%01XXX/6/UNKNOWN_EVENT(l)[9]:Custom vendor payload 0x8823.',
      raw_message: undefined,
    }

    const { container } = render(<LogListItem log={unknownLog} enableSelection={false} />)

    expect(container.textContent).toContain('暂无匹配的解析规则')
    expect(container.textContent).toContain('UNKNOWN_EVENT')
  })

  it('级别标签应保持设备上报的原始级别，与筛选器口径一致', () => {
    render(<LogListItem log={baseLog} enableSelection={false} />)

    // 翻译语气为 warning，原始 level 也是 warning，此处断言标签沿用 level 配置
    expect(screen.getByText('警告')).toBeInTheDocument()
  })
})
