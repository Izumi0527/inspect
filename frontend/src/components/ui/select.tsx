import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'

/**
 * 选择器。精密仪器方向：
 * - 触发器与 Input 同规格（36px / 圆角 6 / 1px 刻线）
 * - 下拉面板是浮层：圆角 12 + 唯一阴影 shadow-overlay（不透明底，无模糊）
 */
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
      'flex h-9 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-1.5 text-sm text-foreground',
      'placeholder:text-muted-foreground',
      'focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25',
      'disabled:cursor-not-allowed disabled:opacity-50',
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
    className={cn('flex cursor-default items-center justify-center py-1', className)}
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
    className={cn('flex cursor-default items-center justify-center py-1', className)}
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
        'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-overlay',
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
    className={cn('py-1.5 pl-8 pr-2 text-sm font-semibold text-foreground', className)}
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
      'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none',
      'focus:bg-accent focus:text-accent-foreground',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
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
    className={cn('-mx-1 my-1 h-px bg-border', className)}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export interface MultiSelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface MultiSelectProps {
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  className?: string
  maxDisplayItems?: number
  triggerId?: string
  ariaLabel?: string
  triggerClassName?: string
  dropdownClassName?: string
  itemClassName?: string
  clearButtonClassName?: string
}

export const MultiSelect: React.FC<MultiSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = '请选择...',
  className,
  maxDisplayItems = 3,
  triggerId,
  ariaLabel,
  triggerClassName,
  dropdownClassName,
  itemClassName,
  clearButtonClassName,
}) => {
  const [isOpen, setIsOpen] = React.useState(false)

  const handleToggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((item) => item !== optionValue))
      return
    }

    onChange([...value, optionValue])
  }

  const displayText = React.useMemo(() => {
    if (value.length === 0) return placeholder

    const selectedOptions = options.filter((option) => value.includes(option.value))

    if (selectedOptions.length <= maxDisplayItems) {
      return selectedOptions.map((option) => option.label).join(', ')
    }

    return `已选择 ${selectedOptions.length} 项`
  }, [maxDisplayItems, options, placeholder, value])

  return (
    <div className={cn('relative', className)}>
      <motion.button
        whileTap={{ scale: 0.99 }}
        id={triggerId}
        type="button"
        aria-label={ariaLabel}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-1.5 text-left text-sm text-foreground',
          'placeholder:text-muted-foreground',
          'focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25',
          'disabled:cursor-not-allowed disabled:opacity-50',
          triggerClassName
        )}
      >
        <span className={cn('block truncate', value.length === 0 && 'text-muted-foreground')}>
          {displayText}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 transition-transform duration-150', isOpen && 'rotate-180')}
        />
      </motion.button>

      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className={cn(
            'absolute z-50 mt-1 w-full rounded-xl border border-border bg-popover shadow-overlay',
            dropdownClassName
          )}
        >
          <div className="max-h-60 overflow-auto p-1">
            {options.map((option) => (
              <motion.button
                key={option.value}
                type="button"
                onClick={() => handleToggle(option.value)}
                disabled={option.disabled}
                className={cn(
                  'relative flex w-full items-center space-x-2 rounded-sm px-3 py-1.5 text-left text-sm transition-colors duration-100',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  'hover:bg-accent',
                  itemClassName
                )}
              >
                <div
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded-[4px] border transition-colors',
                    value.includes(option.value)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-card'
                  )}
                >
                  {value.includes(option.value) && <Check className="h-3 w-3" />}
                </div>
                <span className="flex-1">{option.label}</span>
              </motion.button>
            ))}
          </div>

          {value.length > 0 && (
            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={() => onChange([])}
                className={cn(
                  'w-full rounded-sm px-3 py-1.5 text-xs text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground',
                  clearButtonClassName
                )}
              >
                清空选择
              </button>
            </div>
          )}
        </motion.div>
      )}

      {isOpen && <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />}
    </div>
  )
}

export interface SimpleSelectProps {
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
  error,
}) => {
  return (
    <div className="relative">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          className={cn(
            error && 'border-destructive focus:border-destructive focus:ring-destructive/20',
            className
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
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
