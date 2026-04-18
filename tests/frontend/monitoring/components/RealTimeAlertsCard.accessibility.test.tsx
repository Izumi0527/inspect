import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { RealTimeAlertsCard } from '@/features/monitoring/components/cards/RealTimeAlertsCard'

const pushMock = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}))

const alerts = [
  {
    id: 11,
    severity: 'critical' as const,
    deviceName: 'Chrome告警测试本机',
    message: '用于告警中心按钮自动化测试的第1条告警',
    time: '2026-04-18 08:50',
  },
  {
    id: 12,
    severity: 'info' as const,
    deviceName: 'Chrome告警测试本机',
    message: '用于告警中心按钮自动化测试的第3条告警',
    time: '2026-04-18 08:48',
  },
]

describe('RealTimeAlertsCard 可访问性', () => {
  beforeEach(() => {
    pushMock.mockClear()
  })

  it('实时告警项应使用原生 button，便于自动化点击与键盘访问', () => {
    render(<RealTimeAlertsCard alerts={alerts} maxItems={5} />)

    const alertButton = screen.getByRole('button', {
      name: '严重告警：用于告警中心按钮自动化测试的第1条告警，2026-04-18 08:50',
    })

    expect(alertButton.tagName).toBe('BUTTON')

    fireEvent.click(alertButton)

    expect(pushMock).toHaveBeenCalledWith('/alerts?id=11')
  })
})
