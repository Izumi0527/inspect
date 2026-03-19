'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'
import type { SettingsScrollMode } from '@/features/settings/types/shell.types'

interface SettingsContentViewportProps {
  tabKey: string
  scrollMode: SettingsScrollMode
  children: React.ReactNode
}

export const SettingsContentViewport: React.FC<SettingsContentViewportProps> = ({
  tabKey,
  scrollMode,
  children,
}) => {
  return (
    <motion.div
      key={tabKey}
      role="tabpanel"
      id={`settings-panel-${tabKey}`}
      aria-labelledby={`settings-tab-${tabKey}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className={cn(
        scrollMode === 'panel' && 'flex-1 flex flex-col min-h-0 overflow-hidden'
      )}
    >
      {children}
    </motion.div>
  )
}
