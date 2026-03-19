'use client'

import React, { useCallback, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'
import type { SettingsTabDescriptor, SettingsTabKey } from '@/features/settings/types/shell.types'

interface SettingsTabNavProps {
  tabs: SettingsTabDescriptor[]
  activeKey: SettingsTabKey
  onSelect: (tabKey: SettingsTabKey) => void
  className?: string
}

const getTabId = (tabKey: string) => `settings-tab-${tabKey}`
const getPanelId = (tabKey: string) => `settings-panel-${tabKey}`

export const SettingsTabNav: React.FC<SettingsTabNavProps> = ({
  tabs,
  activeKey,
  onSelect,
  className,
}) => {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const keys = useMemo(() => tabs.map((tab) => tab.key), [tabs])

  const focusAt = useCallback(
    (index: number) => {
      const target = refs.current[index]
      if (target) target.focus()
    },
    []
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (!keys.length) return

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        focusAt((index + 1) % keys.length)
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        focusAt((index - 1 + keys.length) % keys.length)
        return
      }

      if (event.key === 'Home') {
        event.preventDefault()
        focusAt(0)
        return
      }

      if (event.key === 'End') {
        event.preventDefault()
        focusAt(keys.length - 1)
      }
    },
    [focusAt, keys]
  )

  return (
    <div className={cn('p-4 border-b border-border', className)}>
      <div role="tablist" className="flex flex-wrap gap-2">
        {tabs.map((tab, index) => {
          const Icon = tab.icon
          const isActive = tab.key === activeKey

          return (
            <motion.button
              key={tab.key}
              ref={(el) => {
                refs.current[index] = el
              }}
              type="button"
              role="tab"
              id={getTabId(tab.key)}
              aria-selected={isActive}
              aria-controls={getPanelId(tab.key)}
              tabIndex={isActive ? 0 : -1}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onClick={() => onSelect(tab.key)}
              className={cn(
                'relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:bg-muted/40'
              )}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {isActive && (
                <motion.div
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full"
                  layoutId="activeTabIndicator"
                />
              )}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

export const settingsTabA11y = {
  getTabId,
  getPanelId,
}

