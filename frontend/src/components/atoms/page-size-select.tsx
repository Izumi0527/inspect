import React from 'react'
import { SharedSelect } from '@/components/atoms/shared-select'

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const

export interface PageSizeSelectProps {
  value: number
  onChange: (value: number) => void
  options?: readonly number[]
  ariaLabel?: string
  placeholder?: string
  className?: string
  triggerClassName?: string
  disabled?: boolean
  formatOptionLabel?: (value: number) => React.ReactNode
}

const defaultFormatOptionLabel = (value: number) => `${value}条/页`

export const PageSizeSelect: React.FC<PageSizeSelectProps> = ({
  value,
  onChange,
  options = DEFAULT_PAGE_SIZE_OPTIONS,
  ariaLabel = '每页条数',
  placeholder = '每页条数',
  className,
  triggerClassName,
  disabled = false,
  formatOptionLabel = defaultFormatOptionLabel,
}) => {
  const handleValueChange = (nextValue: string) => {
    const pageSize = Number(nextValue)
    if (Number.isInteger(pageSize) && pageSize > 0) {
      onChange(pageSize)
    }
  }

  return (
    <SharedSelect
      value={String(value)}
      onChange={handleValueChange}
      options={options.map((option) => ({
        value: String(option),
        label: formatOptionLabel(option),
      }))}
      ariaLabel={ariaLabel}
      placeholder={placeholder}
      className={className}
      triggerClassName={triggerClassName}
      disabled={disabled}
    />
  )
}
