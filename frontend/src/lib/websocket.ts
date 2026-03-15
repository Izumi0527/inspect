/**
 * WebSocket 实时通信管理器
 * 处理实时监控数据和告警推送
 */

import { useEffect, useMemo } from 'react'
import { useAuth } from '@/lib/contexts/auth-context'
import { TokenManager } from '@/lib/api-client'

// WebSocket事件类型
export enum WebSocketEvents {
  // 连接事件
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  ERROR = 'error',

  // 监控数据事件
  DEVICE_STATUS_UPDATE = 'device_status_update',
  NETWORK_STATS_UPDATE = 'network_stats_update',
  PERFORMANCE_DATA = 'performance_data',
  TRAFFIC_DATA = 'traffic_data',

  // 告警事件
  NEW_ALERT = 'new_alert',
  ALERT_UPDATE = 'alert_update',
  ALERT_RESOLVED = 'alert_resolved',

  // 巡检事件
  INSPECTION_START = 'inspection_start',
  INSPECTION_PROGRESS = 'inspection_progress',
  INSPECTION_COMPLETE = 'inspection_complete',

  // 系统事件
  SYSTEM_STATUS_UPDATE = 'system_status_update',
  USER_ACTIVITY = 'user_activity',
}

// 连接状态
enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

type DisconnectReason = string

// 事件处理器类型
type EventHandler<T = unknown> = (data: T) => void
type EventHandlerMap = Map<string, EventHandler<unknown>[]>

type IncomingMessage = {
  type?: string
  data?: unknown
  timestamp?: number
  message_id?: string
}

type OutgoingMessage = {
  type: string
  data: Record<string, unknown>
}

// WebSocket管理器类
class WebSocketManager {
  private socket: WebSocket | null = null
  private connectPromise: Promise<void> | null = null
  private status: ConnectionStatus = ConnectionStatus.DISCONNECTED
  private eventHandlers: EventHandlerMap = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectInterval = 5000
  private maxReconnectInterval = 30000
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private manualClose = false
  private lastUserId: string | null = null

  // 心跳：避免服务端按心跳超时清理连接（默认每 60 秒一次）。
  private heartbeatIntervalMs = 60_000
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  // 订阅幂等与重连恢复：记录订阅意图，在重连后自动重放，避免“漏订阅/重复订阅”。
  private deviceMonitoringSubscribed = false
  private deviceMonitoringDeviceIds: number[] | undefined
  private alertsSubscribed = false
  private alertsSeverity: string[] | undefined
  private inspectionTasksSubscribed = false

  // 获取WebSocket服务器地址
  private getWebSocketUrl(userId?: string): string {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://127.0.0.1:38000'
    const normalized = wsUrl.replace(/^http/i, 'ws')
    const resolvedUserId = (userId ?? this.lastUserId ?? '').trim() || '0'
    return `${normalized}/api/v1/ws/${resolvedUserId}`
  }

  // 连接到WebSocket服务器
  connect(userId?: string): Promise<void> {
    if (typeof window === 'undefined') {
      return Promise.reject(new Error('WebSocket 只能在浏览器环境中使用'))
    }

    if (this.socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve()
    }

    if (this.status === ConnectionStatus.CONNECTING && this.connectPromise) {
      return this.connectPromise
    }

    this.manualClose = false
    if (typeof userId === 'string' && userId.trim()) {
      this.lastUserId = userId
    }

    // 触发主动 connect 时，清理可能残留的重连定时器，避免重复 connect。
    this.clearReconnectTimer()
    this.status = ConnectionStatus.CONNECTING

    const url = this.getWebSocketUrl(userId)
    const accessToken = TokenManager.getAccessToken()
    if (!accessToken) {
      this.status = ConnectionStatus.ERROR
      return Promise.reject(new Error('缺少访问令牌，无法建立 WebSocket 连接'))
    }

    let settled = false
    this.connectPromise = new Promise((resolve, reject) => {
      const finalize = () => {
        if (settled) return
        settled = true
        this.connectPromise = null
      }

      let socket: WebSocket
      try {
        // ✅ 鉴权：使用 Sec-WebSocket-Protocol 子协议携带 token，避免 token 出现在 URL query 中。
        // 约定：['inspect-token', '<access_token>']
        socket = new WebSocket(url, ['inspect-token', accessToken])
      } catch (error) {
        this.status = ConnectionStatus.ERROR
        finalize()
        reject(error instanceof Error ? error : new Error('WebSocket 初始化失败'))
        return
      }

      this.socket = socket

      socket.onopen = () => {
        if (settled) return
        settled = true
        this.connectPromise = null
        this.status = ConnectionStatus.CONNECTED
        this.reconnectAttempts = 0
        this.clearReconnectTimer()
        this.startHeartbeat()
        this.dispatchEvent(WebSocketEvents.CONNECT, { status: 'connected' })
        this.dispatchEvent('connection_status', { status: 'connected' })
        this.replaySubscriptions()
        resolve()
      }

      socket.onmessage = (event: MessageEvent<string>) => {
        this.handleIncomingMessage(event.data)
      }

      socket.onerror = () => {
        this.status = ConnectionStatus.ERROR
        this.dispatchEvent(WebSocketEvents.ERROR, { status: 'error' })
        if (!settled) {
          finalize()
          reject(new Error('WebSocket 连接失败'))
        }
      }

      socket.onclose = (event: CloseEvent) => {
        const reason: DisconnectReason = event.reason || 'connection_closed'
        this.stopHeartbeat()
        this.status = ConnectionStatus.DISCONNECTED
        this.dispatchEvent(WebSocketEvents.DISCONNECT, { status: 'disconnected', reason })
        this.dispatchEvent('connection_status', { status: 'disconnected', reason })

        // 如果连接在握手阶段就被关闭（未触发 onopen），需要确保 connect() 不会永久挂起。
        if (!settled) {
          finalize()
          reject(new Error('WebSocket 连接已关闭'))
        }

        if (!this.manualClose) {
          this.handleReconnect()
        }
      }
    })

    return this.connectPromise
  }

  // 断开连接
  disconnect(): void {
    this.manualClose = true
    this.connectPromise = null
    this.clearReconnectTimer()
    this.stopHeartbeat()

    // 手动断开通常发生在退出登录/切换账号：清理订阅状态，避免下次登录复用旧订阅。
    this.deviceMonitoringSubscribed = false
    this.deviceMonitoringDeviceIds = undefined
    this.alertsSubscribed = false
    this.alertsSeverity = undefined
    this.inspectionTasksSubscribed = false

    if (this.socket) {
      this.socket.close()
      this.socket = null
    }

    this.status = ConnectionStatus.DISCONNECTED
    this.dispatchEvent(WebSocketEvents.DISCONNECT, { status: 'disconnected' })
    this.dispatchEvent('connection_status', { status: 'disconnected' })
  }

  // 注册事件处理器
  on<T = unknown>(event: string, handler: EventHandler<T>): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, [])
    }
    this.eventHandlers.get(event)!.push(handler as EventHandler<unknown>)
  }

  // 移除事件处理器
  off<T = unknown>(event: string, handler?: EventHandler<T>): void {
    if (!this.eventHandlers.has(event)) return

    if (handler) {
      const handlers = this.eventHandlers.get(event)!
      const index = handlers.indexOf(handler as EventHandler<unknown>)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    } else {
      this.eventHandlers.set(event, [])
    }
  }

  // 发送消息
  emit(event: string, data?: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      const payload = this.buildOutgoingMessage(event, data)
      if (!payload) {
        console.warn('无法识别的 WebSocket 事件，已忽略:', event)
        return
      }
      this.socket.send(JSON.stringify(payload))
    } else {
      console.warn('WebSocket 未连接，无法发送消息', event)
    }
  }

  // 获取连接状态
  getStatus(): ConnectionStatus {
    return this.status
  }

  // 是否已连接
  isConnected(): boolean {
    return this.status === ConnectionStatus.CONNECTED && this.socket?.readyState === WebSocket.OPEN
  }

  private replaySubscriptions(): void {
    if (!this.isConnected()) return

    if (this.deviceMonitoringSubscribed) {
      this.emit('subscribe_device_monitoring', { device_ids: this.deviceMonitoringDeviceIds })
    }
    if (this.alertsSubscribed) {
      this.emit('subscribe_alerts', { severity: this.alertsSeverity })
    }
    if (this.inspectionTasksSubscribed) {
      this.emit('subscribe_inspection_tasks')
    }
  }

  // 分发事件到注册的处理器
  private dispatchEvent(event: string, data: unknown): void {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data)
        } catch (error) {
          console.error(`事件处理器错误 (${event}):`, error)
        }
      })
    }
  }

  private handleIncomingMessage(raw: string): void {
    if (!raw) {
      return
    }

    let payload: IncomingMessage
    try {
      payload = JSON.parse(raw) as IncomingMessage
    } catch (error) {
      console.warn('WebSocket 消息解析失败:', error)
      return
    }

    const messageType = payload.type
    const events = this.mapIncomingTypeToEvents(messageType, payload.data)

    if (events.length === 0) {
      if (messageType) {
        this.dispatchEvent(messageType, payload.data ?? payload)
      }
      return
    }

    events.forEach(event => {
      this.dispatchEvent(event, payload.data ?? payload)
    })
  }

  private mapIncomingTypeToEvents(type?: string, data?: unknown): string[] {
    switch (type) {
      case 'device_status':
        return [WebSocketEvents.DEVICE_STATUS_UPDATE]
      case 'scan_progress':
        return this.resolveInspectionEvents(data)
      case 'alert':
        return this.resolveAlertEvents(data)
      case 'system_status':
        return [WebSocketEvents.SYSTEM_STATUS_UPDATE]
      case 'device_metrics':
        return [
          WebSocketEvents.PERFORMANCE_DATA,
          WebSocketEvents.TRAFFIC_DATA,
          WebSocketEvents.NETWORK_STATS_UPDATE,
        ]
      case 'user_notification':
        return [WebSocketEvents.USER_ACTIVITY]
      case 'error':
        return [WebSocketEvents.ERROR]
      default:
        return []
    }
  }

  private resolveInspectionEvents(data?: unknown): string[] {
    const status = this.readStringField(data, 'status')
    const progress = this.readNumberField(data, 'progress')
    const events = [WebSocketEvents.INSPECTION_PROGRESS]

    if (status === 'running' || status === 'started' || status === 'start') {
      if (progress === null || progress === undefined || progress === 0) {
        events.push(WebSocketEvents.INSPECTION_START)
      }
    }

    if (this.isInspectionFinished(status)) {
      events.push(WebSocketEvents.INSPECTION_COMPLETE)
    }

    return events
  }

  private resolveAlertEvents(data?: unknown): string[] {
    const status = this.readStringField(data, 'status')

    if (status === 'acknowledged') {
      return [WebSocketEvents.ALERT_UPDATE]
    }

    if (status === 'resolved' || status === 'closed') {
      return [WebSocketEvents.ALERT_RESOLVED]
    }

    return [WebSocketEvents.NEW_ALERT]
  }

  private isInspectionFinished(status: string): boolean {
    switch (status) {
      case 'completed':
      case 'complete':
      case 'finished':
      case 'success':
      case 'failed':
      case 'error':
      case 'canceled':
      case 'cancelled':
        return true
      default:
        return false
    }
  }

  private readStringField(data: unknown, field: string): string {
    if (!data || typeof data !== 'object') {
      return ''
    }
    const value = (data as Record<string, unknown>)[field]
    if (typeof value !== 'string') {
      return ''
    }
    return value.trim().toLowerCase()
  }

  private readNumberField(data: unknown, field: string): number | null {
    if (!data || typeof data !== 'object') {
      return null
    }
    const value = (data as Record<string, unknown>)[field]
    if (typeof value === 'number') {
      return value
    }
    return null
  }

  private buildOutgoingMessage(event: string, data?: unknown): OutgoingMessage | null {
    const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>

    switch (event) {
      case 'heartbeat':
        return {
          type: 'heartbeat',
          data: { timestamp: payload.timestamp ?? Date.now() },
        }
      case 'subscribe_device_monitoring':
        return {
          type: 'subscribe',
          data: { room: 'device_metrics', ...payload },
        }
      case 'unsubscribe_device_monitoring':
        return {
          type: 'unsubscribe',
          data: { room: 'device_metrics', ...payload },
        }
      case 'subscribe_alerts':
        return {
          type: 'subscribe',
          data: { room: 'alerts', ...payload },
        }
      case 'unsubscribe_alerts':
        return {
          type: 'unsubscribe',
          data: { room: 'alerts', ...payload },
        }
      case 'subscribe_inspection_tasks':
        return {
          type: 'subscribe',
          data: { room: 'scan_progress', ...payload },
        }
      case 'unsubscribe_inspection_tasks':
        return {
          type: 'unsubscribe',
          data: { room: 'scan_progress', ...payload },
        }
      case 'subscribe':
      case 'unsubscribe':
        if (!payload.room) {
          return null
        }
        return {
          type: event,
          data: payload,
        }
      default:
        return {
          type: event,
          data: payload,
        }
    }
  }

  // 处理重连
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('WebSocket 重连次数已达上限，停止重试')
      return
    }

    this.reconnectAttempts++
    console.log(`WebSocket 重连中... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    const exponentialDelay = Math.min(
      this.reconnectInterval * 2 ** Math.max(0, this.reconnectAttempts - 1),
      this.maxReconnectInterval
    )
    const jitter = Math.floor(Math.random() * 1000)
    const delayMs = exponentialDelay + jitter

    this.reconnectTimer = setTimeout(() => {
      this.connect(this.lastUserId ?? undefined).catch(() => {
        // Reconnect failed, will retry
      })
    }, delayMs)
  }

  // 清理重连定时器
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()

    // 首次连接立即发一次，尽快与服务端建立“活跃”状态
    this.sendHeartbeat()

    this.heartbeatTimer = setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return
      }
      this.sendHeartbeat()
    }, this.heartbeatIntervalMs)
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) return
    clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
  }

  // subscribe device monitoring
  subscribeToDeviceMonitoring(deviceIds?: number[]): void {
    const normalizedDeviceIds =
      Array.isArray(deviceIds) && deviceIds.length > 0
        ? Array.from(new Set(deviceIds))
            .map((id) => (typeof id === 'number' ? id : Number(String(id))))
            .filter((id): id is number => Number.isFinite(id))
            .sort((a, b) => a - b)
        : undefined

    const nextKey = normalizedDeviceIds ? normalizedDeviceIds.join(',') : ''
    const prevKey = this.deviceMonitoringDeviceIds ? this.deviceMonitoringDeviceIds.join(',') : ''
    const wasSubscribed = this.deviceMonitoringSubscribed

    this.deviceMonitoringSubscribed = true
    this.deviceMonitoringDeviceIds = normalizedDeviceIds

    // 已订阅且参数未变化：不重复发送，避免服务端房间成员膨胀与重复推送。
    if (wasSubscribed && nextKey === prevKey) return
    if (!this.isConnected()) return
    this.emit('subscribe_device_monitoring', { device_ids: normalizedDeviceIds })
  }

  // 取消subscribe device monitoring
  unsubscribeFromDeviceMonitoring(): void {
    if (!this.deviceMonitoringSubscribed) return
    this.deviceMonitoringSubscribed = false
    this.deviceMonitoringDeviceIds = undefined
    if (!this.isConnected()) return
    this.emit('unsubscribe_device_monitoring')
  }

  // subscribe alert notifications
  subscribeToAlerts(severity?: string[]): void {
    const normalizedSeverity =
      Array.isArray(severity) && severity.length > 0
        ? Array.from(
            new Set(
              severity
                .map((item) => String(item).trim())
                .filter((item) => item !== '')
            )
          ).sort()
        : undefined

    const nextKey = normalizedSeverity ? normalizedSeverity.join(',') : ''
    const prevKey = this.alertsSeverity ? this.alertsSeverity.join(',') : ''
    const wasSubscribed = this.alertsSubscribed

    this.alertsSubscribed = true
    this.alertsSeverity = normalizedSeverity

    if (wasSubscribed && nextKey === prevKey) return
    if (!this.isConnected()) return
    this.emit('subscribe_alerts', { severity: normalizedSeverity })
  }

  // 取消subscribe alert notifications
  unsubscribeFromAlerts(): void {
    if (!this.alertsSubscribed) return
    this.alertsSubscribed = false
    this.alertsSeverity = undefined
    if (!this.isConnected()) return
    this.emit('unsubscribe_alerts')
  }

  // subscribe inspection tasks
  subscribeToInspectionTasks(): void {
    const wasSubscribed = this.inspectionTasksSubscribed
    this.inspectionTasksSubscribed = true
    if (wasSubscribed) return
    if (!this.isConnected()) return
    this.emit('subscribe_inspection_tasks')
  }

  // 取消subscribe inspection tasks
  unsubscribeFromInspectionTasks(): void {
    if (!this.inspectionTasksSubscribed) return
    this.inspectionTasksSubscribed = false
    if (!this.isConnected()) return
    this.emit('unsubscribe_inspection_tasks')
  }

  // send heartbeat
  sendHeartbeat(): void {
    this.emit('heartbeat', { timestamp: Date.now() })
  }
}

// 创建全局WebSocket管理器实例
export const wsManager = new WebSocketManager()

// WebSocket Hook
export function useWebSocket() {
  return useMemo(() => ({
    connect: (userId?: string) => wsManager.connect(userId),
    disconnect: () => wsManager.disconnect(),
    on: <T = unknown>(event: string, handler: EventHandler<T>) => wsManager.on(event, handler),
    off: <T = unknown>(event: string, handler?: EventHandler<T>) => wsManager.off(event, handler),
    emit: (event: string, data?: unknown) => wsManager.emit(event, data),
    isConnected: () => wsManager.isConnected(),
    getStatus: () => wsManager.getStatus(),
    subscribeToDeviceMonitoring: (deviceIds?: number[]) => wsManager.subscribeToDeviceMonitoring(deviceIds),
    unsubscribeFromDeviceMonitoring: () => wsManager.unsubscribeFromDeviceMonitoring(),
    subscribeToAlerts: (severity?: string[]) => wsManager.subscribeToAlerts(severity),
    unsubscribeFromAlerts: () => wsManager.unsubscribeFromAlerts(),
    subscribeToInspectionTasks: () => wsManager.subscribeToInspectionTasks(),
    unsubscribeFromInspectionTasks: () => wsManager.unsubscribeFromInspectionTasks(),
  }), [])
}

// 便捷Hook：监听特定事件
export function useWebSocketEvent<T = unknown>(event: string, handler: EventHandler<T>) {
  const { on, off } = useWebSocket()

  // 使用useEffect来管理事件监听器的生命周期
  useEffect(() => {
    on(event, handler)

    return () => {
      off(event, handler)
    }
  }, [event, handler, on, off])
}

// 用于React组件的Hook
export function useWebSocketConnection() {
  const { isAuthenticated, user } = useAuth()
  const ws = useWebSocket()

  // 自动连接/断开
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      wsManager.connect(user.id).catch(console.error)
    } else {
      wsManager.disconnect()
    }

    // 组件卸载时断开连接
    return () => {
      wsManager.disconnect()
    }
  }, [isAuthenticated, user?.id])

  // 可靠性增强：窗口聚焦 / 页面可见时，如果断线则尝试重连（幂等）。
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isAuthenticated || !user?.id) return

    const tryReconnect = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      if (wsManager.isConnected()) return
      wsManager.connect(user.id).catch(() => {})
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        tryReconnect()
      }
    }

    window.addEventListener('focus', tryReconnect)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', tryReconnect)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isAuthenticated, user?.id])

  return ws
}

export default wsManager
