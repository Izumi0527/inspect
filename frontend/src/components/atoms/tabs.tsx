'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/utils/cn'

// Tabs Root Component
const tabsVariants = cva(
  'w-full',
  {
    variants: {
      orientation: {
        horizontal: 'flex flex-col',
        vertical: 'flex flex-row'
      }
    },
    defaultVariants: {
      orientation: 'horizontal'
    }
  }
)

const tabsListVariants = cva(
  'inline-flex items-center justify-center rounded-xl bg-muted/70 backdrop-blur-lg border border-border/50 p-1 text-muted-foreground shadow-lg',
  {
    variants: {
      orientation: {
        horizontal: 'h-12 w-full',
        vertical: 'h-auto w-auto flex-col'
      }
    },
    defaultVariants: {
      orientation: 'horizontal'
    }
  }
)

const tabsTriggerVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      active: {
        true: 'bg-card text-foreground shadow-sm border border-border/60',
        false: 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
      },
      orientation: {
        horizontal: 'flex-1',
        vertical: 'w-full justify-start'
      }
    },
    defaultVariants: {
      active: false,
      orientation: 'horizontal'
    }
  }
)

const tabsContentVariants = cva(
  'mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  {
    variants: {
      orientation: {
        horizontal: 'w-full',
        vertical: 'flex-1 ml-4'
      }
    },
    defaultVariants: {
      orientation: 'horizontal'
    }
  }
)

interface TabsContextType {
  activeTab: string
  setActiveTab: (value: string) => void
  orientation: 'horizontal' | 'vertical'
}

const TabsContext = React.createContext<TabsContextType | undefined>(undefined)

const useTabsContext = () => {
  const context = React.useContext(TabsContext)
  if (!context) {
    throw new Error('Tabs components must be used within a Tabs provider')
  }
  return context
}

interface TabsProps extends VariantProps<typeof tabsVariants> {
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
  className?: string
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ defaultValue = '', value, onValueChange, orientation = 'horizontal', className, children, ...props }, ref) => {
    const [activeTab, setActiveTab] = React.useState(value || defaultValue)

    const handleTabChange = React.useCallback((newValue: string) => {
      setActiveTab(newValue)
      onValueChange?.(newValue)
    }, [onValueChange])

    React.useEffect(() => {
      if (value !== undefined) {
        setActiveTab(value)
      }
    }, [value])

    return (
      <TabsContext.Provider value={{ activeTab, setActiveTab: handleTabChange, orientation: orientation || 'horizontal' }}>
        <div
          ref={ref}
          className={cn(tabsVariants({ orientation: orientation || 'horizontal', className }))}
          {...props}
        >
          {children}
        </div>
      </TabsContext.Provider>
    )
  }
)
Tabs.displayName = 'Tabs'

interface TabsListProps {
  children: React.ReactNode
  className?: string
}

const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
  ({ className, children, ...props }, ref) => {
    const { orientation = 'horizontal' } = useTabsContext()

    return (
      <div
        ref={ref}
        role="tablist"
        className={cn(tabsListVariants({ orientation, className }))}
        {...props}
      >
        {children}
      </div>
    )
  }
)
TabsList.displayName = 'TabsList'

interface TabsTriggerProps {
  value: string
  children: React.ReactNode
  className?: string
  disabled?: boolean
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ value, disabled, className, children, ...props }, ref) => {
    const { activeTab, setActiveTab, orientation } = useTabsContext()
    const isActive = activeTab === value

    return (
      <button
        ref={ref}
        role="tab"
        aria-selected={isActive}
        aria-controls={`content-${value}`}
        data-state={isActive ? 'active' : 'inactive'}
        disabled={disabled}
        className={cn(tabsTriggerVariants({ active: isActive, orientation, className }))}
        onClick={() => !disabled && setActiveTab(value)}
        {...props}
      >
        {children}
      </button>
    )
  }
)
TabsTrigger.displayName = 'TabsTrigger'

interface TabsContentProps {
  value: string
  children: React.ReactNode
  className?: string
  forceMount?: boolean
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ value, forceMount, className, children, ...props }, ref) => {
    const { activeTab, orientation } = useTabsContext()
    const isActive = activeTab === value

    if (!isActive && !forceMount) {
      return null
    }

    return (
      <div
        ref={ref}
        role="tabpanel"
        id={`content-${value}`}
        aria-labelledby={`trigger-${value}`}
        data-state={isActive ? 'active' : 'inactive'}
        className={cn(tabsContentVariants({ orientation, className }))}
        style={{ display: isActive ? 'block' : 'none' }}
        {...props}
      >
        {children}
      </div>
    )
  }
)
TabsContent.displayName = 'TabsContent'

export { Tabs, TabsList, TabsTrigger, TabsContent }
export type { TabsProps, TabsListProps, TabsTriggerProps, TabsContentProps }
