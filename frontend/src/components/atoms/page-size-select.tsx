import React from 'react'
import { PAGE_SIZE_OPTIONS } from '@/constants/pagination'
import { SharedSelect } from '@/components/atoms/shared-select'

/** 全站统一的每页条数选项文案。 */
export const formatPageSizeOption = (value: number): string => `${value}条/页`

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

export const PageSizeSelect: React.FC<PageSizeSelectProps> = ({
  value,
  onChange,
  options = PAGE_SIZE_OPTIONS,
  ariaLabel = '每页条数',
  placeholder = '每页条数',
  className,
  triggerClassName,
  disabled = false,
  formatOptionLabel = formatPageSizeOption,
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
