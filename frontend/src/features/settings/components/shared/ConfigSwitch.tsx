'use client'

import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface ConfigSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  id?: string
}

export function ConfigSwitch({
  checked,
  onChange,
  disabled = false,
  label,
  id,
}: ConfigSwitchProps) {
  return (
    <div className="flex items-center space-x-2">
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
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
