import { act, renderHook } from '@testing-library/react'
import { useDashboardAlertRealtimeRefresh } from '@/features/dashboard/hooks/useDashboard'

const subscribeToAlerts = jest.fn()
const unsubscribeFromAlerts = jest.fn()
const registeredHandlers = new Map<string, (payload: unknown) => void>()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/websocket', () => ({
  WebSocketEvents: {
    NEW_ALERT: 'new_alert',
    ALERT_UPDATE: 'alert_update',
    ALERT_RESOLVED: 'alert_resolved',
  },
  useWebSocket: () => ({ subscribeToAlerts, unsubscribeFromAlerts }),
  useWebSocketEvent: (event: string, handler: (payload: unknown) => void) => {
    registeredHandlers.set(event, handler)
  },
}))

describe('useDashboardAlertRealtimeRefresh', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    registeredHandlers.clear()
    subscribeToAlerts.mockReset()
    unsubscribeFromAlerts.mockReset()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('有告警权限时订阅 alerts 房间，卸载时退订', () => {
    const { unmount } = renderHook(() => useDashboardAlertRealtimeRefresh(jest.fn(), true))

    expect(subscribeToAlerts).toHaveBeenCalledTimes(1)
    unmount()
    expect(unsubscribeFromAlerts).toHaveBeenCalledTimes(1)
  })

  it('告警解决事件在防抖后触发一次刷新；一轮连发多事件只刷新一次', () => {
    const refresh = jest.fn()
    renderHook(() => useDashboardAlertRealtimeRefresh(refresh, true))

    act(() => {
      registeredHandlers.get('alert_resolved')?.({ id: 1, status: 'resolved' })
      registeredHandlers.get('new_alert')?.({ id: 2 })
      registeredHandlers.get('alert_update')?.({ id: 3, status: 'acknowledged' })
    })
    expect(refresh).not.toHaveBeenCalled()

    act(() => {
      jest.advanceTimersByTime(2000)
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('无告警权限时不订阅，收到事件也不刷新', () => {
    const refresh = jest.fn()
    renderHook(() => useDashboardAlertRealtimeRefresh(refresh, false))

    expect(subscribeToAlerts).not.toHaveBeenCalled()

    act(() => {
      registeredHandlers.get('alert_resolved')?.({ id: 1, status: 'resolved' })
      jest.advanceTimersByTime(5000)
    })
    expect(refresh).not.toHaveBeenCalled()
  })
})
