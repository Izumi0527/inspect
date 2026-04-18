import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { LogListItem } from '@/features/logs/components/LogListItem'
import type { DeviceLog } from '@/features/logs/types'

const sampleLog: DeviceLog = {
  id: 9001,
  device_id: 101,
  device_name: 'Chrome日志测试设备',
  device_ip: '10.0.0.8',
  level: 'error',
  facility: 'system',
  source: 'manual',
  message: 'Chrome MCP 自动化测试日志：删除按钮可访问性验证',
  raw_message: '<34>Apr 18 20:30:00 inspect test message',
  source_ip: '127.0.0.1',
  source_process: 'chrome-mcp',
  log_timestamp: '2026-04-18T20:30:00+08:00',
  collected_at: '2026-04-18T20:30:01+08:00',
  created_at: '2026-04-18T20:30:02+08:00',
}

describe('LogListItem 可访问性', () => {
  it('删除按钮应提供明确 aria-label，便于自动化与无障碍识别', () => {
    const onDelete = jest.fn()

    render(
      <LogListItem
        log={sampleLog}
        onDelete={onDelete}
      />,
    )

    const deleteButton = screen.getByRole('button', { name: '删除日志 9001' })
    expect(deleteButton).toBeInTheDocument()

    fireEvent.click(deleteButton)
    expect(onDelete).toHaveBeenCalledWith(9001)
  })
})
