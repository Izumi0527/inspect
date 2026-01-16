type ConfigPrimitive = string | number | boolean

type ConfigValue = ConfigPrimitive | ConfigPrimitive[] | Record<string, unknown> | null

// 系统配置类型
export interface SystemConfig {
  id: string
  category: 'general' | 'monitoring' | 'alert' | 'security' | 'notification'
  key: string
  value: ConfigValue
  type: 'string' | 'number' | 'boolean' | 'json' | 'array'
  label: string
  description: string
  required: boolean
  readonly: boolean
  validation?: {
    min?: number
    max?: number
    pattern?: string
    options?: Array<{ label: string; value: ConfigPrimitive }>
  }
  updatedAt: string
  updatedBy: string
}

// 用户信息
export interface User {
  id: string
  username: string
  email: string
  fullName: string
  avatar?: string
  status: UserStatus
  role: UserRole
  permissions: string[]
  lastLoginAt?: string
  lastLoginIP?: string
  createdAt: string
  updatedAt: string
  createdBy: string
}

// 用户查询参数
export interface UserQueryParams {
  page?: number
  pageSize?: number
  search?: string
  role?: string
  status?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

// 用户更新数据
export interface UserUpdate {
  username?: string
  email?: string
  fullName?: string
  avatar?: string
  status?: UserStatus
  role?: UserRole
  permissions?: string[]
}

// 用户批量操作
export interface UserBulkOperation {
  type: 'activate' | 'deactivate' | 'lock' | 'unlock' | 'delete' | 'update_role'
  userIds: string[]
  params?: Record<string, unknown>
}

// 用户批量导入
export interface ImportUserPayload {
  username: string
  email: string
  fullName?: string
  role: UserRole
  password?: string
}

export interface UserBulkImport {
  users: ImportUserPayload[]
  sendEmail: boolean
  forcePasswordChange: boolean
}

export interface UserBulkImportError {
  row: number
  error: string
}

export interface UserBulkImportResult {
  total: number
  success: number
  failed: number
  errors: UserBulkImportError[]
}

// 用户角色联合类型（组件使用）
export type UserRole = 'admin' | 'operator' | 'viewer'

// 用户状态联合类型（组件使用）
export type UserStatus = 'active' | 'inactive' | 'locked' | 'pending'

// 用户角色接口（数据库使用）
export interface UserRoleInfo {
  id: string
  name: string
  displayName: string
}

// 分页响应基础接口
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  hasNext: boolean
  hasPrev: boolean
}

// 用户分页响应
export type UserPaginatedResponse = PaginatedResponse<User>

// 角色信息
export interface Role {
  id: string
  name: string
  displayName: string
  description: string
  permissions: Permission[]
  userCount: number
  isBuiltIn: boolean
  createdAt: string
  updatedAt: string
}

// 权限信息
export interface Permission {
  id: string
  name: string
  displayName: string
  description: string
  module: string
  action: 'create' | 'read' | 'update' | 'delete' | 'execute'
  resource: string
}

// 审计日志
export interface AuditLog {
  id: string
  userId: string
  username: string
  action: string
  resource: string
  resourceId?: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  ip: string
  userAgent: string
  status: 'success' | 'failed' | 'error'
  details?: Record<string, unknown>
  duration: number // 执行时间(ms)
  timestamp: string
}

// 备份信息
export interface Backup {
  id: string
  name: string
  description?: string
  type: 'full' | 'incremental' | 'differential'
  status: 'creating' | 'completed' | 'failed' | 'corrupted'
  size: number // 字节
  filePath: string
  checksum: string
  includes: BackupInclude[]
  createdAt: string
  createdBy: string
  restoredAt?: string
  restoredBy?: string
}

// 备份包含项
export interface BackupInclude {
  type: 'database' | 'config' | 'logs' | 'files'
  name: string
  size: number
  records?: number
}

// 系统监控指标
export interface SystemMetrics {
  timestamp: string
  cpu: {
    usage: number // 0-100
    cores: number
    loadAverage: number[]
  }
  memory: {
    used: number // bytes
    total: number // bytes
    usage: number // 0-100
  }
  disk: {
    used: number // bytes
    total: number // bytes
    usage: number // 0-100
  }
  network: {
    rxBytes: number
    txBytes: number
    rxPackets: number
    txPackets: number
  }
  database: {
    connections: number
    activeConnections: number
    queryTime: number // ms
    size: number // bytes
  }
  application: {
    uptime: number // seconds
    requests: number
    errors: number
    avgResponseTime: number // ms
  }
}

// 通知配置
export interface NotificationConfig {
  id: string
  type: 'email' | 'sms' | 'webhook' | 'dingtalk' | 'wechat'
  name: string
  enabled: boolean
  config: EmailConfig | SMSConfig | WebhookConfig | DingtalkConfig | WechatConfig
  testRecipient?: string
  lastTestAt?: string
  lastTestStatus?: 'success' | 'failed'
}

// 邮件配置
export interface EmailConfig {
  smtp: {
    host: string
    port: number
    secure: boolean
    username: string
    password: string
  }
  from: {
    name: string
    email: string
  }
  templates: {
    subject: string
    body: string
  }
}

// 短信配置
export interface SMSConfig {
  provider: string
  accessKey: string
  secretKey: string
  signName: string
  templateCode: string
}

// Webhook配置
export interface WebhookConfig {
  url: string
  method: 'GET' | 'POST' | 'PUT'
  headers: Record<string, string>
  body?: string
  timeout: number
}

// 钉钉配置
export interface DingtalkConfig {
  webhook: string
  secret?: string
  atMobiles?: string[]
  atUserIds?: string[]
  isAtAll?: boolean
}

// 微信配置
export interface WechatConfig {
  corpId: string
  corpSecret: string
  agentId: number
  toUser?: string
  toParty?: string
  toTag?: string
}

// 安全设置
export interface SecurityConfig {
  passwordPolicy: {
    minLength: number
    requireUppercase: boolean
    requireLowercase: boolean
    requireNumbers: boolean
    requireSymbols: boolean
    maxAge: number // days
    history: number // 记住几个历史密码
  }
  sessionPolicy: {
    timeout: number // minutes
    maxConcurrent: number
    forceLogout: boolean
  }
  loginPolicy: {
    maxAttempts: number
    lockoutDuration: number // minutes
    requireCaptcha: boolean
    twoFactorAuth: boolean
  }
  ipWhitelist: {
    enabled: boolean
    addresses: string[]
  }
  apiSecurity: {
    rateLimiting: {
      enabled: boolean
      requests: number
      window: number // seconds
    }
    cors: {
      enabled: boolean
      origins: string[]
    }
  }
}

// 数据库配置
export interface DatabaseConfig {
  host: string
  port: number
  database: string
  username: string
  password: string
  ssl: boolean
  poolSize: number
  timeout: number
  backup: {
    enabled: boolean
    schedule: string
    retention: number // days
    location: string
  }
}

// 缓存配置
export interface CacheConfig {
  redis: {
    host: string
    port: number
    password?: string
    database: number
    timeout: number
    maxRetries: number
  }
  ttl: {
    default: number // seconds
    session: number
    data: number
    reports: number
  }
}

// 系统信息
export interface SystemInfo {
  version: string
  buildTime: string
  gitCommit: string
  environment: 'development' | 'staging' | 'production'
  uptime: number // seconds
  startTime: string
  timezone: string
  locale: string
  features: string[]
  dependencies: Array<{
    name: string
    version: string
    license?: string
  }>
}

// 许可证信息
export interface License {
  id: string
  type: 'trial' | 'standard' | 'professional' | 'enterprise'
  holder: string
  email: string
  maxDevices: number
  maxUsers: number
  features: string[]
  issueDate: string
  expiryDate: string
  status: 'active' | 'expired' | 'invalid'
  signature: string
}

// API响应类型
export interface SettingsApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

// 设置分组
export interface SettingsGroup {
  id: string
  name: string
  displayName: string
  description: string
  icon: string
  order: number
  configs: SystemConfig[]
}

// 操作日志
export interface OperationLog {
  id: string
  userId: string
  username: string
  operation: string
  target: string
  targetId?: string
  before?: unknown
  after?: unknown
  ip: string
  userAgent: string
  success: boolean
  error?: string
  duration: number
  timestamp: string
}

// 系统健康状态
export interface SystemHealth {
  overall: 'healthy' | 'warning' | 'critical'
  services: Array<{
    name: string
    status: 'running' | 'stopped' | 'error'
    uptime: number
    lastCheck: string
    details?: string
  }>
  resources: {
    cpu: { status: 'normal' | 'warning' | 'critical'; usage: number }
    memory: { status: 'normal' | 'warning' | 'critical'; usage: number }
    disk: { status: 'normal' | 'warning' | 'critical'; usage: number }
    database: { status: 'normal' | 'warning' | 'critical'; connections: number }
  }
  alerts: Array<{
    level: 'info' | 'warning' | 'error' | 'critical'
    message: string
    timestamp: string
  }>
}

// 导入导出配置
export interface ImportExportConfig {
  export: {
    formats: string[]
    encryption: boolean
    compression: boolean
    includes: string[]
  }
  import: {
    validation: boolean
    preview: boolean
    merge: 'overwrite' | 'skip' | 'merge'
  }
}
