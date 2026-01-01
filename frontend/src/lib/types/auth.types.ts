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
  // 设备管理权限
  DEVICE_READ = 'device:read',
  DEVICE_WRITE = 'device:write',
  DEVICE_DELETE = 'device:delete',
  DEVICE_DISCOVER = 'device:discover',
  
  // 监控权限
  MONITORING_READ = 'monitoring:read',
  MONITORING_MANAGE = 'monitoring:manage',
  
  // 巡检权限
  INSPECTION_READ = 'inspection:read',
  INSPECTION_WRITE = 'inspection:write',
  INSPECTION_EXECUTE = 'inspection:execute',
  
  // 告警权限
  ALERT_READ = 'alert:read',
  ALERT_MANAGE = 'alert:manage',
  ALERT_RULE_MANAGE = 'alert:rule_manage',
  
  // 报表权限
  REPORT_READ = 'report:read',
  REPORT_GENERATE = 'report:generate',
  REPORT_EXPORT = 'report:export',
  
  // 用户管理权限
  USER_READ = 'user:read',
  USER_WRITE = 'user:write',
  USER_DELETE = 'user:delete',
  
  // 系统管理权限
  SYSTEM_READ = 'system:read',
  SYSTEM_MANAGE = 'system:manage',
  SYSTEM_BACKUP = 'system:backup',
}

// 用户信息接口
export interface User {
  id: number
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