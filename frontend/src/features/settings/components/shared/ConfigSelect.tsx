'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Option {
  value: string | number
  label: string
}

interface ConfigSelectProps {
  value: string | number
  options: Option[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  className?: string
}

export function ConfigSelect({
  value,
  options,
  onChange,
  placeholder = '请选择',
  disabled = false,
  id,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  className,
}: ConfigSelectProps) {
  return (
    <Select
      value={String(value)}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        className={className || 'max-w-md'}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={String(option.value)}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
