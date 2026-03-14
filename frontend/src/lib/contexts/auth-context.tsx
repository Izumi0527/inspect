'use client'

/**
 * 认证上下文和Hook
 * 提供全局认证状态管理和用户权限验证
 */

import { createContext, useContext, useEffect, useReducer, useCallback, useMemo, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { api, TokenManager, ApiClientError } from '../api-client'
import { normalizePermissionKey, normalizePermissionList } from '../authz/permission'
import {
  AuthState,
  AuthContextType,
  LoginCredentials,
  User,
  UserRole,
  Permission,
  JwtPayload,
} from '../types/auth.types'

// 认证Action类型
type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User } }
  | { type: 'LOGOUT' }
  | { type: 'UPDATE_USER'; payload: Partial<User> }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'CLEAR_ERROR' }

// 初始状态
const initialState: AuthState = {
  isAuthenticated: false,
  isLoading: true,
  user: null,
  error: null,
}

// 认证状态管理Reducer
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }
    
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        isAuthenticated: true,
        isLoading: false,
        user: action.payload.user,
        error: null,
      }
    
    case 'LOGOUT':
      return {
        ...state,
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: null,
      }
    
    case 'UPDATE_USER':
      return {
        ...state,
        user: state.user ? { ...state.user, ...action.payload } : null,
      }
    
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false }
    
    case 'CLEAR_ERROR':
      return { ...state, error: null }
    
    default:
      return state
  }
}

// JWT解码工具函数
function decodeJwt(token: string): JwtPayload | null {
  try {
    const base64Payload = token.split('.')[1]
    const payload = JSON.parse(atob(base64Payload))
    return payload as JwtPayload
  } catch {
    return null
  }
}

// JWT是否过期检查
function isTokenExpired(token: string): boolean {
  const payload = decodeJwt(token)
  if (!payload) return true
  
  const currentTime = Math.floor(Date.now() / 1000)
  return payload.exp < currentTime
}

// 创建认证上下文
const AuthContext = createContext<AuthContextType | undefined>(undefined)

// 认证上下文Provider组件
interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialState)
  const router = useRouter()

  // 登录函数
  const login = useCallback(async (credentials: LoginCredentials) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true })
      dispatch({ type: 'CLEAR_ERROR' })
      
      const response = await api.auth.login(credentials)
      
      // 保存Token
      TokenManager.setTokens(response.access_token, response.refresh_token)
      
      // 更新用户状态
      dispatch({ type: 'LOGIN_SUCCESS', payload: { user: response.user } })
      
      toast.success(`欢迎回来，${response.user.full_name}！`)
      
      // 跳转到仪表板
      router.push('/dashboard')
      
    } catch (error) {
      console.error('Login failed:', error)
      
      let errorMessage = '登录失败，请检查用户名和密码'
      
      if (error instanceof ApiClientError) {
        if (error.status === 401) {
          errorMessage = '用户名或密码错误'
        } else if (error.status === 403) {
          errorMessage = '账户已被禁用，请联系管理员'
        } else {
          errorMessage = error.message
        }
      }
      
      dispatch({ type: 'SET_ERROR', payload: errorMessage })
      toast.error(errorMessage)
    }
  }, [router])

  // 登出函数
  const logout = useCallback(async () => {
    let apiFailed = false
    try {
      dispatch({ type: 'SET_LOADING', payload: true })
      
      // 调用后端登出API
      await api.auth.logout()
    } catch (error) {
      apiFailed = true
      console.error('Logout API failed:', error)
    } finally {
      // 清除本地Token
      TokenManager.clearTokens()
      
      // 更新状态
      dispatch({ type: 'LOGOUT' })
      
      // 跳转到登录页
      router.push('/login')
      
      if (apiFailed) {
        toast('已清理本地登录态（服务端登出失败）')
      } else {
        toast.success('已安全退出')
      }
    }
  }, [router])

  // Token刷新函数
  const refreshToken = useCallback(async (): Promise<void> => {
    try {
      const refreshToken = TokenManager.getRefreshToken()
      if (!refreshToken) {
        throw new Error('No refresh token available')
      }

      const response = await api.auth.refresh()

      // 更新Token
      TokenManager.setTokens(response.access_token, response.refresh_token)

    } catch (error) {
      console.error('Token refresh failed:', error)

      // Token刷新失败，强制重新登录
      TokenManager.clearTokens()
      dispatch({ type: 'LOGOUT' })
      router.push('/login')

      throw error // 重新抛出错误，让调用者知道刷新失败
    }
  }, [router])

  // 更新用户信息
  const updateUser = useCallback((userData: Partial<User>) => {
    dispatch({ type: 'UPDATE_USER', payload: userData })
  }, [])

  const normalizedPermissionSet = useMemo(() => {
    const raw = (state.user?.permissions ?? []) as unknown as string[]
    return new Set<string>(normalizePermissionList(raw))
  }, [state.user?.permissions])

  // 权限检查
  const checkPermission = useCallback((permission: Permission): boolean => {
    if (!state.user) return false
    const required = normalizePermissionKey(String(permission))
    if (required === '') return true
    return normalizedPermissionSet.has(required)
  }, [normalizedPermissionSet, state.user])

  // 角色检查
  const checkRole = useCallback((roles: UserRole | UserRole[]): boolean => {
    if (!state.user) return false
    const roleArray = Array.isArray(roles) ? roles : [roles]
    return roleArray.includes(state.user.role)
  }, [state.user])

  // 清除错误
  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' })
  }, [])

  // 初始化认证状态
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const accessToken = TokenManager.getAccessToken()
        
        if (!accessToken) {
          dispatch({ type: 'SET_LOADING', payload: false })
          return
        }
        
        // 检查Token是否过期
        if (isTokenExpired(accessToken)) {
          // 尝试刷新Token
          try {
            await refreshToken()
          } catch (error) {
            console.error('Token refresh during initialization failed:', error)
            // 刷新失败，停止初始化
            return
          }
        }
        
        // 获取用户信息
        const user = await api.auth.profile()
        dispatch({ type: 'LOGIN_SUCCESS', payload: { user } })
        
      } catch (error) {
        console.error('Auth initialization failed:', error)
        TokenManager.clearTokens()
        dispatch({ type: 'SET_LOADING', payload: false })
      }
    }

    initializeAuth()
  }, [refreshToken])

  // 设置Token自动刷新
  useEffect(() => {
    if (!state.isAuthenticated) return

    const setupTokenRefresh = () => {
      const accessToken = TokenManager.getAccessToken()
      if (!accessToken) return

      const payload = decodeJwt(accessToken)
      if (!payload) return

      // 在Token过期前5分钟刷新
      const refreshTime = (payload.exp - Math.floor(Date.now() / 1000) - 300) * 1000
      
      if (refreshTime > 0) {
        const timer = setTimeout(async () => {
          await refreshToken()
          setupTokenRefresh() // 递归设置下一次刷新
        }, refreshTime)

        return () => clearTimeout(timer)
      }
    }

    return setupTokenRefresh()
  }, [state.isAuthenticated, refreshToken])

  const contextValue: AuthContextType = {
    ...state,
    login,
    logout,
    refreshToken,
    updateUser,
    checkPermission,
    checkRole,
    clearError,
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

// 认证Hook
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// 权限验证Hook
export function usePermission(permission: Permission): boolean {
  const { checkPermission } = useAuth()
  return checkPermission(permission)
}

// 角色验证Hook
export function useRole(roles: UserRole | UserRole[]): boolean {
  const { checkRole } = useAuth()
  return checkRole(roles)
}

// useRequireAuth 可选参数接口
interface UseRequireAuthOptions {
  skipRedirect?: boolean // 是否跳过自动跳转（默认 false）
}

// 需要认证的Hook
export function useRequireAuth(options: UseRequireAuthOptions = {}) {
  const { skipRedirect = false } = options
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // 如果 skipRedirect 为 true，跳过自动跳转
    if (skipRedirect) {
      return
    }

    if (!isLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, isLoading, router, skipRedirect])

  return { isAuthenticated, isLoading }
}

// 访客限制高阶组件（用于登录页等）
export function withGuest<P extends object>(
  WrappedComponent: React.ComponentType<P>
): React.ComponentType<P> {
  return function GuestOnlyComponent(props: P) {
    const { isAuthenticated, isLoading } = useAuth()
    const router = useRouter()

    useEffect(() => {
      if (!isLoading && isAuthenticated) {
        router.push('/dashboard')
      }
    }, [isAuthenticated, isLoading, router])

    // 如果正在加载或已认证，不渲染组件
    if (isLoading || isAuthenticated) {
      return null
    }

    return <WrappedComponent {...props} />
  }
}
