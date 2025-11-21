'use client'

import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface ConfigSwitchProps {
  checked: boolean
  onChange?: (checked: boolean) => void
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  label?: string
  id?: string
}

export function ConfigSwitch({
  checked,
  onChange,
  onCheckedChange,
  disabled = false,
  label,
  id,
}: ConfigSwitchProps) {
  const handleChange = onCheckedChange ?? onChange ?? (() => {})

  return (
    <div className="flex items-center space-x-2">
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={handleChange}
        disabled={disabled}
      />
      {label && (
        <Label
          htmlFor={id}
          className="text-sm font-normal text-gray-700 cursor-pointer"
        >
          {label}
        </Label>
      )}
    </div>
  )
}
