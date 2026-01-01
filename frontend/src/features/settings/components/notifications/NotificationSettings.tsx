'use client'

import { useNotificationSettings } from '../../hooks/useNotificationSettings'
import { ActionButtons } from '@/features/settings/components/shared/ActionButtons'
import { EmailNotificationSection } from './EmailNotificationSection'
import { SmsNotificationSection } from './SmsNotificationSection'
import { WebhookNotificationSection } from './WebhookNotificationSection'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useCallback } from 'react'

export function NotificationSettings() {
  const {
    emailNotification,
    smsNotification,
    webhookNotification,
    isLoading,
    isSaving,
    isTesting,
    isDirty,
    error,
    updateEmailNotification,
    updateSmsNotification,
    updateWebhookNotification,
    saveAll,
    resetAll,
    testEmailNotification,
    testSmsNotification,
    testWebhookNotification,
  } = useNotificationSettings()

  // 处理保存操作
  const handleSave = useCallback(async () => {
    try {
      await saveAll()
      toast.success('保存成功！配置已更新')
    } catch (err) {
      toast.error('保存失败：' + (err as Error).message)
    }
  }, [saveAll])

  // 处理重置操作
  const handleReset = useCallback(() => {
    resetAll()
    toast.success('已重置为服务器配置')
  }, [resetAll])

  // 加载状态
  if (isLoading) {
    return (
      <div>
        <ActionButtons />
        <div className="space-y-4 p-4">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    )
  }

  // 错误状态
  if (error) {
    return (
      <div>
        <ActionButtons />
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
      </div>
    )
  }

  // 正常显示
  return (
    <div>
      <ActionButtons
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSave}
        onReset={handleReset}
      />

      <div className="p-4">
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          <EmailNotificationSection
            data={emailNotification}
            onChange={updateEmailNotification}
            onTest={testEmailNotification}
            isTesting={isTesting}
          />
          <SmsNotificationSection
            data={smsNotification}
            onChange={updateSmsNotification}
            onTest={testSmsNotification}
            isTesting={isTesting}
          />
          <WebhookNotificationSection
            data={webhookNotification}
            onChange={updateWebhookNotification}
            onTest={testWebhookNotification}
            isTesting={isTesting}
          />
        </div>
      </div>
    </div>
  )
}
