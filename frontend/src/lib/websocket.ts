/**
 * WebSocket 实时通信管理器
 * 处理实时监控数据和告警推送
 */

import { useEffect } from 'react'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { useAuth } from '@/lib/contexts/auth-context'

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

// WebSocket管理器类
class WebSocketManager {
  private socket: Socket | null = null
  private status: ConnectionStatus = ConnectionStatus.DISCONNECTED
  private eventHandlers: EventHandlerMap = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectInterval = 5000
  private reconnectTimer: NodeJS.Timeout | null = null

  // 获取WebSocket服务器地址
  private getWebSocketUrl(): string {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000'
    return `${wsUrl}/api/v1/ws`
  }

  // 连接到WebSocket服务器
  connect(token?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve()
        return
      }

      this.status = ConnectionStatus.CONNECTING
      
      try {
        this.socket = io(this.getWebSocketUrl(), {
          auth: token ? { token } : undefined,
          transports: ['websocket'],
          timeout: 10000,
          reconnection: false, // 我们手动处理重连
        })

        // 连接成功
        this.socket.on('connect', () => {
          console.log('WebSocket connected')
          this.status = ConnectionStatus.CONNECTED
          this.reconnectAttempts = 0
          this.clearReconnectTimer()
          this.emit('connection_status', { status: 'connected' })
          resolve()
        })

        // 连接错误
        this.socket.on('connect_error', (error: Error) => {
          console.error('WebSocket connection failed:', error)
          this.status = ConnectionStatus.ERROR
          this.emit('connection_status', { status: 'error', error: error.message })
          reject(error)
        })

        // 连接断开
        this.socket.on('disconnect', (reason: DisconnectReason) => {
          console.warn('WebSocket disconnected:', reason)
          this.status = ConnectionStatus.DISCONNECTED
          this.emit('connection_status', { status: 'disconnected', reason })
          
          // auto reconnect (unless manually disconnected)
          if (reason !== 'client namespace disconnect') {
            this.handleReconnect()
          }
        })

        // 注册所有业务事件处理器
        this.registerEventHandlers()

      } catch (error) {
        console.error('WebSocket initialization failed:', error)
        reject(error)
      }
    })
  }

  // 断开连接
  disconnect(): void {
    this.clearReconnectTimer()
    
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
    
    this.status = ConnectionStatus.DISCONNECTED
    this.emit('connection_status', { status: 'disconnected' })
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

  // send message
  emit(event: string, data?: unknown): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data)
    } else {
      console.warn('WebSocket not connected, cannot send message', event)
    }
  }

  // 获取连接状态
  getStatus(): ConnectionStatus {
    return this.status
  }

  // 是否已连接
  isConnected(): boolean {
    return this.status === ConnectionStatus.CONNECTED && this.socket?.connected === true
  }

  // 注册业务事件处理器
  private registerEventHandlers(): void {
    if (!this.socket) return

    // 设备状态更新
    this.socket.on(WebSocketEvents.DEVICE_STATUS_UPDATE, (data: unknown) => {
      this.dispatchEvent(WebSocketEvents.DEVICE_STATUS_UPDATE, data)
    })

    // 网络统计更新
    this.socket.on(WebSocketEvents.NETWORK_STATS_UPDATE, (data: unknown) => {
      this.dispatchEvent(WebSocketEvents.NETWORK_STATS_UPDATE, data)
    })

    // 性能数据
    this.socket.on(WebSocketEvents.PERFORMANCE_DATA, (data: unknown) => {
      this.dispatchEvent(WebSocketEvents.PERFORMANCE_DATA, data)
    })

    // 流量数据
    this.socket.on(WebSocketEvents.TRAFFIC_DATA, (data: unknown) => {
      this.dispatchEvent(WebSocketEvents.TRAFFIC_DATA, data)
    })

    // 新告警
    this.socket.on(WebSocketEvents.NEW_ALERT, (data: unknown) => {
      this.dispatchEvent(WebSocketEvents.NEW_ALERT, data)
    })

    // 告警更新
    this.socket.on(WebSocketEvents.ALERT_UPDATE, (data: unknown) => {
      this.dispatchEvent(WebSocketEvents.ALERT_UPDATE, data)
    })

    // 告警解决
    this.socket.on(WebSocketEvents.ALERT_RESOLVED, (data: unknown) => {
      this.dispatchEvent(WebSocketEvents.ALERT_RESOLVED, data)
    })

    // 巡检开始
    this.socket.on(WebSocketEvents.INSPECTION_START, (data: unknown) => {
      this.dispatchEvent(WebSocketEvents.INSPECTION_START, data)
    })

    // 巡检进度
    this.socket.on(WebSocketEvents.INSPECTION_PROGRESS, (data: unknown) => {
      this.dispatchEvent(WebSocketEvents.INSPECTION_PROGRESS, data)
    })

    // 巡检完成
    this.socket.on(WebSocketEvents.INSPECTION_COMPLETE, (data: unknown) => {
      this.dispatchEvent(WebSocketEvents.INSPECTION_COMPLETE, data)
    })

    // 系统状态更新
    this.socket.on(WebSocketEvents.SYSTEM_STATUS_UPDATE, (data: unknown) => {
      this.dispatchEvent(WebSocketEvents.SYSTEM_STATUS_UPDATE, data)
    })
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

  // 处理重连
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('WebSocket reconnection attempts exceeded limit, stop retrying')
      return
    }

    this.reconnectAttempts++
    console.log(`WebSocket reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // Reconnect failed, will retry
      })
    }, this.reconnectInterval)
  }

  // clear reconnect timer
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  // subscribe device monitoring
  subscribeToDeviceMonitoring(deviceIds?: number[]): void {
    this.emit('subscribe_device_monitoring', { device_ids: deviceIds })
  }

  // 取消subscribe device monitoring
  unsubscribeFromDeviceMonitoring(): void {
    this.emit('unsubscribe_device_monitoring')
  }

  // subscribe alert notifications
  subscribeToAlerts(severity?: string[]): void {
    this.emit('subscribe_alerts', { severity })
  }

  // 取消subscribe alert notifications
  unsubscribeFromAlerts(): void {
    this.emit('unsubscribe_alerts')
  }

  // subscribe inspection tasks
  subscribeToInspectionTasks(): void {
    this.emit('subscribe_inspection_tasks')
  }

  // 取消subscribe inspection tasks
  unsubscribeFromInspectionTasks(): void {
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
  return {
    connect: (token?: string) => wsManager.connect(token),
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
  }
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
    if (isAuthenticated && user) {
      // 使用用户的access token连接WebSocket
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
      ws.connect(token || undefined).catch(console.error)
    } else {
      ws.disconnect()
    }

    // 组件卸载时断开连接
    return () => {
      ws.disconnect()
    }
  }, [isAuthenticated, user, ws])

  return ws
}

export default wsManager
