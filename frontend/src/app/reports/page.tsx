'use client'

import { LazyReportAnalysis, LazyWrapper } from '@/components/lazy/LazyComponents'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import { RouteGuard } from '@/lib/components/route-guard'
import { Permission } from '@/lib/types/auth.types'

export default function ReportsPage() {
  return (
    <RouteGuard requireAuth requiredPermissions={[Permission.REPORTS_READ]}>
      <ErrorBoundary>
        <LazyWrapper>
          <LazyReportAnalysis />
        </LazyWrapper>
      </ErrorBoundary>
    </RouteGuard>
  )
}
