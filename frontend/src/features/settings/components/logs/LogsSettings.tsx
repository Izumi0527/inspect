'use client'

import React from 'react'
import { AlertCircle, Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { ActionButtons } from '@/features/settings/components/shared/ActionButtons'
import { logsSettingsApi } from '@/features/settings/api/logs.api'
import { useLogsSettings } from '@/features/settings/hooks/useLogsSettings'

export const LogsSettings: React.FC = () => {
  const {
    retentionDays,
    autoCleanupEnabled,
    isLoading,
    isSaving,
    isDirty,
    error,
    updateRetentionDays,
    updateAutoCleanupEnabled,
    saveAll,
    resetAll,
  } = useLogsSettings()

  const normalizeRetentionDays = (value: number) => {
    const raw = Number.isFinite(value) ? value : 90
    const floored = Math.floor(raw)
    if (floored < 1) return 1
    if (floored > 3650) return 3650
    return floored
  }

  const handleSave = async () => {
    try {
      const normalizedRetention = normalizeRetentionDays(retentionDays)
      await saveAll({ retentionDays: normalizedRetention })
      toast.success('保存成功！日志设置已更新')
    } catch (err) {
      toast.error('保存失败：' + (err as Error).message)
    }
  }

  const handleReset = () => {
    resetAll()
    toast.success('已重置为服务器配置')
  }

  const handleCleanup = async () => {
    const normalizedRetention = normalizeRetentionDays(retentionDays)

    const confirmed = window.confirm(
      `将清理创建时间早于 ${normalizedRetention} 天的设备日志。\n\n此操作不可撤销，是否继续？`
    )
    if (!confirmed) return

    try {
      const resp = await logsSettingsApi.cleanupDeviceLogs({ retentionDays: normalizedRetention })
      toast.success(`已清理 ${resp.deletedCount} 条设备日志`)
    } catch (err) {
      toast.error('清理失败：' + (err as Error).message)
    }
  }

  if (isLoading) {
    return (
      <div>
        <ActionButtons />
        <div className="space-y-4 p-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <ActionButtons />
        <div className="p-6">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 flex items-start space-x-4">
            <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">
                加载日志设置失败
              </h3>
              <p className="text-sm text-red-700 dark:text-red-300">
                {(error as Error).message || '无法连接到服务器，请检查网络连接或稍后重试'}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <ActionButtons
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSave}
        onReset={handleReset}
        extraActions={[
          {
            label: '立即清理',
            variant: 'destructive',
            icon: <Trash2 className="w-4 h-4 mr-2" />,
            onClick: handleCleanup,
          },
        ]}
      />

      <div className="p-4">
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          <section className="py-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">数据保留</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                配置设备日志的自动清理策略。该配置将影响系统定时数据清理任务中的日志清理行为。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="logs-auto-cleanup">启用自动清理</Label>
                  <Switch
                    id="logs-auto-cleanup"
                    checked={autoCleanupEnabled}
                    onCheckedChange={(value) => updateAutoCleanupEnabled(Boolean(value))}
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  关闭后系统不会自动清理历史设备日志。
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="logs-retention-days">设备日志保留天数</Label>
                <Input
                  id="logs-retention-days"
                  type="number"
                  min={1}
                  max={3650}
                  value={retentionDays}
                  onChange={(e) => updateRetentionDays(Number(e.target.value))}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  超过该天数的设备日志将被清理。范围 1 到 3650。
                </p>
              </div>
            </div>
          </section>

          <section className="py-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">手动清理</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                可立即清理超过保留天数的设备日志，用于空间回收或应急处理。
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="destructive" onClick={handleCleanup} disabled={isSaving}>
                <Trash2 className="w-4 h-4 mr-2" />
                立即清理超过保留天数的设备日志
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
