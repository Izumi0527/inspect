import { act, renderHook } from '@testing-library/react'
import { useNotificationCenterRealtimeRefresh } from '@/features/dashboard/hooks/useDashboard'

const releaseAlertsLease = jest.fn()
const releaseNotificationsLease = jest.fn()
const subscribeToAlerts = jest.fn()
const subscribeToNotifications = jest.fn()
const registeredHandlers = new Map<string, (payload: unknown) => void>()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/websocket', () => ({
  WebSocketEvents: {
    NEW_ALERT: 'new_alert',
    ALERT_UPDATE: 'alert_update',
    ALERT_RESOLVED: 'alert_resolved',
    NOTIFICATION_UPDATE: 'notification_update',
  },
  useWebSocket: () => ({ subscribeToAlerts, subscribeToNotifications }),
  useWebSocketEvent: (event: string, handler: (payload: unknown) => void) => {
    registeredHandlers.set(event, handler)
  },
}))

describe('useNotificationCenterRealtimeRefresh', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    registeredHandlers.clear()
    // jest 配置 resetMocks，模块级 mock 的实现每个用例前都会被清掉，须在此重设
    subscribeToAlerts.mockImplementation(() => releaseAlertsLease)
    subscribeToNotifications.mockImplementation(() => releaseNotificationsLease)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('无论有无告警权限都订阅 notifications 房间；alerts 房间仅在有权限时订阅', () => {
    const { unmount } = renderHook(() => useNotificationCenterRealtimeRefresh(jest.fn(), false))

    expect(subscribeToNotifications).toHaveBeenCalledTimes(1)
    expect(subscribeToAlerts).not.toHaveBeenCalled()

    unmount()
    expect(releaseNotificationsLease).toHaveBeenCalledTimes(1)
  })

  it('系统消息变更事件与告警事件都走同一防抖，一轮连发只刷新一次', () => {
    const refresh = jest.fn()
    renderHook(() => useNotificationCenterRealtimeRefresh(refresh, true))

    expect(subscribeToAlerts).toHaveBeenCalledTimes(1)

    act(() => {
      registeredHandlers.get('notification_update')?.({ source: 'report', id: '88', status: 'completed' })
      registeredHandlers.get('new_alert')?.({ id: 2 })
    })
    expect(refresh).not.toHaveBeenCalled()

    act(() => {
      jest.advanceTimersByTime(2000)
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('无告警权限时告警事件不刷新，但系统消息变更仍刷新', () => {
    const refresh = jest.fn()
    renderHook(() => useNotificationCenterRealtimeRefresh(refresh, false))

    act(() => {
      registeredHandlers.get('new_alert')?.({ id: 2 })
      jest.advanceTimersByTime(3000)
    })
    expect(refresh).not.toHaveBeenCalled()

    act(() => {
      registeredHandlers.get('notification_update')?.({ source: 'scan', id: 'scan-1', status: 'completed' })
      jest.advanceTimersByTime(2000)
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
