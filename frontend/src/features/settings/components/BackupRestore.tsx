
import React, { useMemo, useState } from 'react'
import {
  Database,
  Download,
  Plus,
  RotateCcw,
  Trash2,
  ShieldCheck
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
  Input,
  TextArea,
  LoadingOverlay,
  PageLoading,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  ConfirmModal,
  SimpleModal
} from '@/components/atoms'
import {
  useBackups,
  useCreateBackup,
  useDeleteBackup,
  useRestoreBackup
} from '../hooks'
import { backupApi } from '../api/settings.api'
import type { Backup, BackupInclude } from '../types'

const typeLabels: Record<Backup['type'], string> = {
  full: '完整备份',
  incremental: '增量备份',
  differential: '差异备份'
}

const statusVariant: Record<Backup['status'], 'success' | 'danger' | 'warning' | 'outline'> = {
  creating: 'warning',
  completed: 'success',
  failed: 'danger',
  corrupted: 'danger'
}

const statusText: Record<Backup['status'], string> = {
  creating: '生成中',
  completed: '完成',
  failed: '失败',
  corrupted: '损坏'
}

const includeOptions: Array<{ key: BackupInclude['type']; label: string; name: string }> = [
  { key: 'database', label: '系统数据库', name: 'core-database' },
  { key: 'config', label: '系统配置', name: 'system-config' },
  { key: 'logs', label: '运行日志', name: 'runtime-logs' },
  { key: 'files', label: '业务文件', name: 'attachments' }
]

const formatSize = (size: number) => {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

interface CreateState {
  name: string
  description: string
  type: Backup['type']
  includes: Record<BackupInclude['type'], boolean>
}

const initialCreateState: CreateState = {
  name: '',
  description: '',
  type: 'full',
  includes: {
    database: true,
    config: true,
    logs: false,
    files: false
  }
}
export const BackupRestore: React.FC = () => {
  const { data: backups, isLoading, isFetching } = useBackups()
  const createBackup = useCreateBackup()
  const deleteBackup = useDeleteBackup()
  const restoreBackup = useRestoreBackup()

  const [createOpen, setCreateOpen] = useState(false)
  const [createState, setCreateState] = useState<CreateState>(initialCreateState)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [restoreId, setRestoreId] = useState<string | null>(null)
  const [validateLoading, setValidateLoading] = useState(false)

  const sortedBackups = useMemo(() => {
    if (!backups) return []
    return [...backups].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [backups])

  const overlayActive = isFetching || createBackup.isPending || deleteBackup.isPending || restoreBackup.isPending || validateLoading
  const overlayMessage = createBackup.isPending
    ? '正在创建备份...'
    : deleteBackup.isPending
      ? '正在删除备份...'
      : restoreBackup.isPending
        ? '正在恢复备份...'
        : validateLoading
          ? '正在校验备份完整性...'
          : '正在刷新备份列表...'

  const resetCreateState = () => {
    setCreateState(initialCreateState)
  }

  const handleCreate = () => {
    const selectedIncludes = Object.entries(createState.includes)
      .filter(([, value]) => value)
      .map(([key]) => {
        const option = includeOptions.find(item => item.key === key)
        return {
          type: key as BackupInclude['type'],
          name: option?.name || key
        }
      })

    if (selectedIncludes.length === 0) {
      toast.error('请至少选择一个备份内容')
      return
    }

    createBackup.mutate(
      {
        name: createState.name.trim() || `自动备份 ${new Date().toLocaleString()}`,
        description: createState.description.trim() || undefined,
        type: createState.type,
        includes: selectedIncludes
      },
      {
        onSuccess: () => {
          toast.success('备份任务已提交')
          setCreateOpen(false)
          resetCreateState()
        }
      }
    )
  }

  const handleDownload = async (backup: Backup) => {
    try {
      const blob = await backupApi.downloadBackup(backup.id)
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${backup.name || 'backup'}.zip`
      document.body.appendChild(anchor)
      anchor.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(anchor)
    } catch {
      toast.error('备份文件下载失败')
    }
  }

  const handleValidate = async (backup: Backup) => {
    try {
      setValidateLoading(true)
      const result = await backupApi.validateBackup(backup.id)
      if (result.valid) {
        toast.success('备份校验通过')
      } else {
        toast.error(`备份存在问题: ${result.issues.join('、')}`)
      }
    } catch {
      toast.error('备份校验失败')
    } finally {
      setValidateLoading(false)
    }
  }

  const handleRestore = (id: string) => {
    restoreBackup.mutate(
      { id, options: { overwrite: true } },
      {
        onSuccess: (data) => {
          toast.success(data.message || '备份恢复已执行')
          setRestoreId(null)
        }
      }
    )
  }

  const selectedBackupForRestore = sortedBackups.find(item => item.id === restoreId) || null
  const selectedBackupForDelete = sortedBackups.find(item => item.id === deleteId) || null

  return (
    <LoadingOverlay isLoading={overlayActive} message={overlayActive ? overlayMessage : undefined}>
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>备份与恢复</CardTitle>
            <CardDescription>管理系统数据备份，支持下载、校验与恢复</CardDescription>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />创建备份
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {isLoading ? (
            <PageLoading message="正在加载备份记录..." />
          ) : sortedBackups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
              暂无备份记录，请先创建一份新的备份。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-gray-500">名称</th>
                    <th className="px-4 py-3 font-medium text-gray-500">类型</th>
                    <th className="px-4 py-3 font-medium text-gray-500">大小</th>
                    <th className="px-4 py-3 font-medium text-gray-500">包含内容</th>
                    <th className="px-4 py-3 font-medium text-gray-500">状态</th>
                    <th className="px-4 py-3 font-medium text-gray-500">创建信息</th>
                    <th className="px-4 py-3 font-medium text-gray-500">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBackups.map(backup => (
                    <tr key={backup.id} className="border-b last:border-0">
                      <td className="px-4 py-3 text-gray-900">
                        <div className="font-medium">{backup.name}</div>
                        {backup.description && (
                          <div className="text-xs text-gray-500 mt-1">{backup.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{typeLabels[backup.type]}</td>
                      <td className="px-4 py-3 text-gray-700">{formatSize(backup.size)}</td>
                      <td className="px-4 py-3 text-gray-700">
                        <div className="flex flex-wrap gap-1">
                          {backup.includes.map(include => (
                            <Badge key={`${backup.id}-${include.type}-${include.name}`} variant="outline" size="sm">
                              {includeOptions.find(item => item.key === include.type)?.label || include.type}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant[backup.status]} size="sm">
                          {statusText[backup.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <div>{backup.createdBy}</div>
                        <div className="text-xs text-gray-500">{new Date(backup.createdAt).toLocaleString()}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownload(backup)}
                          >
                            <Download className="mr-1 h-4 w-4" />下载
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleValidate(backup)}
                            disabled={validateLoading}
                          >
                            <ShieldCheck className="mr-1 h-4 w-4" />校验
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setRestoreId(backup.id)}
                            disabled={backup.status !== 'completed'}
                          >
                            <RotateCcw className="mr-1 h-4 w-4" />恢复
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteId(backup.id)}
                          >
                            <Trash2 className="mr-1 h-4 w-4" />删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <SimpleModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false)
          resetCreateState()
        }}
        title="创建备份"
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs text-gray-500">备份名称</label>
              <Input
                placeholder="请输入备份名称"
                value={createState.name}
                onChange={event => setCreateState(prev => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">备份类型</label>
              <Select
                value={createState.type}
                onValueChange={value => setCreateState(prev => ({ ...prev, type: value as Backup['type'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(typeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500">备份描述</label>
            <TextArea
              rows={3}
              placeholder="可选，说明此次备份的用途"
              value={createState.description}
              onChange={event => setCreateState(prev => ({ ...prev, description: event.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500">备份内容</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {includeOptions.map(option => (
                <label key={option.key} className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={createState.includes[option.key]}
                    onChange={event =>
                      setCreateState(prev => ({
                        ...prev,
                        includes: {
                          ...prev.includes,
                          [option.key]: event.target.checked
                        }
                      }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => {
              setCreateOpen(false)
              resetCreateState()
            }}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={createBackup.isPending}>
              <Database className="mr-2 h-4 w-4" />提交备份任务
            </Button>
          </div>
        </div>
      </SimpleModal>

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (!deleteId) return
          deleteBackup.mutate(deleteId, {
            onSuccess: () => setDeleteId(null)
          })
        }}
        title="删除备份"
        description={`确认删除备份 ${selectedBackupForDelete?.name || ''} 吗？此操作不可恢复。`}
        confirmText="删除"
        cancelText="取消"
        variant="destructive"
      />

      <ConfirmModal
        isOpen={!!restoreId}
        onClose={() => setRestoreId(null)}
        onConfirm={() => restoreId && handleRestore(restoreId)}
        title="恢复备份"
        description={`将使用备份 ${selectedBackupForRestore?.name || ''} 覆盖当前系统数据，是否继续？`}
        confirmText="恢复"
        cancelText="取消"
      />
    </LoadingOverlay>
  )
}
