'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type IdleCallbackDeadline = { readonly didTimeout: boolean; timeRemaining: () => number }
type IdleCallback = (deadline: IdleCallbackDeadline) => void

const scheduleIdleCallback = (callback: () => void) => {
  if (typeof window === 'undefined') return

  const idleWindow = window as typeof window & {
    requestIdleCallback?: (cb: IdleCallback, options?: IdleRequestOptions) => number
  }

  if (idleWindow.requestIdleCallback) {
    idleWindow.requestIdleCallback(() => callback())
    return
  }

  window.setTimeout(callback, 1)
}

// 路由预加载Hook
export const useRoutePreload = () => {
  const router = useRouter()

  const preloadRoute = useCallback((href: string) => {
    void router.prefetch(href)
  }, [router])

  const preloadComponent = useCallback((importFn: () => Promise<unknown>) => {
    scheduleIdleCallback(() => {
      void importFn()
    })
  }, [])

  return { preloadRoute, preloadComponent }
}

// 智能预加载Link组件
interface PreloadLinkProps {
  href: string
  children: React.ReactNode
  className?: string
  onMouseEnter?: () => void
  preloadDelay?: number
}

export const PreloadLink: React.FC<PreloadLinkProps> = ({
  href,
  children,
  className,
  onMouseEnter,
  preloadDelay = 200
}) => {
  const { preloadRoute } = useRoutePreload()
  const preloadTimerRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (preloadTimerRef.current !== null) {
      window.clearTimeout(preloadTimerRef.current)
      preloadTimerRef.current = null
    }
  }, [])

  const handleMouseEnter = useCallback(() => {
    clearTimer()
    preloadTimerRef.current = window.setTimeout(() => {
      preloadRoute(href)
    }, preloadDelay)
    onMouseEnter?.()
  }, [clearTimer, preloadDelay, preloadRoute, href, onMouseEnter])

  const handleMouseLeave = useCallback(() => {
    clearTimer()
  }, [clearTimer])

  useEffect(() => () => clearTimer(), [clearTimer])

  return (
    <Link
      href={href}
      className={className}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </Link>
  )
}

// 路由预加载管理器
export const RoutePreloadManager: React.FC = () => {
  const { preloadComponent } = useRoutePreload()

  useEffect(() => {
    const coreRoutes = [
      () => import('@/features/dashboard/components/DashboardView'),
      () => import('@/features/devices/components/DeviceManagementView'),
      () => import('@/features/monitoring/components/MonitoringView'),
    ]

    const preloadTimer = window.setTimeout(() => {
      coreRoutes.forEach(route => {
        preloadComponent(route)
      })
    }, 2000)

    return () => window.clearTimeout(preloadTimer)
  }, [preloadComponent])

  return null
}

// 关键资源预加载
export const CriticalResourcePreloader: React.FC = () => {
  useEffect(() => {
    const criticalResources: string[] = [
      // '\u002fstyles\u002fcritical.css',
      // '\u002ffonts\u002finter-var.woff2',
    ]

    const createdLinks: HTMLLinkElement[] = criticalResources.map(resource => {
      const link = document.createElement('link')
      link.rel = 'prefetch'
      link.href = resource
      document.head.appendChild(link)
      return link
    })

    return () => {
      createdLinks.forEach(link => {
        if (document.head.contains(link)) {
          document.head.removeChild(link)
        }
      })
    }
  }, [])

  return null
}
