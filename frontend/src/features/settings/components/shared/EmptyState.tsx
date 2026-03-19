'use client'

import { FileQuestion } from 'lucide-react'
import { type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({
  icon: Icon = FileQuestion,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted/60 mb-4">
        <Icon aria-hidden="true" className="w-8 h-8 text-muted-foreground/80" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
          {description}
        </p>
      )}
      {action && (
        <Button
          type="button"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
