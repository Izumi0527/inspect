'use client'

import { LazyDeviceManagement, LazyWrapper } from '@/components/lazy/LazyComponents'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import { RouteGuard } from '@/lib/components/route-guard'
import { Permission } from '@/lib/types/auth.types'

export default function DevicesPage() {
  return (
    <RouteGuard requireAuth requiredPermissions={[Permission.DEVICES_READ]}>
      <ErrorBoundary>
        <LazyWrapper>
          <LazyDeviceManagement />
        </LazyWrapper>
      </ErrorBoundary>
    </RouteGuard>
  )
}
