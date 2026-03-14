'use client'

import { LazyDashboardOverview, LazyWrapper } from '@/components/lazy/LazyComponents'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import { RouteGuard } from '@/lib/components/route-guard'

export default function DashboardPage() {
  return (
    <RouteGuard requireAuth>
      <ErrorBoundary>
        <LazyWrapper>
          <LazyDashboardOverview />
        </LazyWrapper>
      </ErrorBoundary>
    </RouteGuard>
  )
}
