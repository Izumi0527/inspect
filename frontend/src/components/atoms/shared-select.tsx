import React from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/utils/cn'

export interface SharedSelectOption {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

export interface SharedSelectProps {
  value?: string
  onChange?: (value: string) => void
  options: readonly SharedSelectOption[]
  ariaLabel?: string
  placeholder?: string
  className?: string
  triggerClassName?: string
  disabled?: boolean
}

export const SharedSelect: React.FC<SharedSelectProps> = ({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder = '请选择',
  className,
  triggerClassName,
  disabled = false,
}) => {
  return (
    <div className={className}>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          aria-label={ariaLabel}
          className={cn('h-8 w-[112px] px-3 text-sm', triggerClassName)}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
