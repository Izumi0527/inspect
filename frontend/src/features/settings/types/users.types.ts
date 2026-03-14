// 内置用户角色（系统默认）
export type BuiltInUserRole = 'admin' | 'operator' | 'viewer'

// 用户角色（支持自定义角色）
// 说明：后端角色表允许新增自定义角色，因此这里不能只限制为内置 3 种。
export type UserRole = BuiltInUserRole | (string & {})

// 用户状态
export type UserStatus = 'active' | 'inactive' | 'locked'

// 用户信息
export interface User {
  id: string
  username: string
  email: string
  fullName: string
  role: UserRole
  status: UserStatus
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

// 角色信息
export interface Role {
  id: string
  name: UserRole
  displayName: string
  description: string
  permissions: Permission[]
  permissionIds?: string[]
  userCount: number
  isBuiltIn?: boolean
  createdAt?: string
  updatedAt?: string
}

// 权限信息
export interface Permission {
  id: string
  name: string
  displayName: string
  module: string
  action: string
  resource: string
  description?: string | null
}

// 用户列表响应
export interface UserListResponse {
  users: User[]
  totalCount: number
  page: number
  pageSize: number
}

// 角色列表响应
export interface RoleListResponse {
  roles: Role[]
}

// 创建用户请求
export interface CreateUserRequest {
  username: string
  email: string
  password: string
  fullName: string
  role: UserRole
  status?: UserStatus
  forcePasswordChange?: boolean
}

// 更新用户请求
export interface UpdateUserRequest {
  email?: string
  fullName?: string
  role?: UserRole
  status?: UserStatus
}

// 修改密码请求
export interface ChangePasswordRequest {
  userId: string
  newPassword: string
}

// 批量操作请求
export interface BatchOperationRequest {
  userIds: string[]
  operation: 'activate' | 'deactivate' | 'lock' | 'unlock' | 'delete'
}

// 用户统计
export interface UserStats {
  totalUsers: number
  activeUsers: number
  inactiveUsers: number
  lockedUsers: number
  adminCount: number
  operatorCount: number
  viewerCount: number
}

// 用户查询参数
export interface UserQueryParams {
  page?: number
  pageSize?: number
  keyword?: string
  role?: UserRole
  status?: UserStatus
  department?: string
  sortBy?: 'username' | 'email' | 'createdAt' | 'lastLoginAt'
  sortOrder?: 'asc' | 'desc'
}
