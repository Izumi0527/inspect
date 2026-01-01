/**
 * 统一API客户端 - HTTP请求封装
 * 基于fetch API实现，集成认证、错误处理、重试机制
 */

import {
  LoginResponse,
  RefreshTokenResponse,
  ProfileResponse,
  AlertsListResponse,
  AlertDetailResponse,
  AlertActionResponse,
  DevicesListResponse,
  UsersListResponse,
  UserActionResponse,
  BulkOperationResponse,
  SystemStatusResponse,
  UploadResponse
} from './types/api-response.types'
import type { LoginCredentials } from './types/auth.types'


type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
type JsonRecord = Record<string, JsonValue>
interface AuthData {
  token?: string
  refreshToken?: string
  timestamp?: number
  [key: string]: JsonValue | undefined
}
type RequestBody = BodyInit | URLSearchParams | FormData | JsonRecord | Record<string, unknown> | object | string | undefined
type QueryValue = string | number | boolean | Array<string | number | boolean> | undefined
type QueryParams = Record<string, QueryValue>

const isJsonObject = (value: unknown): value is JsonRecord => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const appendQuery = (endpoint: string, params?: QueryParams): string => {
  if (!params) return endpoint
  const search = buildSearchParams(params).toString()
  return search ? `${endpoint}?${search}` : endpoint
}

const buildSearchParams = (params: QueryParams): URLSearchParams => {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    if (Array.isArray(value)) {
      value.forEach(item => searchParams.append(key, String(item)))
    } else {
      searchParams.append(key, String(value))
    }
  })
  return searchParams
}

// API配置
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const API_PREFIX = '/api/v1'

// 请求超时时间
const DEFAULT_TIMEOUT = 10000

// HTTP状态码枚举
export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,
}

// API响应接口
export interface ApiResponse<T = unknown> {
  data: T
  message?: string
  status: number
  success: boolean
}

// API错误接口  
export interface ApiError {
  message: string
  type: string
  detail?: unknown
  status: number
}

// 请求配置接口
export interface RequestConfig extends Omit<RequestInit, 'body'> {
  timeout?: number
  retry?: number
  retryDelay?: number
  body?: RequestBody
  params?: QueryParams
  beforeDate?: string | number
}

// 自定义错误类
export class ApiClientError extends Error {
  public status: number
  public type: string
  public detail?: unknown

  constructor(error: ApiError) {
    super(error.message)
    this.name = 'ApiClientError'
    this.status = error.status
    this.type = error.type
    this.detail = error.detail
  }
}

// Token管理器
export class TokenManager {
  private static AUTH_DATA_KEY = 'authData'

  // 获取认证数据
  private static getAuthData(): AuthData | null {
    if (typeof window === 'undefined') return null
    try {
      const authDataStr = localStorage.getItem(this.AUTH_DATA_KEY)
      if (!authDataStr) return null
      const parsed: unknown = JSON.parse(authDataStr)
      if (parsed && typeof parsed === 'object') {
        return parsed as AuthData
      }
      return null
    } catch (error) {
      console.error('Failed to parse authData:', error)
      return null
    }
  }

  // 更新认证数据
  private static updateAuthData(updates: Partial<AuthData>): void {
    if (typeof window === 'undefined') return
    try {
      const authData = this.getAuthData()
      const updatedAuthData: AuthData = {
        ...(authData ?? {}),
        ...updates
      }
      localStorage.setItem(this.AUTH_DATA_KEY, JSON.stringify(updatedAuthData))
    } catch (error) {
      console.error('Failed to update authData:', error)
    }
  }

  static getAccessToken(): string | null {
    if (typeof window === 'undefined') return null
    const authData = this.getAuthData()
    return authData?.token || null
  }

  static setAccessToken(token: string): void {
    if (typeof window === 'undefined') return
    this.updateAuthData({ token })
  }

  static getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null
    const authData = this.getAuthData()
    return authData?.refreshToken || null
  }

  static setRefreshToken(token: string): void {
    if (typeof window === 'undefined') return
    this.updateAuthData({ refreshToken: token })
  }

  static clearTokens(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(this.AUTH_DATA_KEY)
  }

  static setTokens(accessToken: string, refreshToken: string): void {
    if (typeof window === 'undefined') return
    this.updateAuthData({
      token: accessToken,
      refreshToken: refreshToken,
      timestamp: Date.now()
    })
  }
}

// HTTP请求客户端类
class HttpClient {
  private baseURL: string
  private defaultHeaders: HeadersInit

  constructor() {
    this.baseURL = `${API_BASE_URL}${API_PREFIX}`
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
  }

  // 创建超时控制器
  private createTimeoutController(timeout: number): AbortController {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), timeout)
    return controller
  }

  // 构建请求头
  private buildHeaders(customHeaders?: HeadersInit): Headers {
    const headers = new Headers({ ...this.defaultHeaders, ...customHeaders })
    
    // 添加认证令牌
    const token = TokenManager.getAccessToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    return headers
  }

  // 处理响应
  private async handleResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('Content-Type')
    let data: unknown

    if (contentType?.includes('application/json')) {
      try {
        data = await response.json()
      } catch (error) {
        console.error('Failed to parse JSON response:', error)
        data = null
      }
    } else {
      data = await response.text()
    }

    const dataObject = isJsonObject(data) ? data : undefined
    const detail = dataObject?.detail
    const message = typeof dataObject?.message === 'string' ? dataObject.message : undefined
    const type = typeof dataObject?.type === 'string' ? dataObject.type : undefined

    if (!response.ok) {
      const error: ApiError = {
        message: typeof detail === 'string' ? detail : message || `HTTP ${response.status} ${response.statusText}`,
        type: type || 'api_error',
        detail,
        status: response.status,
      }

      throw new ApiClientError(error)
    }

    return data as T
  }

  // 重试机制
  private async withRetry<T>(
    fn: () => Promise<T>,
    retry: number = 3,
    retryDelay: number = 1000
  ): Promise<T> {
    let lastError: unknown
    
    for (let attempt = 0; attempt <= retry; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error
        
        // 不重试4xx错误
        if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) {
          throw error
        }
        
        // 最后一次尝试，抛出错误
        if (attempt === retry) {
          break
        }
        
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)))
      }
    }
    
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  // 基础请求方法
  private async request<T>(
    endpoint: string,
    config: RequestConfig = {}
  ): Promise<T> {
    const {
      timeout = DEFAULT_TIMEOUT,
      retry = 3,
      retryDelay = 1000,
      headers,
      body,
      params,
      ...restConfig
    } = config

    const endpointWithParams = appendQuery(endpoint, params)
    const url = `${this.baseURL}${endpointWithParams}`
    const controller = this.createTimeoutController(timeout)

    return this.withRetry(async () => {
      const resolvedHeaders = this.buildHeaders(headers)
      const requestConfig: RequestInit = {
        ...restConfig,
        headers: resolvedHeaders,
        signal: controller.signal,
      }

      if (body !== undefined && body !== null) {
        if (body instanceof FormData) {
          resolvedHeaders.delete('Content-Type')
          requestConfig.body = body
        } else if (body instanceof URLSearchParams) {
          requestConfig.body = body
        } else if (typeof body === 'string') {
          requestConfig.body = body
        } else if (typeof body === 'object') {
          requestConfig.body = JSON.stringify(body)
        } else {
          requestConfig.body = String(body)
        }
      }

      const response = await fetch(url, requestConfig)
      return this.handleResponse<T>(response)
    }, retry, retryDelay)
  }

  // GET请求
  async get<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: 'GET' })
  }

  // POST请求
  async post<T>(endpoint: string, data?: RequestBody, config?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: 'POST', body: data })
  }

  // PUT请求
  async put<T>(endpoint: string, data?: RequestBody, config?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: 'PUT', body: data })
  }

  // PATCH请求
  async patch<T>(endpoint: string, data?: RequestBody, config?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: 'PATCH', body: data })
  }

  // DELETE请求
  async delete<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: 'DELETE' })
  }

  // 文件上传
  async uploadFile<T>(endpoint: string, file: File | FormData, config?: RequestConfig): Promise<T> {
    const formData = file instanceof FormData ? file : new FormData()
    if (file instanceof File) {
      formData.append('file', file)
    }

    return this.request<T>(endpoint, {
      ...config,
      method: 'POST',
      body: formData,
    })
  }
}

// 导出HTTP客户端实例
export const httpClient = new HttpClient()

// 便捷的API方法
export const api = {
  // 基础HTTP方法
  get: httpClient.get.bind(httpClient),
  post: httpClient.post.bind(httpClient),
  put: httpClient.put.bind(httpClient),
  patch: httpClient.patch.bind(httpClient),
  delete: httpClient.delete.bind(httpClient),
  upload: httpClient.uploadFile.bind(httpClient),

  // 认证相关
  auth: {
    login: (credentials: LoginCredentials) => {
      const payload: JsonRecord = {
        username: credentials.username,
        password: credentials.password,
      }
      if (typeof credentials.remember_me === 'boolean') {
        payload.remember_me = credentials.remember_me
      }
      return httpClient.post<LoginResponse>('/auth/login', payload)
    },
    logout: () => httpClient.post<{ success: boolean }>('/auth/logout'),
    refresh: () =>
      httpClient.post<RefreshTokenResponse>('/auth/refresh', {
        refresh_token: TokenManager.getRefreshToken(),
      }),
    profile: () => httpClient.get<ProfileResponse>('/auth/profile'),
    changePassword: (data: JsonRecord) => httpClient.post<UserActionResponse>('/auth/change-password', data),
  },

  // 设备管理
  devices: {
    list: (params?: QueryParams) =>
      httpClient.get<DevicesListResponse>(appendQuery('/devices', params)),
    get: (id: number) => httpClient.get(`/devices/${id}`),
    create: (data: JsonRecord) => httpClient.post('/devices', data),
    update: (id: number, data: JsonRecord) => httpClient.put(`/devices/${id}`, data),
    delete: (id: number) => httpClient.delete(`/devices/${id}`),
    discover: (subnet: string) => httpClient.post('/devices/discover', { subnet }),
    bulkAction: (action: string, deviceIds: number[]) =>
      httpClient.post('/devices/bulk', { action, device_ids: deviceIds }),
  },

  // 监控数据
  monitoring: {
    overview: () => httpClient.get('/monitoring/overview'),
    devices: () => httpClient.get('/monitoring/devices'),
    metrics: (deviceId: number, timeRange?: string) =>
      httpClient.get(
        appendQuery(`/monitoring/devices/${deviceId}/metrics`,
          timeRange ? { time_range: timeRange } : undefined),
      ),
    historical: (params?: QueryParams) =>
      httpClient.get(appendQuery('/monitoring/historical', params)),
  },

  // 告警管理
  alerts: {
    list: (params?: QueryParams) =>
      httpClient.get<AlertsListResponse>(appendQuery('/alerts', params)),
    get: (id: string | number) => httpClient.get<AlertDetailResponse>(`/alerts/${id}`),
    acknowledge: (id: string | number, data?: JsonRecord) =>
      httpClient.post<AlertActionResponse>(`/alerts/${id}/acknowledge`, data),
    resolve: (id: string | number, data?: JsonRecord) =>
      httpClient.post<AlertActionResponse>(`/alerts/${id}/resolve`, data),
    rules: {
      list: () => httpClient.get('/alerts/rules'),
      create: (data: JsonRecord) => httpClient.post('/alerts/rules', data),
      update: (id: string | number, data: JsonRecord) => httpClient.put(`/alerts/rules/${id}`, data),
      delete: (id: string | number) => httpClient.delete(`/alerts/rules/${id}`),
    },
  },

  // 巡检管理
  inspection: {
    templates: {
      list: () => httpClient.get('/inspection/templates'),
      get: (id: number) => httpClient.get(`/inspection/templates/${id}`),
      create: (data: JsonRecord) => httpClient.post('/inspection/templates', data),
      update: (id: number, data: JsonRecord) => httpClient.put(`/inspection/templates/${id}`, data),
      delete: (id: number) => httpClient.delete(`/inspection/templates/${id}`),
    },
    tasks: {
      list: (params?: QueryParams) =>
        httpClient.get(appendQuery('/inspection/tasks', params)),
      get: (id: number) => httpClient.get(`/inspection/tasks/${id}`),
      create: (data: JsonRecord) => httpClient.post('/inspection/tasks', data),
      cancel: (id: number) => httpClient.post(`/inspection/tasks/${id}/cancel`),
    },
    results: {
      list: (params?: QueryParams) =>
        httpClient.get(appendQuery('/inspection/results', params)),
      get: (id: number) => httpClient.get(`/inspection/results/${id}`),
    },
  },

  // 报表分析
  reports: {
    generate: (type: string, data: JsonRecord) => httpClient.post(`/reports/${type}`, data),
    download: (reportId: string) => httpClient.get(`/reports/${reportId}/download`),
    list: (params?: QueryParams) =>
      httpClient.get(appendQuery('/reports', params)),
  },

  // 系统设置
  system: {
    info: () => httpClient.get<SystemStatusResponse>('/system/info'),
    settings: {
      get: () => httpClient.get('/system/settings'),
      update: (data: JsonRecord) => httpClient.put('/system/settings', data),
    },
    backup: () => httpClient.post('/system/backup'),
    restore: (file: File) => httpClient.uploadFile('/system/restore', file),
  },

  // 用户管理
  users: {
    list: (params?: QueryParams) =>
      httpClient.get<UsersListResponse>(appendQuery('/settings/users', params)),
    get: (id: number) => httpClient.get(`/settings/users/${id}`),
    create: (data: JsonRecord) => httpClient.post('/settings/users', data),
    update: (id: number, data: JsonRecord) => httpClient.put(`/settings/users/${id}`, data),
    delete: (id: number) => httpClient.delete(`/settings/users/${id}`),
    bulkAction: (action: string, userIds: number[]) =>
      httpClient.post('/settings/users/bulk', { action, user_ids: userIds }),
    bulkOperation: (data: JsonRecord) =>
      httpClient.post<BulkOperationResponse>('/settings/users/bulk-operation', data),
    importUsers: (file: File) => httpClient.uploadFile<UploadResponse>('/settings/users/import', file),
    getUsers: (params?: QueryParams) =>
      httpClient.get<UsersListResponse>(appendQuery('/settings/users', params)),
    getUserPermissions: (id: string) => httpClient.get(`/settings/users/${id}/permissions`),
  },
}

// 导出默认客户端
export default api
