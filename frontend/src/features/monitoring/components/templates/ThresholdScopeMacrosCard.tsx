'use client'

import { HelpCircle, Save } from 'lucide-react'
import { Button, Input, Popover, PopoverContent, PopoverTrigger } from '@/components/atoms'
import type { TemplateMacro } from '../../types/zabbix-monitoring.types'

interface ThresholdScopeMacrosCardProps {
  macros: TemplateMacro[]
  isBuiltin: boolean
  canControl: boolean
  saving: boolean
  onChange: (macros: TemplateMacro[]) => void
  onSave: () => void
}

export function ThresholdScopeMacrosCard({
  macros,
  isBuiltin,
  canControl,
  saving,
  onChange,
  onSave,
}: ThresholdScopeMacrosCardProps) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">方案默认阈值参数</h3>
          <p className="text-xs text-muted-foreground">
            {isBuiltin
              ? '系统预置方案默认值受保护，您可在下方针对单台设备单独微调，或克隆后统一修改。'
              : '修改默认阈值后，所有未单独微调的已绑定设备将自动沿用。'}
          </p>
        </div>
        {!isBuiltin && canControl && (
          <Button type="button" size="sm" loading={saving} onClick={onSave}>
            <Save className="h-3.5 w-3.5" />
            保存默认阈值
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {macros.map((macro, idx) => (
          <div key={macro.key} className="rounded-lg border border-border bg-surface-2/50 p-3">
            <div className="mb-2 flex items-center justify-between gap-1">
              <label htmlFor={`macro-${macro.key}`} className="text-xs font-medium text-foreground">
                {macro.label}
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={`查看 ${macro.label} 参数说明`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-60 p-3 text-xs">
                  <p className="font-medium text-foreground">{macro.label}</p>
                  {macro.description && (
                    <p className="mt-1 text-muted-foreground">{macro.description}</p>
                  )}
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    内部参数键名：<span className="font-mono">{macro.key}</span>
                  </p>
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id={`macro-${macro.key}`}
                disabled={isBuiltin || !canControl}
                value={macro.default_value}
                onChange={(e) =>
                  onChange(
                    macros.map((m, i) => (i === idx ? { ...m, default_value: e.target.value } : m))
                  )
                }
                className="h-8 text-sm font-medium tabular-nums"
              />
              {macro.unit && (
                <span className="shrink-0 text-xs text-muted-foreground">{macro.unit}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
