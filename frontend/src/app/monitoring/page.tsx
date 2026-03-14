'use client'

import {
  LazyMonitoringView,
  LazyWrapper,
} from '@/components/lazy/LazyComponents'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import { RouteGuard } from '@/lib/components/route-guard'
import { Permission } from '@/lib/types/auth.types'

/**
 * 监控页面
 *
 * @features
 * - 使用监控中心 v2 UI
 * - 开发环境认证绕过（设置环境变量 NEXT_PUBLIC_DISABLE_AUTH_CHECK=true）
 */

export default function MonitoringPage() {
  // ==================== 开发环境认证绕过 ====================
  // 仅在开发环境启用，生产/测试环境必须认证（避免误配置导致越权）。
  // 注意：NEXT_PUBLIC_* 属于构建期注入，若生产构建时误设为 true，会被“固化进产物”；
  // 因此这里额外要求 NODE_ENV=development 才允许绕过。
  const DISABLE_AUTH_CHECK =
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_DISABLE_AUTH_CHECK === 'true'

  // 开发环境跳过认证检查
  if (DISABLE_AUTH_CHECK) {
    return (
      <div>
        {/* 开发环境警告横幅 */}
        <div className="bg-yellow-100 border-b-2 border-yellow-400 px-4 py-2 text-center text-sm font-medium text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100">
          ⚠️ 开发模式：已禁用认证检查 (NEXT_PUBLIC_DISABLE_AUTH_CHECK=true)
        </div>

        <ErrorBoundary>
          <LazyWrapper>
            <LazyMonitoringView />
          </LazyWrapper>
        </ErrorBoundary>
      </div>
    )
  }

  return (
    <RouteGuard requireAuth requiredPermissions={[Permission.MONITORING_READ]}>
      <ErrorBoundary>
        <LazyWrapper>
          <LazyMonitoringView />
        </LazyWrapper>
      </ErrorBoundary>
    </RouteGuard>
  )
}
