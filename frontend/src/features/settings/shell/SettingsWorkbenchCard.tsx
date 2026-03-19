'use client'

import React from 'react'
import { cn } from '@/utils/cn'

interface SettingsWorkbenchCardProps {
  fillHeight?: boolean
  className?: string
  children: React.ReactNode
}

export const SettingsWorkbenchCard: React.FC<SettingsWorkbenchCardProps> = ({
  fillHeight = false,
  className,
  children,
}) => {
  return (
    <div
      className={cn(
        'bg-card rounded-xl border border-border',
        fillHeight && 'flex-1 flex flex-col min-h-0',
        className
      )}
    >
      {children}
    </div>
  )
}

