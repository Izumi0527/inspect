/**
 * Checkbox组件 - 使用原生HTML实现
 *
 * 精密仪器方向：勾选态走 primary 令牌（原硬编码蓝色已移除）；
 * 半选（indeterminate）直接按 prop 渲染，不再依赖不存在的 peer-indeterminate 变体。
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
            'peer h-4 w-4 shrink-0 rounded-[4px] border border-input bg-card',
            'appearance-none cursor-pointer',
            'focus:outline-none focus:ring-2 focus:ring-ring/40',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'checked:bg-primary checked:border-primary',
            className
          )}
          {...props}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-primary-foreground">
          {indeterminate ? (
            <Minus className="h-3 w-3" />
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
