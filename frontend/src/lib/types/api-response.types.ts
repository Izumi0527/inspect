import { User } from './auth.types'
import { Alert } from '@/features/alerts/types'

/**
 * 具体的 API 响应类型定义
 * 解决所有 API 调用的类型推断问题
 *
 * 注意：基础 ApiResponse<T> 接口已在 api-client.ts 中定义
 */

// 重新导出基础 ApiResponse 接口以供其他模块使用
export interface ApiResponse<T = unknown> {
  data: T
  message?: string
  status: number
  success: boolean
}

// 分页响应基础结构
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  hasNext: boolean
  hasPrev: boolean
}

// 认证相关 API 响应类型
export interface LoginResponse {
  access_token: string
  refresh_token: string
  user: User
}

export interface RefreshTokenResponse {
  access_token: string
  refresh_token: string
}

export type ProfileResponse = User

// 告警相关 API 响应类型
export interface AlertsListResponse {
  alerts: Alert[]
  total: number
  pages: number
  current_page: number
  has_next: boolean
  has_prev: boolean
}

export type AlertDetailResponse = Alert

export interface AlertActionResponse {
  success: boolean
  message?: string
}

// 设备相关 API 响应类型
export interface Device {
  id: string
  name: string
  ip: string
  type: string
  status: 'online' | 'offline' | 'maintenance'
  location?: string
}

export type DevicesListResponse = PaginatedResponse<Device>

// 用户管理相关 API 响应类型
export type UsersListResponse = PaginatedResponse<User>

export interface UserActionResponse {
  success: boolean
  message?: string
}

// 系统状态相关 API 响应类型
export interface SystemStatus {
  cpu: number
  memory: number
  disk: number
  network: {
    incoming: number
    outgoing: number
  }
}

export type SystemStatusResponse = SystemStatus

// 批量操作响应类型
export interface BulkOperationResponse {
  success: boolean
  processed: number
  failed: number
  errors?: Array<{
    id: string
    error: string
  }>
}

// 统计数据响应类型
export interface StatsResponse {
  [key: string]: number | string | boolean | null
}

// 文件上传响应类型
export interface UploadResponse {
  url: string
  filename: string
  size: number
  type: string
}

// 错误响应类型
export interface ErrorResponse {
  success: false
  error: string
  message: string
  details?: Record<string, unknown>
}
