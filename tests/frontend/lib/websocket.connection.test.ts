import { renderHook, waitFor, act } from '@testing-library/react'
import { useWebSocketConnection, wsManager } from '@/lib/websocket'
import { useAuth } from '@/lib/contexts/auth-context'

jest.mock('@/lib/contexts/auth-context', () => ({
  useAuth: jest.fn(),
}))

describe('useWebSocketConnection', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  beforeEach(() => {
    ;(useAuth as jest.Mock).mockReturnValue({
      isAuthenticated: true,
      user: { id: '7' },
    })
  })

  it('相同登录态重复渲染时不应重复断开重连', async () => {
    const connectSpy = jest.spyOn(wsManager, 'connect').mockResolvedValue(undefined)
    const disconnectSpy = jest.spyOn(wsManager, 'disconnect').mockImplementation(() => {})

    const { rerender, unmount } = renderHook(() => useWebSocketConnection())

    await waitFor(() => {
      expect(connectSpy).toHaveBeenCalledTimes(1)
    })

    rerender()
    rerender()

    expect(connectSpy).toHaveBeenCalledTimes(1)
    expect(disconnectSpy).toHaveBeenCalledTimes(0)

    unmount()
    expect(disconnectSpy).toHaveBeenCalledTimes(1)
  })

  it('窗口重新聚焦时，若已登录但 WS 断开，应尝试重连', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })

    const connectSpy = jest.spyOn(wsManager, 'connect').mockResolvedValue(undefined)

    const { unmount } = renderHook(() => useWebSocketConnection())

    await waitFor(() => {
      expect(connectSpy).toHaveBeenCalledTimes(1)
    })

    connectSpy.mockClear()
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => {
      expect(connectSpy).toHaveBeenCalledTimes(1)
    })

    unmount()
  })
})
