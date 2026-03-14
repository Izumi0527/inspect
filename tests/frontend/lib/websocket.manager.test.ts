import { wsManager } from '@/lib/websocket'
import { TokenManager } from '@/lib/api-client'

describe('wsManager.connect', () => {
  const originalWebSocket = global.WebSocket
  const originalWsUrl = process.env.NEXT_PUBLIC_WS_URL

  afterEach(() => {
    wsManager.disconnect()
    global.WebSocket = originalWebSocket
    process.env.NEXT_PUBLIC_WS_URL = originalWsUrl
    jest.restoreAllMocks()
  })

  it('应通过 Sec-WebSocket-Protocol 子协议携带 token', async () => {
    process.env.NEXT_PUBLIC_WS_URL = 'ws://127.0.0.1:38000'
    jest.spyOn(TokenManager, 'getAccessToken').mockReturnValue('test-access-token')

    const instances: Array<{
      readyState: number
      onopen: null | (() => void)
      onmessage: null | ((event: MessageEvent<string>) => void)
      onerror: null | (() => void)
      onclose: null | ((event: CloseEvent) => void)
      send: jest.Mock
      close: jest.Mock
    }> = []

    const WebSocketMock: any = jest.fn().mockImplementation((_url: string, _protocols?: string | string[]) => {
      const instance = {
        readyState: WebSocketMock.CONNECTING,
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
        send: jest.fn(),
        close: jest.fn(),
      }
      instances.push(instance)
      return instance
    })

    WebSocketMock.CONNECTING = 0
    WebSocketMock.OPEN = 1
    ;(global as any).WebSocket = WebSocketMock

    const connectPromise = wsManager.connect('user-7')

    expect(WebSocketMock).toHaveBeenCalledWith(
      'ws://127.0.0.1:38000/api/v1/ws/user-7',
      ['inspect-token', 'test-access-token']
    )

    instances[0].readyState = WebSocketMock.OPEN
    instances[0].onopen?.()

    await expect(connectPromise).resolves.toBeUndefined()
  })
})
