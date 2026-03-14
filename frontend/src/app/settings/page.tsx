'use client'

import { LazySystemSettings, LazyWrapper } from '@/components/lazy/LazyComponents'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import { RouteGuard } from '@/lib/components/route-guard'
import { Permission } from '@/lib/types/auth.types'

export default function SettingsPage() {
  return (
    <RouteGuard requireAuth requiredPermissions={[Permission.SYSTEM_CONFIG]}>
      <ErrorBoundary>
        <LazyWrapper>
          <LazySystemSettings />
        </LazyWrapper>
      </ErrorBoundary>
    </RouteGuard>
  )
}
