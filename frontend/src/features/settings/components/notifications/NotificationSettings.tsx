'use client'

import { useNotificationSettings } from '../../hooks/useNotificationSettings'
import { EmailNotificationSection } from './EmailNotificationSection'
import { SmsNotificationSection } from './SmsNotificationSection'
import { NotificationOverviewCard } from './NotificationOverviewCard'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useCallback } from 'react'
import { useSettingsTabCapabilities } from '@/features/settings/hooks/useSettingsTabCapabilities'

export function NotificationSettings() {
  const {
    emailNotification,
    smsNotification,
    isLoading,
    isSaving,
    isTesting,
    isDirty,
    error,
    updateEmailNotification,
    updateSmsNotification,
    saveAll,
    resetAll,
    testEmailNotification,
    testSmsNotification,
  } = useNotificationSettings()

  const handleSave = useCallback(async () => {
    try {
      await saveAll()
      toast.success('保存成功！配置已更新')
    } catch (err) {
      toast.error('保存失败：' + (err as Error).message)
    }
  }, [saveAll])

  const handleReset = useCallback(() => {
    resetAll()
    toast.success('已重置为服务器配置')
  }, [resetAll])

  useSettingsTabCapabilities('notifications', {
    dirty: isDirty,
    saving: isSaving,
    blockLeave: isDirty,
  })

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

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

  return (
    <div className="p-4">
      <NotificationOverviewCard
        emailEnabled={Boolean(emailNotification.enabled)}
        smsEnabled={Boolean(smsNotification.enabled)}
      />

      <div className="mt-4 grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <EmailNotificationSection
          data={emailNotification}
          onChange={updateEmailNotification}
          onTest={testEmailNotification}
          isTesting={isTesting}
          actions={{
            isDirty,
            isSaving,
            onSave: handleSave,
            onReset: handleReset,
          }}
        />

        <SmsNotificationSection
          data={smsNotification}
          onChange={updateSmsNotification}
          onTest={testSmsNotification}
          isTesting={isTesting}
        />
      </div>
    </div>
  )
}
