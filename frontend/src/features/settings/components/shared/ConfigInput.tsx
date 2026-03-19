'use client'

import { Input } from '@/components/ui/input'
import { cn } from '@/utils/cn'

interface ConfigInputProps {
  value: string | number | undefined
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  type?: 'text' | 'number' | 'email' | 'password' | 'url' | 'time'
  min?: number
  max?: number
  id?: string
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
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
  id,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  className,
}: ConfigInputProps) {
  // 确保 value 始终有定义值，避免受控/非受控组件切换警告
  const safeValue = value ?? (type === 'number' ? 0 : '')

  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      type={type}
      value={safeValue}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      min={min}
      max={max}
      className={cn(
        'max-w-md',
        disabled && 'bg-muted/40 cursor-not-allowed',
        className
      )}
    />
  )
}
