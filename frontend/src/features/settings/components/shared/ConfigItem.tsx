'use client'

import { AlertCircle, Lock } from 'lucide-react'
import { cn } from '@/utils/cn'

interface ConfigItemProps {
  label: string
  description?: string
  required?: boolean
  readonly?: boolean
  error?: string
  children: React.ReactNode
  className?: string
}

export function ConfigItem({
  label,
  description,
  required = false,
  readonly = false,
  error,
  children,
  className,
}: ConfigItemProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-foreground/90">
          {label}
          {required && <span className="ml-1 text-red-500 dark:text-red-400">*</span>}
          {readonly && (
            <Lock className="inline-block ml-2 w-3 h-3 text-muted-foreground/80" />
          )}
        </label>
      </div>

      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      <div className="mt-1">{children}</div>

      {error && (
        <div className="flex items-start space-x-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
