'use client'

/**
 * 认证上下文和Hook
 * 提供全局认证状态管理和用户权限验证
 */

import { createContext, useContext, useEffect, useReducer, useCallback, useMemo, useRef, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
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

export function isNetworkConnectionError(error: unknown): boolean {
  if (error instanceof TypeError && /failed to fetch/i.test(error.message)) {
    return true
  }

  if (error instanceof Error) {
    return /networkerror|network request failed|err_connection_refused|failed to fetch/i.test(error.message)
  }

  return false
}

// 公开路由：无需登录即可访问，挂载时不做认证探测。
// 未登录访客在这些页面上原本会连收两个 401（/auth/profile 与 /auth/refresh），
// 既拖慢首屏又让控制台常态化报错，掩盖真实问题。
//
// 注意：/login 不属于公开路由。withGuest 依赖探测结果把已登录用户送回 dashboard，
// 若跳过探测，该重定向会永久失效。
const PUBLIC_ROUTE_PREFIXES = ['/docs', '/health'] as const

export function isPublicRoute(pathname: string | null): boolean {
  if (!pathname) return false
  if (pathname === '/') return true
  return PUBLIC_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
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
  const pathname = usePathname()
  // 认证探测的生命周期：pending 尚未处理，skipped 停在公开页（已置 isLoading=false），done 已探测。
  const authProbeRef = useRef<'pending' | 'skipped' | 'done'>('pending')

  // 登录函数
  const login = useCallback(async (credentials: LoginCredentials) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true })
      dispatch({ type: 'CLEAR_ERROR' })

      const response = await api.auth.login(credentials)

      // S3：token 已由后端 httpOnly Cookie 设置，前端不再保存。
      dispatch({ type: 'LOGIN_SUCCESS', payload: { user: response.user } })

      // 首次登录或密码被重置：强制先改密。改密前后端会拒绝业务接口（403 PasswordChangeRequired）。
      if (response.user.force_password_change) {
        toast('首次登录，请先修改初始密码')
        router.push('/change-password')
        return
      }

      toast.success(`欢迎回来，${response.user.full_name}！`)

      // 跳转到仪表板
      router.push('/dashboard')

    } catch (error) {
      console.error('Login failed:', error)

      let errorMessage = '登录失败，请检查用户名和密码'

      if (isNetworkConnectionError(error)) {
        errorMessage = '无法连接后端服务，请确认后端已启动并检查前端 API 地址配置'
      } else if (error instanceof ApiClientError) {
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

      // 调用后端登出API（清除 httpOnly Cookie 并失效会话）
      await api.auth.logout()
    } catch (error) {
      apiFailed = true
      console.error('Logout API failed:', error)
    } finally {
      // 清理可能残留的本地凭据
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
      // S3：refresh token 在 httpOnly Cookie 中，无需前端读取；调用后端刷新，新 Cookie 自动下发。
      await api.auth.refresh()
    } catch (error) {
      console.error('Token refresh failed:', error)

      // 刷新失败，强制重新登录
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

  // 初始化认证状态。
  // 依赖 pathname 而非只依赖 router：公开页跳过探测后，一旦导航到受保护页或 /login，
  // 本 effect 会随 pathname 重跑并补上探测，withGuest / useRequireAuth 的判定不受影响。
  useEffect(() => {
    if (authProbeRef.current === 'done') return

    if (isPublicRoute(pathname)) {
      // 公开页不探测，但要结束 loading，否则消费 isLoading 的组件会一直停在加载态。
      if (authProbeRef.current === 'pending') {
        authProbeRef.current = 'skipped'
        dispatch({ type: 'SET_LOADING', payload: false })
      }
      return
    }

    authProbeRef.current = 'done'

    const initializeAuth = async () => {
      // S3：前端无法读取 httpOnly Cookie，直接探测 /auth/profile（Cookie 自动携带）判断登录态。
      try {
        const user = await api.auth.profile()
        dispatch({ type: 'LOGIN_SUCCESS', payload: { user } })
        if (user.force_password_change) {
          router.push('/change-password')
        }
        return
      } catch {
        // access 可能已过期，尝试用 refresh Cookie 刷新后重试一次。
      }

      try {
        await api.auth.refresh()
        const user = await api.auth.profile()
        dispatch({ type: 'LOGIN_SUCCESS', payload: { user } })
        if (user.force_password_change) {
          router.push('/change-password')
        }
      } catch {
        // 未登录或会话已失效。
        TokenManager.clearTokens()
        dispatch({ type: 'SET_LOADING', payload: false })
      }
    }

    initializeAuth()
  }, [pathname, router])

  // 设置Token自动刷新
  useEffect(() => {
    if (!state.isAuthenticated) return

    // S3：前端无法解码 httpOnly Cookie 中的过期时间，改为固定间隔主动刷新，
    // 间隔取短于 access token 默认有效期（30 分钟）。刷新失败由 refreshToken 内部处理登出跳转。
    const REFRESH_INTERVAL_MS = 20 * 60 * 1000
    const timer = setInterval(() => {
      void refreshToken().catch(() => {
        /* 刷新失败已在 refreshToken 内处理 */
      })
    }, REFRESH_INTERVAL_MS)

    return () => clearInterval(timer)
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
// 解析登录页 URL 上的 redirect 参数为安全的站内路径。
// 仅接受以单个 "/" 开头的相对路径（拒绝 //host、/\host 等开放重定向向量）。
function safeRedirectTarget(): string | null {
  if (typeof window === 'undefined') return null
  const raw = new URLSearchParams(window.location.search).get('redirect')
  if (!raw) return null
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null
  return raw
}

export function withGuest<P extends object>(
  WrappedComponent: React.ComponentType<P>
): React.ComponentType<P> {
  return function GuestOnlyComponent(props: P) {
    const { isAuthenticated, isLoading, user } = useAuth()
    const router = useRouter()

    useEffect(() => {
      if (!isLoading && isAuthenticated) {
        // 强制改密用户登录后必须先去改密页：login() 会先 dispatch 登录成功再 push('/change-password')，
        // 本 effect 随之触发；若此处一律 push 默认页会覆盖改密跳转（竞态），故同样按 force_password_change 分流。
        if (user?.force_password_change) {
          router.push('/change-password')
          return
        }
        // 登录前被路由守卫记录的原始页面（?redirect=）优先于默认落点
        router.push(safeRedirectTarget() ?? '/dashboard')
      }
    }, [isAuthenticated, isLoading, user, router])

    // 如果正在加载或已认证，不渲染组件
    if (isLoading || isAuthenticated) {
      return null
    }

    return <WrappedComponent {...props} />
  }
}
