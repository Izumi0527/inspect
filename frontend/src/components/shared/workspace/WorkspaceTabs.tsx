'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/utils/cn'

export interface WorkspaceTab<Key extends string> {
  key: Key
  label: string
  icon?: React.ReactNode
}

interface WorkspaceTabsProps<Key extends string> {
  tabs: WorkspaceTab<Key>[]
  activeKey: Key
  onSelect: (tabKey: Key) => void
  label: string
  idPrefix?: string
  className?: string
}

/**
 * 页签（声明式，WAI-ARIA tablist）：
 * 方向键 / Home / End / Enter / Space，roving tabindex；
 * 仪器风下的激活态 = 文本 + 2px 品牌下划线（无彩色胶囊底、无阴影）。
 */
export function WorkspaceTabs<Key extends string>({ tabs, activeKey, onSelect, className, label, idPrefix }: WorkspaceTabsProps<Key>) {
  const generatedId = React.useId()
  const prefix = idPrefix ?? `workspace-${generatedId}`
  const getTabId = (key: Key) => `${prefix}-tab-${key}`
  const getPanelId = (key: Key) => `${prefix}-panel-${key}`
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const [focusedKey, setFocusedKey] = useState<Key>(activeKey)

  const keys = useMemo(() => tabs.map((tab) => tab.key), [tabs])

  useEffect(() => {
    setFocusedKey(activeKey)
  }, [activeKey])

  const focusAt = useCallback(
    (index: number) => {
      const key = keys[index]
      const target = refs.current[index]
      if (!key || !target) return
      setFocusedKey(key)
      target.focus()
    },
    [keys]
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
    <div className={cn('min-w-0', className)}>
      <div
        role="tablist"
        aria-label={label}
        aria-orientation="horizontal"
        className="flex flex-wrap gap-1"
      >
        {tabs.map((tab, index) => {
          const isActive = tab.key === activeKey
          const isFocused = tab.key === (keys.includes(focusedKey) ? focusedKey : keys.includes(activeKey) ? activeKey : keys[0])

          return (
            <button
              key={tab.key}
              ref={(el) => {
                refs.current[index] = el
              }}
              type="button"
              role="tab"
              id={getTabId(tab.key)}
              aria-selected={isActive}
              aria-controls={getPanelId(tab.key)}
              tabIndex={isFocused ? 0 : -1}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onFocus={() => setFocusedKey(tab.key)}
              onClick={() => onSelect(tab.key)}
              className={cn(
                'relative flex items-center gap-1.5 rounded-sm px-3 py-2 text-sm font-medium transition-colors duration-100 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:bg-surface-3 hover:text-foreground'
              )}
            >
              {tab.icon && <span aria-hidden="true">{tab.icon}</span>}
              {tab.label}
              {isActive && (
                <span
                  className="absolute bottom-0 left-1 right-1 h-0.5 rounded-full bg-primary"
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
