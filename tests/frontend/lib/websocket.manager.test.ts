import { wsManager } from '@/lib/websocket'

describe('wsManager.connect', () => {
  const originalWebSocket = global.WebSocket
  const originalWsUrl = process.env.NEXT_PUBLIC_WS_URL

  afterEach(() => {
    wsManager.disconnect()
    global.WebSocket = originalWebSocket
    process.env.NEXT_PUBLIC_WS_URL = originalWsUrl
    jest.restoreAllMocks()
  })

  // S3：认证改由 httpOnly Cookie 承载，WS 握手时浏览器自动携带，不再用子协议传 token。
  it('应通过 Cookie 握手认证（不再用 Sec-WebSocket-Protocol 子协议携带 token）', async () => {
    process.env.NEXT_PUBLIC_WS_URL = 'ws://127.0.0.1:9000'

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

    // 仅传 URL，不再有第二个子协议参数。
    expect(WebSocketMock).toHaveBeenCalledWith('ws://127.0.0.1:9000/api/v1/ws/user-7')
    expect(WebSocketMock.mock.calls[0]).toHaveLength(1)

    instances[0].readyState = WebSocketMock.OPEN
    instances[0].onopen?.()

    await expect(connectPromise).resolves.toBeUndefined()
  })
})
