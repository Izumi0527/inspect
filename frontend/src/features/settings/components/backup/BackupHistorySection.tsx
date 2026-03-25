'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SectionHeader } from '@/features/settings/components/shared/SectionHeader'
import { EmptyState } from '@/features/settings/components/shared/EmptyState'
import { SettingsConfirmDialog } from '@/features/settings/shell/SettingsConfirmDialog'
import {
  Database,
  Download,
  RotateCcw,
  Trash2,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
} from 'lucide-react'
import type { BackupRecord } from '@/features/settings/types/backup.types'
import { toast } from 'react-hot-toast'

interface Props {
  backups: BackupRecord[]
  totalCount: number
  diskUsage: {
    used: number
    total: number
    percentage: number
  }
  isCreating: boolean
  isDeleting: boolean
  onCreateBackup: () => Promise<void>
  onDownloadBackup: (backupId: string, fileName: string) => Promise<void>
  onRestoreBackup: (backupId: string) => Promise<void>
  onDeleteBackup: (backupId: string) => Promise<void>
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

// 格式化时间
function formatDateTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// 格式化备份耗时
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}分${remainingSeconds}秒`
}

// 状态Badge
function StatusBadge({ status }: { status: 'success' | 'failed' | 'in_progress' }) {
  const config = {
    success: {
      variant: 'default' as const,
      icon: CheckCircle,
      label: '成功',
      className: 'bg-green-100 text-green-800 border-green-200',
    },
    failed: {
      variant: 'destructive' as const,
      icon: XCircle,
      label: '失败',
      className: 'bg-red-100 text-red-800 border-red-200',
    },
    in_progress: {
      variant: 'outline' as const,
      icon: Clock,
      label: '进行中',
      className: 'bg-blue-100 text-blue-800 border-blue-200',
    },
  }

  // 防御性检查：如果状态值不在配置中，使用默认配置
  const statusConfig = config[status] || {
    variant: 'outline' as const,
    icon: AlertCircle,
    label: status || '未知',
    className: 'bg-muted text-foreground border-border',
  }

  const { icon: Icon, label, className } = statusConfig

  return (
    <Badge variant="outline" className={className}>
      <Icon className="w-3 h-3 mr-1" />
      {label}
    </Badge>
  )
}

// 类型Badge
function TypeBadge({ type }: { type: 'auto' | 'manual' }) {
  return (
    <Badge variant={type === 'auto' ? 'secondary' : 'outline'}>
      {type === 'auto' ? '自动' : '手动'}
    </Badge>
  )
}

export function BackupHistorySection({
  backups,
  totalCount,
  diskUsage,
  isCreating,
  isDeleting,
  onCreateBackup,
  onDownloadBackup,
  onRestoreBackup,
  onDeleteBackup,
}: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmKind, setConfirmKind] = useState<'restore' | 'delete' | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; fileName: string } | null>(null)
  const [restorePending, setRestorePending] = useState(false)
  const [deletePending, setDeletePending] = useState(false)

  const handleCreateBackup = async () => {
    try {
      await onCreateBackup()
      toast.success('备份创建成功！')
    } catch (err) {
      toast.error('备份创建失败：' + (err as Error).message)
    }
  }

  const handleDownload = async (backupId: string, fileName: string) => {
    try {
      await onDownloadBackup(backupId, fileName)
      toast.success('备份下载成功！')
    } catch (err) {
      toast.error('备份下载失败：' + (err as Error).message)
    }
  }

  const handleRequestRestore = (backupId: string, fileName: string) => {
    setConfirmKind('restore')
    setConfirmTarget({ id: backupId, fileName })
    setConfirmOpen(true)
  }

  const handleRequestDelete = (backupId: string, fileName: string) => {
    setConfirmKind('delete')
    setConfirmTarget({ id: backupId, fileName })
    setConfirmOpen(true)
  }

  const handleConfirm = async () => {
    if (!confirmKind || !confirmTarget) return

    if (confirmKind === 'restore') {
      setRestorePending(true)
      try {
        await onRestoreBackup(confirmTarget.id)
        toast.success('系统配置恢复成功！页面将重新加载')
        setConfirmOpen(false)
        setTimeout(() => {
          try {
            window.location.reload()
          } catch {
            // 某些测试/非浏览器环境下不支持 reload，忽略即可
          }
        }, 2000)
      } catch (err) {
        toast.error('备份恢复失败：' + (err as Error).message)
      } finally {
        setRestorePending(false)
      }
      return
    }

    setDeletePending(true)
    setDeletingId(confirmTarget.id)
    try {
      await onDeleteBackup(confirmTarget.id)
      toast.success('备份已删除')
      setConfirmOpen(false)
    } catch (err) {
      toast.error('备份删除失败：' + (err as Error).message)
    } finally {
      setDeletePending(false)
      setDeletingId(null)
    }
  }

  const handleConfirmOpenChange = (open: boolean) => {
    setConfirmOpen(open)
    if (!open) {
      setConfirmKind(null)
      setConfirmTarget(null)
    }
  }

  return (
    <div className="p-4">
      <SectionHeader
        title="备份历史记录"
        description={`共 ${totalCount} 个备份文件`}
        icon={Database}
        actions={
          <Button onClick={handleCreateBackup} disabled={isCreating}>
            {isCreating ? (
              <>
                <Clock className="w-4 h-4 mr-2 animate-spin" />
                创建中...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                手动备份
              </>
            )}
          </Button>
        }
      />

      {/* 磁盘使用情况 */}
      <div className="mt-4 mb-4 rounded-lg border border-border bg-muted/40 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground/90">磁盘使用情况</span>
          <span className="text-sm text-muted-foreground">
            {formatFileSize(diskUsage.used)} / {formatFileSize(diskUsage.total)}
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full ${
              diskUsage.percentage > 90
                ? 'bg-red-600'
                : diskUsage.percentage > 70
                  ? 'bg-yellow-500'
                  : 'bg-blue-600'
            }`}
            style={{ width: `${Math.min(diskUsage.percentage, 100)}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {diskUsage.percentage > 90 && (
            <div className="flex items-center text-red-600">
              <AlertCircle className="w-4 h-4 mr-1" />
              磁盘空间不足，请及时清理旧备份
            </div>
          )}
        </div>
      </div>

      {/* 备份列表 */}
      {backups.length === 0 ? (
        <EmptyState
          title="暂无备份记录"
          description='点击上方"手动备份"按钮创建第一个备份'
          icon={Database}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-foreground/90">文件名</th>
                <th className="px-4 py-3 text-left font-medium text-foreground/90">大小</th>
                <th className="px-4 py-3 text-left font-medium text-foreground/90">类型</th>
                <th className="px-4 py-3 text-left font-medium text-foreground/90">状态</th>
                <th className="px-4 py-3 text-left font-medium text-foreground/90">创建时间</th>
                <th className="px-4 py-3 text-left font-medium text-foreground/90">耗时</th>
                <th className="px-4 py-3 text-left font-medium text-foreground/90">创建者</th>
                <th className="px-4 py-3 text-right font-medium text-foreground/90">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {backups.map((backup) => (
                <tr key={backup.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center">
                      <Database className="w-4 h-4 mr-2 text-muted-foreground/80" />
                      <span className="font-mono text-xs">{backup.fileName}</span>
                    </div>
                    {backup.errorMessage && (
                      <div className="mt-1 text-xs text-red-600">{backup.errorMessage}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatFileSize(backup.fileSize)}</td>
                  <td className="px-4 py-3">
                    <TypeBadge type={backup.backupType} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={backup.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(backup.createdAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDuration(backup.duration)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{backup.createdBy}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end space-x-2">
                      {backup.status === 'success' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownload(backup.id, backup.fileName)}
                            aria-label={`下载备份 ${backup.fileName}`}
                            title="下载备份"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRequestRestore(backup.id, backup.fileName)}
                            disabled={Boolean(restorePending)}
                            aria-label={`恢复备份 ${backup.fileName}`}
                            title="恢复备份"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRequestDelete(backup.id, backup.fileName)}
                        disabled={Boolean((isDeleting || deletePending) && deletingId === backup.id)}
                        aria-label={`删除备份 ${backup.fileName}`}
                        title="删除备份"
                      >
                        <Trash2
                          className={`w-4 h-4 ${deletingId === backup.id ? 'animate-spin' : ''}`}
                        />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SettingsConfirmDialog
        open={confirmOpen}
        onOpenChange={handleConfirmOpenChange}
        tone="danger"
        title={confirmKind === 'restore' ? '确认恢复备份？' : '确认删除备份？'}
        description={
          confirmKind === 'restore'
            ? confirmTarget
              ? `将恢复备份“${confirmTarget.fileName}”。\n\n当前版本仅支持恢复系统配置（settings），将覆盖当前配置。\n\n此操作不可逆，请谨慎操作。`
              : '当前版本仅支持恢复系统配置（settings），将覆盖当前配置。此操作不可逆，请谨慎操作。'
            : confirmTarget
              ? `将永久删除备份“${confirmTarget.fileName}”。\n\n此操作不可撤销，请谨慎操作。`
              : '此操作不可撤销，请谨慎操作。'
        }
        confirmText={confirmKind === 'restore' ? '确认恢复' : '确认删除'}
        cancelText="取消"
        confirmLoading={Boolean(confirmKind === 'restore' ? restorePending : deletePending || isDeleting)}
        confirmDisabled={Boolean(!confirmKind || !confirmTarget)}
        onConfirm={() => void handleConfirm()}
      />
    </div>
  )
}
