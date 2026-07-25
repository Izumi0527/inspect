'use client'

/**
 * 路由守卫组件
 * 用于保护需要认证或特定权限的页面
 */

import { ReactNode, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '../contexts/auth-context'
import { Permission, UserRole } from '../types/auth.types'

// 加载组件
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
      <div className="bg-card/80 backdrop-blur-lg rounded-2xl p-8 shadow-xl border border-border/40">
        <div className="flex flex-col items-center space-y-6">
          {/* 加载动画 */}
          <div className="relative">
            <div className="w-16 h-16 border-4 border-blue-200 rounded-full animate-spin border-t-blue-600"></div>
            <div className="absolute inset-0 w-16 h-16 border-4 border-transparent rounded-full border-t-purple-600 animate-spin animation-delay-150"></div>
          </div>
          
          {/* 加载文本 */}
          <div className="text-center space-y-2">
            <p className="text-lg font-medium text-slate-800">正在验证身份...</p>
            <p className="text-sm text-slate-600">请稍候</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// 无权限访问组件
interface AccessDeniedProps {
  message?: string
  requiredPermissions?: string[]
  requiredRoles?: string[]
  onGoBack?: () => void
}

function AccessDenied({
  message = '您没有权限访问此页面',
  requiredPermissions = [],
  requiredRoles = [],
  onGoBack,
}: AccessDeniedProps) {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
      <div className="bg-card/80 backdrop-blur-lg rounded-2xl p-8 shadow-xl border border-border/40 max-w-md w-full mx-4">
        <div className="text-center space-y-6">
          {/* 错误图标 */}
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>

          {/* 错误信息 */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-800">访问被拒绝</h1>
            <p className="text-slate-600">{message}</p>
          </div>

          {/* 权限/角色详情 */}
          {(requiredRoles.length > 0 || requiredPermissions.length > 0) && (
            <div className="rounded-xl border border-border/50 bg-muted/40 p-4 text-left">
              {requiredRoles.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-700">所需角色</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {requiredRoles.map((role) => (
                      <span
                        key={role}
                        className="rounded-md bg-slate-100 px-2 py-1 text-xs font-mono text-slate-800 dark:bg-slate-900/40 dark:text-slate-100"
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {requiredPermissions.length > 0 && (
                <div className={requiredRoles.length > 0 ? 'mt-4' : ''}>
                  <p className="text-xs font-semibold text-slate-700">所需权限</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {requiredPermissions.map((perm) => (
                      <span
                        key={perm}
                        className="rounded-md bg-slate-100 px-2 py-1 text-xs font-mono text-slate-800 dark:bg-slate-900/40 dark:text-slate-100"
                      >
                        {perm}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
                如需开通权限，请联系管理员为当前账号所属角色授权以上权限后再访问。
              </p>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={onGoBack || (() => router.back())}
              className="px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
            >
              返回上页
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              回到首页
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// 路由守卫组件Props
interface RouteGuardProps {
  children: ReactNode
  requireAuth?: boolean
  requiredPermissions?: Permission[]
  requiredAnyPermissions?: Permission[]
  requiredRoles?: UserRole[]
  fallback?: ReactNode
  redirectTo?: string
}

// 路由守卫组件
export function RouteGuard({
  children,
  requireAuth = true,
  requiredPermissions = [],
  requiredAnyPermissions = [],
  requiredRoles = [],
  fallback,
  redirectTo,
}: RouteGuardProps) {
  const { isAuthenticated, isLoading, user, checkPermission, checkRole } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null)

  useEffect(() => {
    // 如果正在加载，等待认证状态确定
    if (isLoading) {
      setIsAuthorized(null)
      return
    }

    // 如果不需要认证，直接允许访问
    if (!requireAuth) {
      setIsAuthorized(true)
      return
    }

    // 检查是否已认证
    if (!isAuthenticated) {
      if (redirectTo) {
        router.push(redirectTo)
      } else {
        router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
      }
      setIsAuthorized(false)
      return
    }

    // 强制改密：已登录但被标记 force_password_change 的用户，除改密页本身外一律先去改密页。
    // 与后端 EnforcePasswordChange 闸一致，避免直达 /dashboard 等业务页后被 403 卡在「无法加载数据」。
    if (user?.force_password_change) {
      router.push('/change-password')
      setIsAuthorized(false)
      return
    }

    // 检查角色权限
    if (requiredRoles.length > 0) {
      const hasRole = checkRole(requiredRoles)
      if (!hasRole) {
        setIsAuthorized(false)
        return
      }
    }

    // 检查操作权限
    if (requiredPermissions.length > 0) {
      const hasPermissions = requiredPermissions.every(permission => checkPermission(permission))
      if (!hasPermissions) {
        setIsAuthorized(false)
        return
      }
    }

    // 检查任一权限
    if (requiredAnyPermissions.length > 0) {
      const hasAnyPermission = requiredAnyPermissions.some(permission => checkPermission(permission))
      if (!hasAnyPermission) {
        setIsAuthorized(false)
        return
      }
    }

    // 所有检查都通过
    setIsAuthorized(true)
  }, [
    isLoading,
    isAuthenticated,
    user,
    requireAuth,
    requiredRoles,
    requiredPermissions,
    requiredAnyPermissions,
    checkPermission,
    checkRole,
    router,
    pathname,
    redirectTo,
  ])

  // 正在加载认证状态
  if (isLoading || isAuthorized === null) {
    return fallback || <LoadingScreen />
  }

  // 没有权限访问
  if (!isAuthorized) {
    if (fallback) {
      return <>{fallback}</>
    }

    // 未认证用户会被重定向到登录页，这里主要处理权限不足的情况
    if (isAuthenticated) {
      let message = '您没有权限访问此页面'
      
      if (requiredRoles.length > 0) {
        message = '当前账号不满足该页面所需角色要求'
      } else if (requiredPermissions.length > 0) {
        message = '当前账号缺少访问该页面所需权限'
      } else if (requiredAnyPermissions.length > 0) {
        message = '当前账号缺少访问该页面所需任一权限'
      }

      return (
        <AccessDenied
          message={message}
          requiredRoles={requiredRoles}
          requiredPermissions={requiredAnyPermissions.length > 0 ? requiredAnyPermissions : requiredPermissions}
        />
      )
    }

    return <LoadingScreen />
  }

  // 有权限访问，渲染子组件
  return <>{children}</>
}

// 便捷的权限检查组件
interface PermissionGateProps {
  children: ReactNode
  permission: Permission
  fallback?: ReactNode
}

export function PermissionGate({ children, permission, fallback }: PermissionGateProps) {
  const hasPermission = useAuth().checkPermission(permission)
  
  if (!hasPermission) {
    return fallback ? <>{fallback}</> : null
  }
  
  return <>{children}</>
}

// 便捷的角色检查组件
interface RoleGateProps {
  children: ReactNode
  roles: UserRole | UserRole[]
  fallback?: ReactNode
}

export function RoleGate({ children, roles, fallback }: RoleGateProps) {
  const hasRole = useAuth().checkRole(roles)
  
  if (!hasRole) {
    return fallback ? <>{fallback}</> : null
  }
  
  return <>{children}</>
}

// 高阶组件：需要认证
export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
  options: {
    requiredPermissions?: Permission[]
    requiredRoles?: UserRole[]
    redirectTo?: string
  } = {}
) {
  return function AuthenticatedComponent(props: P) {
    return (
      <RouteGuard
        requireAuth={true}
        requiredPermissions={options.requiredPermissions}
        requiredRoles={options.requiredRoles}
        redirectTo={options.redirectTo}
      >
        <Component {...props} />
      </RouteGuard>
    )
  }
}
