'use client'

import { LazyInspectionManagement, LazyWrapper } from '@/components/lazy/LazyComponents'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import { RouteGuard } from '@/lib/components/route-guard'
import { Permission } from '@/lib/types/auth.types'

export default function InspectionPage() {
  return (
    <RouteGuard requireAuth requiredPermissions={[Permission.INSPECTIONS_READ]}>
      <ErrorBoundary>
        <LazyWrapper>
          <LazyInspectionManagement />
        </LazyWrapper>
      </ErrorBoundary>
    </RouteGuard>
  )
}
