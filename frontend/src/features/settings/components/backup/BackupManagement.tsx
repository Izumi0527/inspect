'use client'

import { useBackupManagement } from '../../hooks/useBackupManagement'
import { BackupConfigSection } from './BackupConfigSection'
import { BackupHistorySection } from './BackupHistorySection'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle, RotateCcw, Save } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useCallback, useMemo } from 'react'
import { useSettingsTabCapabilities } from '@/features/settings/hooks/useSettingsTabCapabilities'

export function BackupManagement() {
  const {
    config,
    backups,
    totalCount,
    diskUsage,
    isLoading,
    isSaving,
    isCreating,
    isRestoring,
    isDeleting,
    isDirty,
    error,
    updateConfig,
    saveAll,
    resetAll,
    createBackup,
    restoreBackup,
    deleteBackup,
    downloadBackup,
  } = useBackupManagement()

  // 处理保存操作
  const handleSave = useCallback(async () => {
    try {
      await saveAll()
      toast.success('保存成功！备份配置已更新')
    } catch (err) {
      toast.error('保存失败：' + (err as Error).message)
    }
  }, [saveAll])

  // 处理重置操作
  const handleReset = useCallback(() => {
    resetAll()
    toast.success('已重置为服务器配置')
  }, [resetAll])

  const isBusy = isSaving || isCreating || isRestoring || isDeleting
  const isActionDisabled = useMemo(() => !isDirty || isBusy, [isBusy, isDirty])

  const primaryActions = useMemo(
    () => [
      {
        key: 'save',
        label: '保存',
        icon: <Save className="w-4 h-4 mr-2" />,
        loading: isSaving,
        disabled: isActionDisabled,
        onClick: handleSave,
      },
    ],
    [handleSave, isActionDisabled, isSaving]
  )

  const secondaryActions = useMemo(
    () => [
      {
        key: 'reset',
        label: '重置',
        icon: <RotateCcw className="w-4 h-4 mr-2" />,
        disabled: isActionDisabled,
        onClick: handleReset,
      },
    ],
    [handleReset, isActionDisabled]
  )

  useSettingsTabCapabilities('backup', {
    dirty: isDirty,
    saving: isSaving,
    blockLeave: Boolean(isDirty || isRestoring),
    primaryActions,
    secondaryActions,
  })

  // 处理创建备份
  const handleCreateBackup = useCallback(async () => {
    await createBackup({
      includeDatabase: config.includeDatabase,
      includeFiles: false,
      description: '手动创建的备份',
    })
  }, [createBackup, config.includeDatabase])

  // 处理恢复备份
  const handleRestoreBackup = useCallback(
    async (backupId: string) => {
      await restoreBackup({
        backupId,
        restoreDatabase: false,
        restoreFiles: false,
      })
    },
    [restoreBackup]
  )

  // 加载状态
  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  // 错误状态
  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 flex items-start space-x-4">
          <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">
              加载配置失败
            </h3>
            <p className="text-sm text-red-700 dark:text-red-300">
              {(error as Error).message || '无法连接到服务器，请检查网络连接或稍后重试'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // 正常显示
  return (
    <div className="p-4">
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {/* 备份配置 */}
        <BackupConfigSection data={config} onChange={updateConfig} />

        {/* 备份历史 */}
        <BackupHistorySection
          backups={backups}
          totalCount={totalCount}
          diskUsage={diskUsage}
          isCreating={isCreating}
          isDeleting={isDeleting}
          onCreateBackup={handleCreateBackup}
          onDownloadBackup={downloadBackup}
          onRestoreBackup={handleRestoreBackup}
          onDeleteBackup={deleteBackup}
        />
      </div>

      {/* 恢复中的全局提示 */}
      {isRestoring && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-sm mx-4">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">正在恢复备份...</h3>
                <p className="text-sm text-muted-foreground mt-1">请勿关闭或刷新页面</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
