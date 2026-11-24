'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type {
  ActiveProblemItem,
  SnoozeDurationHours,
} from '../../types/zabbix-monitoring.types'

interface AcknowledgeProblemModalProps {
  problem: ActiveProblemItem | null
  submitting: boolean
  onClose: () => void
  onConfirm: (payload: { note?: string; assignee?: string }) => void
}

export function AcknowledgeProblemModal({
  problem,
  submitting,
  onClose,
  onConfirm,
}: AcknowledgeProblemModalProps) {
  const [note, setNote] = useState('')
  const [assignee, setAssignee] = useState('')

  useEffect(() => {
    setNote('')
    setAssignee('')
  }, [problem?.alert_id])

  return (
    <Dialog open={problem !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>接手确认告警</DialogTitle>
          <DialogDescription>
            {problem ? `${problem.device_name} · ${problem.title}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">
              接手人（可选）
            </label>
            <input
              type="text"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="默认记录当前登录用户"
              className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">
              处置备注（可选）
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：已安排核查上联光功率"
              className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button
            type="button"
            disabled={submitting}
            onClick={() =>
              onConfirm({
                note: note.trim() || undefined,
                assignee: assignee.trim() || undefined,
              })
            }
          >
            {submitting ? '提交中...' : '确认接手'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface SnoozeProblemModalProps {
  problem: ActiveProblemItem | null
  submitting: boolean
  onClose: () => void
  onConfirm: (durationHours: SnoozeDurationHours, reason: string) => void
}

const SNOOZE_DURATIONS: readonly SnoozeDurationHours[] = [2, 8, 24]
const MAX_SNOOZE_REASON_RUNES = 256

export function SnoozeProblemModal({
  problem,
  submitting,
  onClose,
  onConfirm,
}: SnoozeProblemModalProps) {
  const [durationHours, setDurationHours] = useState<SnoozeDurationHours>(2)
  const [reason, setReason] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    setDurationHours(2)
    setReason('')
    setErrorMsg('')
  }, [problem?.alert_id])

  const reasonRuneCount = Array.from(reason).length

  const handleSubmit = () => {
    const trimmed = reason.trim()
    if (!trimmed) {
      setErrorMsg('请填写临时静默原因')
      return
    }
    if (Array.from(trimmed).length > MAX_SNOOZE_REASON_RUNES) {
      setErrorMsg(`静默原因不能超过 ${MAX_SNOOZE_REASON_RUNES} 个字符`)
      return
    }
    setErrorMsg('')
    onConfirm(durationHours, trimmed)
  }

  return (
    <Dialog open={problem !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>临时静默单条告警</DialogTitle>
          <DialogDescription>
            {problem ? `${problem.device_name} · ${problem.title}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-info/30 bg-info-soft px-3 py-2 text-xs text-info-soft-foreground">
            仅静默当前这一条告警，不影响本机其他告警（如 CPU/端口断开等）的正常触发与通知。
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-foreground">
              静默时长
            </span>
            <div className="grid grid-cols-3 gap-2">
              {SNOOZE_DURATIONS.map((hours) => {
                const selected = durationHours === hours
                return (
                  <button
                    key={hours}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setDurationHours(hours)}
                    className={`rounded-md border px-3 py-2 text-sm font-medium tabular-nums transition-colors ${
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-foreground hover:bg-accent'
                    }`}
                  >
                    {hours}h
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <label className="font-medium text-foreground">
                静默原因（必填）
              </label>
              <span className="text-muted-foreground tabular-nums">
                {reasonRuneCount}/{MAX_SNOOZE_REASON_RUNES}
              </span>
            </div>
            <input
              type="text"
              maxLength={MAX_SNOOZE_REASON_RUNES}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                if (errorMsg) setErrorMsg('')
              }}
              placeholder="例如：光模块备件已下单，等待窗口更换"
              className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errorMsg && <p className="mt-1 text-xs text-danger">{errorMsg}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button type="button" disabled={submitting} onClick={handleSubmit}>
            {submitting ? '提交中...' : `静默 ${durationHours}h`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
