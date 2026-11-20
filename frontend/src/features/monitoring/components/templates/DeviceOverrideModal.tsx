'use client'

import { useEffect, useState } from 'react'
import { Button, Input } from '@/components/atoms'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { TemplateMacro } from '../../types/zabbix-monitoring.types'

interface DeviceOverrideModalProps {
  open: boolean
  deviceName: string
  macros: TemplateMacro[]
  initialOverrides: Record<string, string>
  submitting: boolean
  onClose: () => void
  onSave: (overrides: Record<string, string>) => void
}

export function DeviceOverrideModal({
  open,
  deviceName,
  macros,
  initialOverrides,
  submitting,
  onClose,
  onSave,
}: DeviceOverrideModalProps) {
  const [draft, setDraft] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    const next: Record<string, string> = {}
    for (const m of macros) {
      next[m.key] = initialOverrides[m.key] ?? ''
    }
    setDraft(next)
  }, [open, macros, initialOverrides])

  const handleConfirm = () => {
    const cleaned: Record<string, string> = {}
    for (const m of macros) {
      const val = (draft[m.key] ?? '').trim()
      if (val !== '' && val !== m.default_value) {
        cleaned[m.key] = val
      }
    }
    onSave(cleaned)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>单台设备阈值微调 · {deviceName}</DialogTitle>
          <DialogDescription>
            仅填写需要覆写的参数，留空则自动沿用监控方案默认值。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {macros.map((m) => (
            <div key={m.key} className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <label
                  htmlFor={`override-${m.key}`}
                  className="block text-xs font-medium text-foreground"
                >
                  {m.label}
                </label>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  方案默认：{m.default_value} {m.unit ?? ''}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  id={`override-${m.key}`}
                  value={draft[m.key] ?? ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [m.key]: e.target.value }))}
                  placeholder={m.default_value}
                  className="h-8 w-24 text-right text-xs tabular-nums"
                />
                <span className="w-8 text-xs text-muted-foreground">{m.unit ?? ''}</span>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button type="button" loading={submitting} onClick={handleConfirm}>
            保存单台微调
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
