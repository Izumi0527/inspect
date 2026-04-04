'use client'

import { LazyDashboardOverview, LazyWrapper } from '@/components/lazy/LazyComponents'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import { RouteGuard } from '@/lib/components/route-guard'
import { Permission } from '@/lib/types/auth.types'

export default function DashboardPage() {
  return (
    <RouteGuard
      requireAuth
      requiredAnyPermissions={[
        Permission.DEVICES_READ,
        Permission.ALERTS_READ,
        Permission.MONITORING_READ,
        Permission.REPORTS_READ,
        Permission.INSPECTIONS_READ,
      ]}
    >
      <ErrorBoundary>
        <LazyWrapper>
          <LazyDashboardOverview />
        </LazyWrapper>
      </ErrorBoundary>
    </RouteGuard>
  )
}
