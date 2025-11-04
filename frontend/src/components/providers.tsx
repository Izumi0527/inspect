'use client'

import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '@/lib/contexts/auth-context'
import { ApiClientError } from '@/lib/api-client'
import httpInterceptor from '@/services/httpInterceptor'
import { createLogger } from '@/lib/logger'

const logger = createLogger('providers')

const getErrorStatus = (error: unknown): number | undefined => {
  if (error instanceof ApiClientError) {
    return error.status
  }

  if (typeof error === 'object' && error !== null && 'status' in error) {
    const candidate = (error as { status?: unknown }).status
    if (typeof candidate === 'number') {
      return candidate
    }
  }

  return undefined
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
        retry: (failureCount: number, error: unknown) => {
          const status = getErrorStatus(error)
          if (status === 404 || status === 401) {
            return false
          }
          return failureCount < 3
        },
      },
    },
  }))

  // 初始化HTTP拦截器
  useEffect(() => {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined') {
      logger.warn('应用程序在非浏览器环境中初始化，跳过HTTP拦截器')
      return
    }

    logger.info('应用程序初始化', {
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date().toISOString(),
    })

    // 手动初始化HTTP拦截器
    httpInterceptor.initialize()
    const stats = httpInterceptor.getStats()
    logger.info('HTTP拦截器状态', stats)

    // 清理函数
    return () => {
      logger.info('应用程序卸载')
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '16px',
              color: '#374151',
            },
          }}
        />
        <ReactQueryDevtools initialIsOpen={false} />
      </AuthProvider>
    </QueryClientProvider>
  )
}
