'use client'

import { useId } from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface ConfigSwitchProps {
  checked: boolean | undefined
  onChange?: (checked: boolean) => void
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  label?: string
  id?: string
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

export function ConfigSwitch({
  checked,
  onChange,
  onCheckedChange,
  disabled = false,
  label,
  id,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: ConfigSwitchProps) {
  const autoId = useId()
  const resolvedId = id ?? `settings-switch-${autoId.replace(/:/g, '')}`
  const handleChange = onCheckedChange ?? onChange ?? (() => {})
  // 确保 checked 始终有定义值，避免受控/非受控组件切换警告
  const safeChecked = checked ?? false

  return (
    <div className="flex items-center space-x-2">
      <Switch
        id={resolvedId}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        checked={safeChecked}
        onCheckedChange={handleChange}
        disabled={disabled}
      />
      {label && (
        <Label
          htmlFor={resolvedId}
          className="text-sm font-normal text-foreground/90 cursor-pointer"
        >
          {label}
        </Label>
      )}
    </div>
  )
}
