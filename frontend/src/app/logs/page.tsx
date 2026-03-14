'use client'

import { LazyLogCenter, LazyWrapper } from '@/components/lazy/LazyComponents'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import { RouteGuard } from '@/lib/components/route-guard'
import { Permission } from '@/lib/types/auth.types'

export default function LogsPage() {
  return (
    <RouteGuard requireAuth requiredPermissions={[Permission.SYSTEM_LOGS]}>
      <ErrorBoundary>
        <LazyWrapper>
          <LazyLogCenter />
        </LazyWrapper>
      </ErrorBoundary>
    </RouteGuard>
  )
}
