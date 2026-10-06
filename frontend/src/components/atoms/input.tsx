import * as React from 'react'
import { cn } from '@/utils/cn'

/**
 * 输入控件。精密仪器方向：
 * - 高 36px、圆角 6px、1px 刻线（--rule-strong）、无模糊与阴影
 * - 聚焦 = 品牌色外环（唯一交互信号）；错误 = danger 令牌
 */
const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex w-full border border-input bg-card text-sm text-foreground transition-colors duration-150 motion-reduce:transition-none',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        'placeholder:text-muted-foreground',
        'focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Input.displayName = 'Input'

// Simple Input wrapper with error support
export interface SimpleInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

const SimpleInput = React.forwardRef<HTMLInputElement, SimpleInputProps>(
  ({ error, leftIcon, rightIcon, className, ...props }, ref) => {
    return (
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {leftIcon}
          </div>
        )}
        <Input
          ref={ref}
          className={cn(
            error && 'border-destructive focus:border-destructive focus:ring-destructive/20',
            leftIcon && 'pl-9',
            rightIcon && 'pr-9',
            className
          )}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {rightIcon}
          </div>
        )}
        {error && (
          <p className="mt-1 text-sm text-destructive">{error}</p>
        )}
      </div>
    )
  }
)
SimpleInput.displayName = 'SimpleInput'

const TextArea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-[120px] w-full border border-input bg-card text-sm text-foreground transition-colors duration-150 motion-reduce:transition-none',
        'placeholder:text-muted-foreground',
        'focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'resize-none',
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
TextArea.displayName = 'TextArea'

export { Input, SimpleInput, TextArea }
