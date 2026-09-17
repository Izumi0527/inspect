import { render, screen } from '@testing-library/react'

import { NotificationItem } from '@/features/dashboard/components/NotificationItem'
import type { Notification } from '@/types/notification'

const buildNotification = (overrides: Partial<Notification> = {}): Notification => ({
  id: 'alert-7',
  type: 'alert',
  title: '告警：core-sw-01',
  content: 'CPU 使用率超过阈值',
  timestamp: '2026-09-18T00:00:00Z',
  read: false,
  severity: 'critical',
  link: '/alerts?id=7',
  ...overrides,
})

describe('NotificationItem 告警状态', () => {
  it('已解决的告警应显示“已解决”标签，并把指示点降为灰色而不是继续按严重级别着色', () => {
    render(<NotificationItem notification={buildNotification({ status: 'resolved' })} />)

    expect(screen.getByText('已解决')).toBeInTheDocument()
    expect(screen.getByTestId('notification-indicator').className).not.toContain('bg-red-500')
  })

  it('已确认的告警应显示“已确认”标签，指示点仍按严重级别着色', () => {
    render(<NotificationItem notification={buildNotification({ status: 'acknowledged' })} />)

    expect(screen.getByText('已确认')).toBeInTheDocument()
    expect(screen.getByTestId('notification-indicator').className).toContain('bg-red-500')
  })

  it('活跃告警与系统消息不显示状态标签', () => {
    const { rerender } = render(<NotificationItem notification={buildNotification({ status: 'active' })} />)
    expect(screen.queryByText(/已解决|已确认/)).not.toBeInTheDocument()

    rerender(<NotificationItem notification={buildNotification({ id: 'report-1', type: 'system', status: undefined })} />)
    expect(screen.queryByText(/已解决|已确认/)).not.toBeInTheDocument()
  })
})
