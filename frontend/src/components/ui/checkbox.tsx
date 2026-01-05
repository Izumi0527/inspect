/**
 * Checkbox组件 - 使用原生HTML实现
 */
import * as React from 'react'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/utils/cn'

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  indeterminate?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, indeterminate, checked, onCheckedChange, onChange, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null)
    const combinedRef = (ref as React.RefObject<HTMLInputElement>) || innerRef

    React.useEffect(() => {
      if (combinedRef.current) {
        combinedRef.current.indeterminate = indeterminate || false
      }
    }, [indeterminate, combinedRef])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e)
      onCheckedChange?.(e.target.checked)
    }

    return (
      <div className="relative inline-flex items-center">
        <input
          type="checkbox"
          ref={combinedRef}
          checked={checked}
          onChange={handleChange}
          className={cn(
            'peer h-4 w-4 shrink-0 rounded-sm border border-gray-300 dark:border-gray-600',
            'appearance-none cursor-pointer',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'checked:bg-blue-600 checked:border-blue-600',
            className
          )}
          {...props}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-white">
          {indeterminate ? (
            <Minus className="h-3 w-3 opacity-0 peer-indeterminate:opacity-100" />
          ) : (
            <Check className="h-3 w-3 opacity-0 peer-checked:opacity-100" />
          )}
        </div>
      </div>
    )
  }
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }
export type { CheckboxProps }
