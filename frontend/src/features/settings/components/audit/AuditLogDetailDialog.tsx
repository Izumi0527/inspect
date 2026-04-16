'use client'

import { CheckCircle, XCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import type { AuditLog } from '../../types/audit.types'
import { actionLabels } from './audit.constants'

interface Props {
  open: boolean
  log: AuditLog | null
  onOpenChange: (open: boolean) => void
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString('zh-CN')
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
      <span className="text-xs font-medium text-muted-foreground pt-0.5">{label}</span>
      <div className="text-sm text-foreground break-words">{children}</div>
    </div>
  )
}

export function AuditLogDetailDialog({ open, log, onOpenChange }: Props) {
  if (!log) return null

  const actionLabel = actionLabels[log.action] || log.action

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>审计日志详情</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          {/* 基础信息 */}
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">基础信息</p>
            <DetailRow label="时间">
              {formatDate(log.createdAt)}
            </DetailRow>
            <DetailRow label="操作用户">
              {log.username || '—'}
            </DetailRow>
            <DetailRow label="操作类型">
              <div className="flex items-center gap-2">
                <span>{actionLabel}</span>
                <Badge variant="outline" className="text-xs">{log.action}</Badge>
              </div>
            </DetailRow>
            <DetailRow label="资源类型">
              {log.resource || '—'}
            </DetailRow>
            {log.resourceId && (
              <DetailRow label="资源 ID">
                <span className="font-mono text-xs">{log.resourceId}</span>
              </DetailRow>
            )}
          </div>

          {/* 操作详情 */}
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">操作详情</p>
            <DetailRow label="详情描述">
              <span className="whitespace-pre-wrap select-text">{log.details || '—'}</span>
            </DetailRow>
          </div>

          {/* 状态与来源 */}
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">状态与来源</p>
            <DetailRow label="执行状态">
              {log.status === 'success' ? (
                <Badge className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 gap-1">
                  <CheckCircle className="w-3 h-3" />
                  成功
                </Badge>
              ) : (
                <Badge className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 gap-1">
                  <XCircle className="w-3 h-3" />
                  失败
                </Badge>
              )}
            </DetailRow>
            {log.errorMessage && (
              <DetailRow label="错误信息">
                <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-700 dark:text-red-300 select-text whitespace-pre-wrap">
                  {log.errorMessage}
                </div>
              </DetailRow>
            )}
            <DetailRow label="IP 地址">
              <span className="font-mono text-xs">{log.ipAddress || '—'}</span>
            </DetailRow>
            <DetailRow label="User Agent">
              <span className="text-xs text-muted-foreground break-all select-text">
                {log.userAgent || '—'}
              </span>
            </DetailRow>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
