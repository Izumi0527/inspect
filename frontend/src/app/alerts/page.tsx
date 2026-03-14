'use client'

import { LazyAlertCenter, LazyWrapper } from '@/components/lazy/LazyComponents'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import { RouteGuard } from '@/lib/components/route-guard'
import { Permission } from '@/lib/types/auth.types'

export default function AlertsPage() {
  return (
    <RouteGuard requireAuth requiredPermissions={[Permission.ALERTS_READ]}>
      <ErrorBoundary>
        <LazyWrapper>
          <LazyAlertCenter />
        </LazyWrapper>
      </ErrorBoundary>
    </RouteGuard>
  )
}
