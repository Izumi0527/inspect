import { TokenManager } from '@/lib/api-client'
import { wsManager } from '@/lib/websocket'

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  static instances: MockWebSocket[] = []

  url: string
  protocols?: string[] | string
  readyState = MockWebSocket.CONNECTING

  onopen: ((event?: any) => void) | null = null
  onmessage: ((event: any) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((event: any) => void) | null = null

  constructor(url: string, protocols?: string[] | string) {
    this.url = url
    this.protocols = protocols
    MockWebSocket.instances.push(this)
  }

  send() {}

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ reason: 'client_close' })
  }

  triggerOpen() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.({})
  }
}

describe('websocket NEXT_PUBLIC_WS_URL 基址归一化', () => {
  const originalWsUrl = process.env.NEXT_PUBLIC_WS_URL
  const originalWebSocket = global.WebSocket

  beforeEach(() => {
    MockWebSocket.instances = []
    ;(global as any).WebSocket = MockWebSocket
    TokenManager.clearTokens()
    TokenManager.setAccessToken('test-token')
  })

  afterEach(() => {
    wsManager.disconnect()
    TokenManager.clearTokens()
    process.env.NEXT_PUBLIC_WS_URL = originalWsUrl
    ;(global as any).WebSocket = originalWebSocket
  })

  it('当 NEXT_PUBLIC_WS_URL 包含 /api/v1 时，不应出现双前缀', async () => {
    process.env.NEXT_PUBLIC_WS_URL = 'wss://example.com/api/v1'

    const promise = wsManager.connect('u1')
    const instance = MockWebSocket.instances[0]
    expect(instance.url).toBe('wss://example.com/api/v1/ws/u1')

    instance.triggerOpen()
    await promise
  })

  it('当 NEXT_PUBLIC_WS_URL 配成 /api/v1/ws 时，也应归一化为单前缀', async () => {
    process.env.NEXT_PUBLIC_WS_URL = 'wss://example.com/api/v1/ws'

    const promise = wsManager.connect('u2')
    const instance = MockWebSocket.instances[0]
    expect(instance.url).toBe('wss://example.com/api/v1/ws/u2')

    instance.triggerOpen()
    await promise
  })
})

