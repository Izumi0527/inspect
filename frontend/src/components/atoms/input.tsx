import * as React from 'react'
import { cn } from '@/utils/cn'

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        'flex h-12 w-full rounded-xl border border-gray-200/50 dark:border-gray-700/50 bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg px-4 py-3 text-base dark:text-gray-100 transition-all duration-200',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-gray-950 dark:file:text-gray-100',
        'placeholder:text-gray-500 dark:placeholder:text-gray-400',
        'focus:border-purple-400 focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-purple-400/20 focus:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'hover:border-gray-300 dark:hover:border-gray-600',
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Input.displayName = 'Input'

// Simple Input wrapper with error support
interface SimpleInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

const SimpleInput = React.forwardRef<HTMLInputElement, SimpleInputProps>(
  ({ error, leftIcon, rightIcon, className, ...props }, ref) => {
    return (
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
            {leftIcon}
          </div>
        )}
        <Input
          ref={ref}
          className={cn(
            error && 'border-red-400 focus:border-red-400 focus:ring-red-400/20',
            leftIcon && 'pl-10',
            rightIcon && 'pr-10',
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
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
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
      className={cn(
        'flex min-h-[120px] w-full rounded-xl border border-gray-200/50 dark:border-gray-700/50 bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg px-4 py-3 text-base dark:text-gray-100 transition-all duration-200',
        'placeholder:text-gray-500 dark:placeholder:text-gray-400',
        'focus:border-purple-400 focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-purple-400/20 focus:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'hover:border-gray-300 dark:hover:border-gray-600',
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