import React from 'react'
import { render, screen } from '@testing-library/react'
import { LogListItem } from '@/features/logs/components/LogListItem'
import type { DeviceLog } from '@/features/logs/types'

// 本系统自身活动（任务 C）：勾选"显示本系统活动"后这类记录会出现在列表里，
// 需要一个徽标让运维一眼分清哪些是本系统自己的登录、哪些是别人的。

const baseLog: DeviceLog = {
  id: 1,
  device_id: 10,
  device_name: '核心交换机',
  device_ip: '192.168.20.1',
  level: 'info',
  facility: 'security',
  source: 'ssh',
  message: 'LINE/5/VTYUSERLOGIN: A user login. (UserName=admin, UserIP=192.168.20.2, UserChannel=VTY0)',
  log_timestamp: '2026-09-04T11:21:55+08:00',
  collected_at: '2026-09-04T11:22:00+08:00',
  created_at: '2026-09-04T11:22:00+08:00',
}

describe('LogListItem 本系统活动徽标', () => {
  it('self_generated 记录应显示"本系统"徽标', () => {
    render(<LogListItem log={{ ...baseLog, self_generated: true }} />)
    expect(screen.getByText('本系统')).toBeInTheDocument()
  })

  it('普通记录不显示徽标', () => {
    render(<LogListItem log={{ ...baseLog, self_generated: false }} />)
    expect(screen.queryByText('本系统')).toBeNull()
  })
})
