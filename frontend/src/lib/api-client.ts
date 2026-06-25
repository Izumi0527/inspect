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

// API 配置
const DEFAULT_API_ORIGIN = 'http://127.0.0.1:9000'
export const API_PREFIX = '/api/v1'

const stripTrailingSlashes = (value: string): string => value.replace(/\/+$/, '')

const normalizeApiOrigin = (value: string): string => {
  let normalized = stripTrailingSlashes(String(value ?? '').trim())
  if (!normalized) {
    return DEFAULT_API_ORIGIN
  }

  // 兼容误配：NEXT_PUBLIC_API_URL 可能被配置为 http(s)://host/api/v1（甚至重复拼接多次）。
  while (normalized.toLowerCase().endsWith(API_PREFIX)) {
    normalized = stripTrailingSlashes(normalized.slice(0, -API_PREFIX.length))
  }

  return normalized || DEFAULT_API_ORIGIN
}

/**
 * 获取后端 API Origin（不包含 /api/v1）。
 * - 兼容 `NEXT_PUBLIC_API_URL=http(s)://host` 与 `NEXT_PUBLIC_API_URL=http(s)://host/api/v1`
 */
export const getApiOrigin = (): string => {
  const raw = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_ORIGIN
  return normalizeApiOrigin(raw)
}

/** 获取后端 API BaseUrl（包含 /api/v1）。 */
export const getApiBaseUrl = (): string => `${getApiOrigin()}${API_PREFIX}`

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

  /** @deprecated 认证已迁移到 httpOnly Cookie；前端不再读取 access token。下载/导出请用 authorizedDownload。 */
  static getAccessToken(): string | null {
    if (typeof window === 'undefined') return null
    const authData = this.getAuthData()
    return authData?.token || null
  }

  /** @deprecated token 由后端 httpOnly Cookie 承载，前端不应再写入。 */
  static setAccessToken(token: string): void {
    if (typeof window === 'undefined') return
    this.updateAuthData({ token })
  }

  static getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null
    const authData = this.getAuthData()
    return authData?.refreshToken || null
  }

  /** @deprecated refresh token 由后端 httpOnly Cookie 承载，前端不应再写入。 */
  static setRefreshToken(token: string): void {
    if (typeof window === 'undefined') return
    this.updateAuthData({ refreshToken: token })
  }

  static clearTokens(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(this.AUTH_DATA_KEY)
  }

  // getCSRFToken 读取非 httpOnly 的 csrf_token Cookie，用于 double-submit 回填请求头。
  static getCSRFToken(): string | null {
    if (typeof document === 'undefined') return null
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)
    return match ? decodeURIComponent(match[1]) : null
  }

  // S3：token 改由后端 httpOnly Cookie 承载，前端不再存储 token（避免 XSS 窃取）。
  // 保留方法以兼容调用方；仅清理可能残留的旧 localStorage 凭据。
  static setTokens(_accessToken: string, _refreshToken: string): void {
    this.clearTokens()
  }
}

/**
 * authorizedDownload 为文件下载/导出等需原生 fetch 的场景提供统一的 Cookie 认证封装：
 * - credentials:'include' 让 httpOnly access_token cookie 随请求发送；
 * - 非安全方法自动回填 X-CSRF-Token（double-submit，与后端 csrf cookie 比对）；
 * - 不再发送 Authorization Bearer（已弃用 localStorage token）。
 * 返回原始 Response，调用方自行处理 blob/stream。
 */
export async function authorizedDownload(url: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = TokenManager.getCSRFToken()
    if (csrf) {
      headers.set('X-CSRF-Token', csrf)
    }
  }
  return fetch(url, { ...init, method, headers, credentials: 'include' })
}

// HTTP请求客户端类
class HttpClient {
  private baseURL: string
  private defaultHeaders: HeadersInit

  constructor() {
    this.baseURL = getApiBaseUrl()
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
  }

  // 构建请求头
  private buildHeaders(customHeaders?: HeadersInit): Headers {
    const headers = new Headers({ ...this.defaultHeaders, ...customHeaders })
    // S3：认证改由 httpOnly Cookie 承载（随请求自动发送），前端不再注入 Authorization。
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
    const legacyDetail = dataObject?.detail
    const legacyMessage = typeof dataObject?.message === 'string' ? dataObject.message : undefined
    const legacyType = typeof dataObject?.type === 'string' ? dataObject.type : undefined

    // 兼容后端统一错误结构：{ success:false, error:{ type, message, details? } }
    const backendErrorRaw = dataObject?.error
    const backendErrorObject =
      backendErrorRaw &&
      typeof backendErrorRaw === 'object' &&
      !Array.isArray(backendErrorRaw)
        ? (backendErrorRaw as Record<string, unknown>)
        : undefined
    const backendMessage =
      typeof backendErrorObject?.message === 'string'
        ? (backendErrorObject.message as string)
        : undefined
    const backendType =
      typeof backendErrorObject?.type === 'string'
        ? (backendErrorObject.type as string)
        : undefined
    const backendDetails =
      backendErrorObject && 'details' in backendErrorObject
        ? backendErrorObject.details
        : undefined

    if (!response.ok) {
      const resolvedMessage =
        backendMessage ??
        (typeof legacyDetail === 'string' ? legacyDetail : legacyMessage) ??
        (typeof data === 'string' && data.trim() ? data : undefined) ??
        `HTTP ${response.status} ${response.statusText}`

      const resolvedType = backendType ?? legacyType ?? 'api_error'

      const resolvedDetail =
        backendDetails ?? legacyDetail ?? backendErrorRaw ?? undefined

      const error: ApiError = {
        message: resolvedMessage,
        type: resolvedType,
        detail: resolvedDetail,
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
      retry,
      retryDelay = 1000,
      headers,
      body,
      params,
      method = 'GET',
      ...restConfig
    } = config

    const endpointWithParams = appendQuery(endpoint, params)
    const url = `${this.baseURL}${endpointWithParams}`
    const resolvedRetry = typeof retry === 'number'
      ? retry
      : (method === 'GET' || method === 'HEAD' ? 3 : 0)

    return this.withRetry(async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      try {
        const resolvedHeaders = this.buildHeaders(headers)
        // S3：状态变更请求回填 CSRF token（double-submit，与后端 csrf cookie 比对）。
        if (method !== 'GET' && method !== 'HEAD') {
          const csrf = TokenManager.getCSRFToken()
          if (csrf) {
            resolvedHeaders.set('X-CSRF-Token', csrf)
          }
        }
        const requestConfig: RequestInit = {
          ...restConfig,
          method,
          headers: resolvedHeaders,
          credentials: 'include',
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
      } finally {
        clearTimeout(timeoutId)
      }
    }, resolvedRetry, retryDelay)
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
    // S3：refresh token 由 httpOnly Cookie 携带，无需在 body 传递。
    refresh: () => httpClient.post<RefreshTokenResponse>('/auth/refresh'),
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
    // 批量更新设备（与后端契约保持一致）
    batchUpdate: (deviceIds: number[], updates: JsonRecord) =>
      httpClient.post('/devices/batch-update', { device_ids: deviceIds, updates }),
    // 新增: 批量导入设备
    batchImport: (devices: JsonRecord[]) =>
      httpClient.post('/devices/batch-import', { devices }),
    // 新增: 批量删除设备
    batchDelete: (deviceIds: number[]) =>
      httpClient.post('/devices/batch-delete', deviceIds),
    // 新增: 设备健康检查
    healthCheck: (id: number) =>
      httpClient.post(`/devices/${id}/health-check`),
    // 新增: 获取设备性能数据
    getPerformance: (id: number, params?: QueryParams) =>
      httpClient.get(appendQuery(`/devices/${id}/performance`, params)),
    // 新增: 设备探测（ICMP + SNMP）
    probe: (id: number) =>
      httpClient.post(`/devices/${id}/probe`),
    // 新增: 批量设备探测
    batchProbe: (deviceIds: number[], maxConcurrent?: number) =>
      httpClient.post('/devices/batch-probe', { 
        device_ids: deviceIds, 
        max_concurrent: maxConcurrent || 20 
      }),
    // 新增: 获取设备统计
    getStatistics: (params?: QueryParams) =>
      httpClient.get(appendQuery('/devices/statistics', params)),
  },

  // 监控数据
  monitoring: {
    overview: () => httpClient.get('/monitoring/overview'),
    devices: () => httpClient.get('/monitoring/devices'),
    // 新增: 设备状态列表
    devicesStatus: () => httpClient.get('/monitoring/devices/status'),
    // 新增: 监控统计
    stats: () => httpClient.get('/monitoring/stats'),
    // 新增: 设备状态分布
    distribution: () => httpClient.get('/monitoring/devices/distribution'),
    // 新增: 可用性统计
    availability: (params?: QueryParams) =>
      httpClient.get(appendQuery('/monitoring/availability', params)),
    metrics: (deviceId: number, timeRange?: string) =>
      httpClient.get(
        appendQuery(`/monitoring/devices/${deviceId}/metrics`,
          timeRange ? { time_range: timeRange } : undefined),
      ),
    // 新增: 设备历史指标
    history: (deviceId: number, params?: QueryParams) =>
      httpClient.get(appendQuery(`/monitoring/devices/${deviceId}/history`, params)),
    // 新增: 设备当前状态
    status: (deviceId: number) =>
      httpClient.get(`/monitoring/devices/${deviceId}/status`),
    historical: (params?: QueryParams) =>
      httpClient.get(appendQuery('/monitoring/historical', params)),
    // 新增: 批量设备历史
    bulkHistory: (deviceIds: number[], params?: QueryParams) =>
      httpClient.post('/monitoring/devices/historical', { 
        device_ids: deviceIds, 
        ...params 
      }),
    // 新增: 系统性能历史
    systemPerformance: (params?: QueryParams) =>
      httpClient.post('/monitoring/system/performance', params),
    // 新增: 网络流量历史
    networkTrafficHistory: (params?: QueryParams) =>
      httpClient.post('/monitoring/network/traffic/history', params),
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
    // 新增: 重新激活告警
    reactivate: (id: string | number) =>
      httpClient.post(`/alerts/${id}/reactivate`),
    // 新增: 删除告警
    delete: (id: string | number) =>
      httpClient.delete(`/alerts/${id}`),
    // 新增: 批量操作
    bulk: (action: string, alertIds: (string | number)[]) =>
      httpClient.post('/alerts/bulk', { action, alert_ids: alertIds }),
    // 新增: 告警统计
    statistics: (params?: QueryParams) =>
      httpClient.get(appendQuery('/alerts/statistics', params)),
    // 新增: 最近告警
    recent: (limit?: number) =>
      httpClient.get('/alerts/recent', { params: { limit: limit || 10 } }),
    rules: {
      list: () => httpClient.get('/alerts/rules'),
      get: (id: string | number) => httpClient.get(`/alerts/rules/${id}`),
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

  // 流量分析
  traffic: {
    summary: (params?: QueryParams) =>
      httpClient.get(appendQuery('/traffic/summary', params)),
    deviceTraffic: (deviceId: number) =>
      httpClient.get(`/traffic/devices/${deviceId}`),
    trend: (deviceId: number, params?: QueryParams) =>
      httpClient.get(appendQuery(`/traffic/devices/${deviceId}/trend`, params)),
    topTalkers: (limit?: number, sortBy?: string) =>
      httpClient.get('/traffic/top-talkers', { 
        params: { limit: limit || 10, sort_by: sortBy || 'total_bytes' } 
      }),
    bandwidthUtilization: (params?: QueryParams) =>
      httpClient.get(appendQuery('/traffic/bandwidth-utilization', params)),
    topBandwidth: (limit?: number) =>
      httpClient.get('/traffic/bandwidth-utilization/top', { 
        params: { limit: limit || 10 } 
      }),
  },
}

// 导出默认客户端
export default api
