/**
 * 认证相关类型定义
 */

// 用户角色枚举
export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager', 
  OPERATOR = 'operator',
  VIEWER = 'viewer',
}

// 用户权限枚举
export enum Permission {
  // 用户管理权限
  USERS_READ = 'users:read',
  USERS_CREATE = 'users:create',
  USERS_UPDATE = 'users:update',
  USERS_DELETE = 'users:delete',

  // 设备管理权限
  DEVICES_READ = 'devices:read',
  DEVICES_CREATE = 'devices:create',
  DEVICES_UPDATE = 'devices:update',
  DEVICES_DELETE = 'devices:delete',

  // 巡检权限
  INSPECTIONS_READ = 'inspections:read',
  INSPECTIONS_CREATE = 'inspections:create',
  INSPECTIONS_UPDATE = 'inspections:update',
  INSPECTIONS_DELETE = 'inspections:delete',
  INSPECTIONS_EXECUTE = 'inspections:execute',

  // 告警权限
  ALERTS_READ = 'alerts:read',
  ALERTS_CREATE = 'alerts:create',
  ALERTS_UPDATE = 'alerts:update',
  ALERTS_DELETE = 'alerts:delete',

  // 监控权限
  MONITORING_READ = 'monitoring:read',
  MONITORING_CONTROL = 'monitoring:control',
  MONITORING_EXPORT = 'monitoring:export',

  // 报表权限
  REPORTS_READ = 'reports:read',
  REPORTS_CREATE = 'reports:create',
  REPORTS_UPDATE = 'reports:update',
  REPORTS_DELETE = 'reports:delete',

  // 系统管理权限
  SYSTEM_CONFIG = 'system:config',
  SYSTEM_LOGS = 'system:logs',
  SYSTEM_LOGS_MANAGE = 'system:logs:manage',
}

// 用户信息接口
export interface User {
  id: string
  username: string
  email: string
  full_name: string
  avatar?: string
  role: UserRole
  permissions: Permission[]
  is_active: boolean
  last_login?: string
  created_at: string
  updated_at: string
}

// 登录凭据接口
export interface LoginCredentials {
  username: string
  password: string
  remember_me?: boolean
}

// 登录响应接口
export interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user: User
}

// 认证状态接口
export interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  user: User | null
  error: string | null
}

// 认证上下文接口
export interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => Promise<void>
  refreshToken: () => Promise<void>
  updateUser: (user: Partial<User>) => void
  checkPermission: (permission: Permission) => boolean
  checkRole: (role: UserRole | UserRole[]) => boolean
  clearError: () => void
}

// 密码修改接口
export interface ChangePasswordData {
  current_password: string
  new_password: string
  confirm_password: string
}

// JWT解码后的payload接口
export interface JwtPayload {
  sub: string // 用户ID
  username: string
  email: string
  role: UserRole
  permissions: Permission[]
  exp: number
  iat: number
  jti: string
}

// 路由守卫配置接口
export interface RouteGuard {
  requireAuth?: boolean
  requiredPermissions?: Permission[]
  requiredRoles?: UserRole[]
  redirectTo?: string
}
