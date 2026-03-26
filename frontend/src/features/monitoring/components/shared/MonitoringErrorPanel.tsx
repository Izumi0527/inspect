'use client'

import Link from 'next/link'
import { Button } from '@/components/atoms'
import { WifiOff, RefreshCw } from 'lucide-react'
import { resolveMonitoringErrorView } from '../../utils/monitoring-error'

interface MonitoringErrorPanelProps {
  error: Error
  onRetry: () => unknown
}

/**
 * 监控页全屏错误面板（含 primaryAction / secondaryAction / details 展开）
 */
export function MonitoringErrorPanel({ error, onRetry }: MonitoringErrorPanelProps) {
  const ev = resolveMonitoringErrorView(error)
  return (
    <main className="flex h-[calc(100vh-80px)] items-center justify-center p-5">
      <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-950/40">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
          <WifiOff className="h-7 w-7 text-red-600 dark:text-red-400" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-red-900 dark:text-red-100">{ev.title}</h3>
        <p className="mb-5 text-sm text-red-700 dark:text-red-300">{ev.message}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {ev.primaryAction?.href && (
            <Button asChild className="cursor-pointer">
              <Link href={ev.primaryAction.href}>{ev.primaryAction.label}</Link>
            </Button>
          )}
          {ev.secondaryAction?.href && (
            <Button asChild variant="outline" className="cursor-pointer">
              <Link href={ev.secondaryAction.href}>{ev.secondaryAction.label}</Link>
            </Button>
          )}
          <Button variant="outline" onClick={() => onRetry()} className="cursor-pointer">
            <RefreshCw className="mr-2 h-4 w-4" />重新加载
          </Button>
        </div>
        {ev.details && (
          <details className="mt-4 rounded-lg border border-red-200 bg-white/50 p-3 text-left text-xs text-red-900 dark:border-red-800 dark:bg-red-950/20 dark:text-red-100">
            <summary className="cursor-pointer select-none">查看详情（仅用于排障）</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words">{ev.details}</pre>
          </details>
        )}
      </div>
    </main>
  )
}
