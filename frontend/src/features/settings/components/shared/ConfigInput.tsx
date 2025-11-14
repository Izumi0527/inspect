'use client'

import { Input } from '@/components/ui/input'
import { cn } from '@/utils/cn'

interface ConfigInputProps {
  value: string | number
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  type?: 'text' | 'number' | 'email' | 'password' | 'url'
  min?: number
  max?: number
  className?: string
}

export function ConfigInput({
  value,
  onChange,
  placeholder,
  disabled = false,
  type = 'text',
  min,
  max,
  className,
}: ConfigInputProps) {
  return (
    <Input
      type={type}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      min={min}
      max={max}
      className={cn(
        'max-w-md',
        disabled && 'bg-gray-50 cursor-not-allowed',
        className
      )}
    />
  )
}
