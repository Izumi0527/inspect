import { WebSocketEvents, wsManager } from '@/lib/websocket'

type SocketMock = {
  readyState: number
  onopen: null | (() => void)
  onmessage: null | ((event: MessageEvent<string>) => void)
  onerror: null | (() => void)
  onclose: null | ((event: CloseEvent) => void)
  send: jest.Mock
  close: jest.Mock
}

// 打开一条 mock 连接并返回它发出的报文列表（已解析 JSON），用于断言 subscribe/unsubscribe 的实际发送时机。
const openMockSocket = async (): Promise<{
  sent: () => Array<{ type: string; data: Record<string, unknown> }>
  receive: (payload: unknown) => void
}> => {
  const instances: SocketMock[] = []
  const WebSocketMock: any = jest.fn().mockImplementation(() => {
    const instance: SocketMock = {
      readyState: 0,
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

  const connectPromise = wsManager.connect('user-1')
  instances[0].readyState = WebSocketMock.OPEN
  instances[0].onopen?.()
  await connectPromise

  return {
    sent: () => instances[0].send.mock.calls.map(([raw]) => JSON.parse(raw as string)),
    receive: (payload) => instances[0].onmessage?.({ data: JSON.stringify(payload) } as MessageEvent<string>),
  }
}

const roomMessages = (
  sent: Array<{ type: string; data: Record<string, unknown> }>,
  room: string
): string[] => sent.filter((m) => m.data?.room === room).map((m) => m.type)

describe('wsManager alerts 房间租约', () => {
  const originalWebSocket = global.WebSocket

  afterEach(() => {
    wsManager.disconnect()
    global.WebSocket = originalWebSocket
    jest.restoreAllMocks()
  })

  it('多个订阅者各持一份租约：一方释放不应退订，全部释放才发送 unsubscribe', async () => {
    const { sent } = await openMockSocket()

    const releaseA = wsManager.subscribeToAlerts()
    const releaseB = wsManager.subscribeToAlerts()
    expect(roomMessages(sent(), 'alerts')).toEqual(['subscribe'])

    releaseA()
    expect(roomMessages(sent(), 'alerts')).toEqual(['subscribe'])

    releaseB()
    expect(roomMessages(sent(), 'alerts')).toEqual(['subscribe', 'unsubscribe'])
  })

  it('释放函数重复调用只生效一次，不会把别人的租约也释放掉', async () => {
    const { sent } = await openMockSocket()

    const releaseA = wsManager.subscribeToAlerts()
    wsManager.subscribeToAlerts()

    releaseA()
    releaseA()
    expect(roomMessages(sent(), 'alerts')).toEqual(['subscribe'])
  })

  it('未连接时申请的租约应在连接建立后重放 subscribe', async () => {
    const release = wsManager.subscribeToAlerts()
    const { sent } = await openMockSocket()

    expect(roomMessages(sent(), 'alerts')).toEqual(['subscribe'])
    release()
    expect(roomMessages(sent(), 'alerts')).toEqual(['subscribe', 'unsubscribe'])
  })
})

describe('wsManager notifications 房间', () => {
  const originalWebSocket = global.WebSocket

  afterEach(() => {
    wsManager.disconnect()
    global.WebSocket = originalWebSocket
    jest.restoreAllMocks()
  })

  it('subscribeToNotifications 应按租约订阅 notifications 房间，最后一份释放才退订', async () => {
    const { sent } = await openMockSocket()

    const releaseA = wsManager.subscribeToNotifications()
    const releaseB = wsManager.subscribeToNotifications()
    releaseA()
    expect(roomMessages(sent(), 'notifications')).toEqual(['subscribe'])

    releaseB()
    expect(roomMessages(sent(), 'notifications')).toEqual(['subscribe', 'unsubscribe'])
  })

  it('服务端 notification 报文应派发为 NOTIFICATION_UPDATE 事件并携带 data', async () => {
    const { sent, receive } = await openMockSocket()
    void sent

    const handler = jest.fn()
    wsManager.on(WebSocketEvents.NOTIFICATION_UPDATE, handler)
    receive({ type: 'notification', data: { source: 'report', id: '88', status: 'completed' } })

    expect(handler).toHaveBeenCalledWith({ source: 'report', id: '88', status: 'completed' })
  })
})
