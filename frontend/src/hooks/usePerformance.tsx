'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import React from 'react'
import type { Metric } from 'web-vitals'

interface NetworkInformation {
  downlink: number
  effectiveType: 'slow-2g' | '2g' | '3g' | '4g' | '5g' | 'unknown'
  onchange?: ((this: NetworkInformation, ev: Event) => void) | null
  rtt: number
  saveData: boolean
  addEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void
  removeEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void
}

// Web Vitals 监控
interface WebVitals {
  FCP?: number
  LCP?: number
  FID?: number
  CLS?: number
  TTFB?: number
}

// 内存信息接口
interface MemoryInfo {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
}

interface PerformanceWithMemory extends Performance {
  memory?: MemoryInfo
}

type NavigatorWithConnection = Navigator & {
  connection?: NetworkInformation
  mozConnection?: NetworkInformation
  webkitConnection?: NetworkInformation
}

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
}

export const useWebVitals = (onReport?: (metric: Metric) => void) => {
  const reportRef = useRef(onReport)
  reportRef.current = onReport

  useEffect(() => {
    const reportVitals = async () => {
      try {
        const { onCLS, onFCP, onLCP, onTTFB, onINP } = await import('web-vitals')

        const handleReport = (metric: Metric) => {
          console.log('[Web Vitals]', metric)
          reportRef.current?.(metric)
        }

        onCLS(handleReport)
        onFCP(handleReport)
        // onFID 在 web-vitals v5 中已移除，替换为 onINP
        onINP(handleReport)
        onLCP(handleReport)
        onTTFB(handleReport)
      } catch (error) {
        console.warn('Web Vitals not available:', error)
      }
    }

    reportVitals()
  }, [])
}

// 内存使用监控
export const useMemoryMonitor = (intervalMs: number = 30000) => {
  const [memoryInfo, setMemoryInfo] = React.useState<MemoryInfo | null>(null)

  useEffect(() => {
    const checkMemory = () => {
      const performanceWithMemory = performance as PerformanceWithMemory
      const memory = performanceWithMemory.memory

      if (memory) {
        setMemoryInfo({
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
        })
      }
    }

    checkMemory()
    const interval = setInterval(checkMemory, intervalMs)

    return () => clearInterval(interval)
  }, [intervalMs])

  return memoryInfo
}

// 网络状态监控
export const useNetworkStatus = () => {
  const [networkInfo, setNetworkInfo] = React.useState({
    online: navigator.onLine,
    effectiveType: 'unknown',
    downlink: 0,
    rtt: 0,
  })

  useEffect(() => {
    const getConnection = (): NetworkInformation | null => {
      const navigatorWithConnection = navigator as NavigatorWithConnection
      return (
        navigatorWithConnection.connection ??
        navigatorWithConnection.mozConnection ??
        navigatorWithConnection.webkitConnection ??
        null
      )
    }

    const updateNetworkInfo = () => {
      const connection = getConnection()

      setNetworkInfo({
        online: navigator.onLine,
        effectiveType: connection?.effectiveType ?? 'unknown',
        downlink: connection?.downlink ?? 0,
        rtt: connection?.rtt ?? 0,
      })
    }

    const handleOnline = () => setNetworkInfo(prev => ({ ...prev, online: true }))
    const handleOffline = () => setNetworkInfo(prev => ({ ...prev, online: false }))

    updateNetworkInfo()

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    const connection = getConnection()
    connection?.addEventListener?.('change', updateNetworkInfo)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      connection?.removeEventListener?.('change', updateNetworkInfo)
    }
  }, [])

  return networkInfo
}

// 页面渲染性能监控
export const useRenderPerformance = (componentName: string) => {
  const renderCountRef = useRef(0)
  const lastRenderTimeRef = useRef(Date.now())

  useEffect(() => {
    renderCountRef.current += 1
    const now = Date.now()
    const timeSinceLastRender = now - lastRenderTimeRef.current
    lastRenderTimeRef.current = now

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Render Performance] ${componentName}:`, {
        renderCount: renderCountRef.current,
        timeSinceLastRender: `${timeSinceLastRender}ms`,
      })
    }
  })

  return {
    renderCount: renderCountRef.current,
  }
}

// 虚拟化列表性能监控
export const useVirtualizationPerformance = () => {
  const [metrics, setMetrics] = React.useState({
    visibleItems: 0,
    totalItems: 0,
    renderTime: 0,
  })

  const measureRenderTime = useCallback((totalItems: number, visibleItems: number) => {
    const startTime = performance.now()
    
    // 使用 requestIdleCallback 来测量渲染后的性能
    const { requestIdleCallback } = window as WindowWithIdleCallback

    if (requestIdleCallback) {
      requestIdleCallback(() => {
        const endTime = performance.now()
        setMetrics({
          visibleItems,
          totalItems,
          renderTime: endTime - startTime,
        })
      })
    } else {
      requestAnimationFrame(() => {
        const endTime = performance.now()
        setMetrics({
          visibleItems,
          totalItems,
          renderTime: endTime - startTime,
        })
      })
    }
  }, [])

  return { metrics, measureRenderTime }
}

// 路由性能监控
export const useRoutePerformance = () => {
  const router = useRouter()
  const [routeMetrics, setRouteMetrics] = React.useState<{
    [key: string]: {
      loadTime: number
      navigateTime: number
    }
  }>({})

  useEffect(() => {
    let navigationStart = 0

    const handleRouteChangeStart = () => {
      navigationStart = performance.now()
    }

    const handleRouteChangeComplete = (url: string) => {
      if (navigationStart > 0) {
        const loadTime = performance.now() - navigationStart
        
        setRouteMetrics(prev => ({
          ...prev,
          [url]: {
            ...(prev[url] ?? {}),
            loadTime,
            navigateTime: Date.now(),
          }
        }))

        navigationStart = 0
      }
    }

    // 注意：Next.js 13+ App Router 需要使用不同的事件
    // 这里提供一个基础的实现，实际项目中可能需要调整
    const originalPush = router.push.bind(router)
    const originalPushTyped = originalPush as unknown as (href: string | URL, options?: unknown) => void

    const patchedPush = ((href: string | URL, options?: unknown) => {
      const targetUrl = typeof href === 'string' ? href : href.toString()
      handleRouteChangeStart()
      originalPushTyped(href, options)
      // 修复：使用 setTimeout 而非 .finally()，因为 router.push 返回 void
      setTimeout(() => handleRouteChangeComplete(targetUrl), 0)
    }) as typeof router.push

    router.push = patchedPush

    return () => {
      router.push = originalPush as typeof router.push
    }
  }, [router])

  return routeMetrics
}

// 性能监控提供者
interface PerformanceContextType {
  webVitals: WebVitals
  networkStatus: ReturnType<typeof useNetworkStatus>
  memoryInfo: ReturnType<typeof useMemoryMonitor>
}

const PerformanceContext = React.createContext<PerformanceContextType | null>(null)

export const PerformanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [webVitals, setWebVitals] = React.useState<WebVitals>({})
  const networkStatus = useNetworkStatus()
  const memoryInfo = useMemoryMonitor()

  useWebVitals((metric) => {
    setWebVitals(prev => ({
      ...prev,
      [metric.name]: metric.value,
    }))
  })

  const value = {
    webVitals,
    networkStatus,
    memoryInfo,
  }

  return (
    <PerformanceContext.Provider value={value}>
      {children}
    </PerformanceContext.Provider>
  )
}

export const usePerformance = () => {
  const context = React.useContext(PerformanceContext)
  if (!context) {
    throw new Error('usePerformance must be used within a PerformanceProvider')
  }
  return context
}