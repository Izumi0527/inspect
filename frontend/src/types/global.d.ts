// 全局类型声明

// Google Analytics gtag 类型
declare global {
  interface Window {
    gtag?: (
      command: 'config' | 'set' | 'get' | 'event' | 'timing_complete' | 'custom_map',
      targetId?: string,
      config?: Record<string, unknown>
    ) => void
  }
}

// WebSocket 断开连接原因类型
export type DisconnectReason =
  | 'io server disconnect'
  | 'io client disconnect'
  | 'client namespace disconnect'
  | 'ping timeout'
  | 'transport close'
  | 'transport error'

// API 响应基础类型
export interface ApiResponse<T = unknown> {
  success: boolean
  data: T
  message?: string
  code?: number
}

// 分页响应类型
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  pages: number
}

// 用户批量操作类型
export interface UserBulkOperation {
  type: 'activate' | 'deactivate' | 'delete' | 'change_role'
  userIds: string[]
  params?: Record<string, unknown>
}

export {}