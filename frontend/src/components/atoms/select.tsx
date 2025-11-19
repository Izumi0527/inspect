import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'

const Select = SelectPrimitive.Root

const SelectGroup = SelectPrimitive.Group

const SelectValue = SelectPrimitive.Value

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-12 w-full items-center justify-between rounded-xl border border-gray-200/50 dark:border-gray-700/50 bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg px-4 py-3 text-base dark:text-gray-100 ring-offset-background',
      'placeholder:text-gray-500 dark:placeholder:text-gray-400',
      'focus:border-purple-400 focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-purple-400/20 focus:outline-none',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'hover:border-gray-300 dark:hover:border-gray-600',
      '[&>span]:line-clamp-1',
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      'flex cursor-default items-center justify-center py-1',
      className
    )}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      'flex cursor-default items-center justify-center py-1',
      className
    )}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-xl border border-gray-200/20 dark:border-gray-700/20 bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl text-gray-950 dark:text-gray-100 shadow-2xl',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
        'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        position === 'popper' &&
          'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          'p-1',
          position === 'popper' &&
            'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]'
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn('py-1.5 pl-8 pr-2 text-sm font-semibold text-gray-900 dark:text-gray-100', className)}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-default select-none items-center rounded-lg py-2 pl-8 pr-2 text-sm outline-none',
      'focus:bg-purple-100/50 dark:focus:bg-purple-900/30 focus:text-purple-900 dark:focus:text-purple-100',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      'hover:bg-gray-100/50 dark:hover:bg-gray-700/50',
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-gray-200 dark:bg-gray-700', className)}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

// 多选下拉框组件
interface MultiSelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  className?: string
  maxDisplayItems?: number
}

export const MultiSelect: React.FC<MultiSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = '请选择...',
  className,
  maxDisplayItems = 3
}) => {
  const [isOpen, setIsOpen] = React.useState(false)

  const handleToggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter(v => v !== optionValue))
    } else {
      onChange([...value, optionValue])
    }
  }

  const displayText = React.useMemo(() => {
    if (value.length === 0) return placeholder
    
    const selectedOptions = options.filter(opt => value.includes(opt.value))
    
    if (selectedOptions.length <= maxDisplayItems) {
      return selectedOptions.map(opt => opt.label).join(', ')
    }
    
    return `已选择 ${selectedOptions.length} 项`
  }, [value, options, placeholder, maxDisplayItems])

  return (
    <div className={cn('relative', className)}>
      <motion.button
        whileTap={{ scale: 0.99 }}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex h-12 w-full items-center justify-between rounded-xl border border-gray-200/50 dark:border-gray-700/50 bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg px-4 py-3 text-base dark:text-gray-100',
          'placeholder:text-gray-500 dark:placeholder:text-gray-400',
          'focus:border-purple-400 focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-purple-400/20 focus:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'hover:border-gray-300 dark:hover:border-gray-600',
          'text-left'
        )}
      >
        <span className={cn(
          'block truncate',
          value.length === 0 && 'text-gray-500 dark:text-gray-400'
        )}>
          {displayText}
        </span>
        <ChevronDown className={cn(
          'h-4 w-4 transition-transform duration-200',
          isOpen && 'rotate-180'
        )} />
      </motion.button>

      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200/20 dark:border-gray-700/20 bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl shadow-2xl"
        >
          <div className="max-h-60 overflow-auto p-1">
            {options.map((option) => (
              <motion.button
                key={option.value}
                type="button"
                whileHover={{ backgroundColor: 'rgba(139, 92, 246, 0.1)' }}
                onClick={() => handleToggle(option.value)}
                disabled={option.disabled}
                className={cn(
                  'relative flex w-full items-center space-x-2 rounded-lg px-3 py-2 text-sm text-left transition-colors',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  'hover:bg-purple-100/50'
                )}
              >
                <div className={cn(
                  'flex h-4 w-4 items-center justify-center rounded border-2 transition-colors',
                  value.includes(option.value)
                    ? 'border-purple-500 bg-purple-500 text-white'
                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
                )}>
                  {value.includes(option.value) && (
                    <Check className="h-3 w-3" />
                  )}
                </div>
                <span className="flex-1">{option.label}</span>
              </motion.button>
            ))}
          </div>
          
          {value.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 p-2">
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full rounded-lg px-3 py-2 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors"
              >
                清空选择
              </button>
            </div>
          )}
        </motion.div>
      )}
      
      {/* 背景遮罩 */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}

// 简单下拉选择器包装器 - 提供 onChange 接口和 error 支持
interface SimpleSelectProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  children: React.ReactNode
  className?: string
  error?: string
}

const SimpleSelect: React.FC<SimpleSelectProps> = ({
  value,
  onChange,
  placeholder,
  children,
  className,
  error
}) => {
  return (
    <div className="relative">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={cn(
          error && 'border-red-400 focus:border-red-400 focus:ring-red-400/20',
          className
        )}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {children}
        </SelectContent>
      </Select>
      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  )
}

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
  SimpleSelect,
}