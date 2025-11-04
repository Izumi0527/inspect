import React from 'react'
import { AlertCircle, XCircle, RefreshCw } from 'lucide-react'
import { Button } from './button'

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
 * 用于显示错误信息和提供重试功能
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

  return (
    <div
      className={`rounded-lg border p-4 ${
        isError
          ? 'bg-red-50 border-red-200'
          : 'bg-yellow-50 border-yellow-200'
      } ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0">
          {isError ? (
            <XCircle className="w-5 h-5 text-red-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-yellow-600" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1">
          {title && (
            <h3
              className={`text-sm font-medium mb-1 ${
                isError ? 'text-red-800' : 'text-yellow-800'
              }`}
            >
              {title}
            </h3>
          )}
          <p
            className={`text-sm ${
              isError ? 'text-red-700' : 'text-yellow-700'
            }`}
          >
            {message}
          </p>

          {/* Error Details (collapsible) */}
          {errorDetails && (
            <details className="mt-2">
              <summary
                className={`text-xs cursor-pointer ${
                  isError ? 'text-red-600' : 'text-yellow-600'
                } hover:underline`}
              >
                查看详细信息
              </summary>
              <pre
                className={`mt-2 text-xs p-2 rounded border overflow-x-auto ${
                  isError
                    ? 'bg-red-100 border-red-300 text-red-800'
                    : 'bg-yellow-100 border-yellow-300 text-yellow-800'
                }`}
              >
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
                className={
                  isError
                    ? 'border-red-300 text-red-700 hover:bg-red-100'
                    : 'border-yellow-300 text-yellow-700 hover:bg-yellow-100'
                }
              >
                <RefreshCw className="w-4 h-4 mr-1" />
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
    <div className={`flex items-center gap-2 text-sm text-red-600 ${className}`}>
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  )
}
