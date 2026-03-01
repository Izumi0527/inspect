'use client'

import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface ConfigSwitchProps {
  checked: boolean | undefined
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
  // 确保 checked 始终有定义值，避免受控/非受控组件切换警告
  const safeChecked = checked ?? false

  return (
    <div className="flex items-center space-x-2">
      <Switch
        id={id}
        checked={safeChecked}
        onCheckedChange={handleChange}
        disabled={disabled}
      />
      {label && (
        <Label
          htmlFor={id}
          className="text-sm font-normal text-foreground/90 cursor-pointer"
        >
          {label}
        </Label>
      )}
    </div>
  )
}
