'use client'

import { AlertCircle, Lock } from 'lucide-react'
import React, { useId, useMemo } from 'react'
import { cn } from '@/utils/cn'
import { ConfigInput } from '@/features/settings/components/shared/ConfigInput'
import { ConfigSelect } from '@/features/settings/components/shared/ConfigSelect'
import { ConfigSwitch } from '@/features/settings/components/shared/ConfigSwitch'

interface ConfigItemProps {
  label: string
  description?: string
  required?: boolean
  readonly?: boolean
  error?: string
  controlId?: string
  children: React.ReactNode
  className?: string
}

export function ConfigItem({
  label,
  description,
  required = false,
  readonly = false,
  error,
  controlId,
  children,
  className,
}: ConfigItemProps) {
  const autoId = useId()

  const a11y = useMemo(() => {
    const sanitized = autoId.replace(/:/g, '')
    const resolvedControlId = controlId ?? `settings-config-${sanitized}`
    const descriptionId = description ? `${resolvedControlId}-desc` : undefined
    const errorId = error ? `${resolvedControlId}-error` : undefined
    const describedBy = [descriptionId, errorId].filter(Boolean).join(' ')

    return {
      resolvedControlId,
      descriptionId,
      errorId,
      describedBy: describedBy || undefined,
    }
  }, [autoId, controlId, description, error])

  const injectedChild = useMemo(() => {
    if (!React.isValidElement(children)) return children

    const shouldInject =
      children.type === ConfigInput ||
      children.type === ConfigSelect ||
      children.type === ConfigSwitch

    if (!shouldInject) return children

    const existingId = (children.props as Record<string, unknown>)['id'] as string | undefined
    const existingDescribedBy = (children.props as Record<string, unknown>)[
      'aria-describedby'
    ] as string | undefined

    const mergedDescribedBy = [existingDescribedBy, a11y.describedBy]
      .filter(Boolean)
      .join(' ')

    const mergedProps: Record<string, unknown> = {
      ...(existingId ? {} : { id: a11y.resolvedControlId }),
      ...(mergedDescribedBy ? { 'aria-describedby': mergedDescribedBy } : {}),
      ...(error ? { 'aria-invalid': true } : {}),
    }

    return React.cloneElement(children, mergedProps)
  }, [a11y.describedBy, a11y.resolvedControlId, children, error])

  const canLabelControl =
    React.isValidElement(children) &&
    (children.type === ConfigInput ||
      children.type === ConfigSelect ||
      children.type === ConfigSwitch)

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <label
          htmlFor={canLabelControl ? a11y.resolvedControlId : undefined}
          className="block text-sm font-medium text-foreground/90"
        >
          {label}
          {required && (
            <>
              <span aria-hidden="true" className="ml-1 text-red-500 dark:text-red-400">
                *
              </span>
              <span className="sr-only">（必填）</span>
            </>
          )}
          {readonly && (
            <Lock
              aria-hidden="true"
              className="inline-block ml-2 w-3 h-3 text-muted-foreground/80"
            />
          )}
        </label>
      </div>

      {description && (
        <p id={a11y.descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}

      <div className="mt-1">{injectedChild}</div>

      {error && (
        <div className="flex items-start space-x-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle aria-hidden="true" className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span id={a11y.errorId}>{error}</span>
        </div>
      )}
    </div>
  )
}
