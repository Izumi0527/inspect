import React from 'react'
import { AlertCircle, XCircle, RefreshCw } from 'lucide-react'
import { Button } from './button'
import { cn } from '@/utils/cn'

interface ErrorAlertProps {
  title?: string
  message: string
  error?: Error | unknown
  onRetry?: () => void
  variant?: 'error' | 'warning'
  className?: string
}

/**
 * ErrorAlert 组件
 *
 * 精密仪器方向：错误/警告全部走语义令牌（soft 底 + on-soft 深色文字，浅深两套成对），
 * 修复旧实现整体无 dark: 变体、深色主题下浅底浅字的问题（P0-9）。
 */
export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  title,
  message,
  error,
  onRetry,
  variant = 'error',
  className = ''
}) => {
  const isError = variant === 'error'

  // 从错误对象中提取详细信息
  const errorDetails = error instanceof Error ? error.message : String(error || '')

  const textTone = isError ? 'text-danger-soft-foreground' : 'text-warning-soft-foreground'

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        isError ? 'bg-danger-soft border-danger/30' : 'bg-warning-soft border-warning/30',
        className
      )}
      role="alert"
    >
      <div className="flex items-start gap-2.5">
        {/* Icon */}
        <div className="flex-shrink-0">
          {isError ? (
            <XCircle className="w-4 h-4 text-danger" />
          ) : (
            <AlertCircle className="w-4 h-4 text-warning" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {title && (
            <h3 className={cn('text-sm font-medium mb-1', textTone)}>
              {title}
            </h3>
          )}
          <p className={cn('text-sm', textTone)}>
            {message}
          </p>

          {/* Error Details (collapsible) */}
          {errorDetails && (
            <details className="mt-2">
              <summary className={cn('text-xs cursor-pointer hover:underline', textTone)}>
                查看详细信息
              </summary>
              <pre className="mt-2 text-xs p-2 rounded-md border border-border bg-surface-2 text-foreground overflow-x-auto">
                {errorDetails}
              </pre>
            </details>
          )}

          {/* Retry Button */}
          {onRetry && (
            <div className="mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={onRetry}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                重试
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface InlineErrorProps {
  message: string
  className?: string
}

/**
 * InlineError 组件
 * 用于行内简洁错误提示
 */
export const InlineError: React.FC<InlineErrorProps> = ({
  message,
  className = ''
}) => {
  return (
    <div className={cn('flex items-center gap-2 text-sm text-danger', className)}>
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  )
}