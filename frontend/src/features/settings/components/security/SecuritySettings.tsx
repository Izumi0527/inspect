'use client'

import { useSecuritySettings } from '../../hooks/useSecuritySettings'
import { SessionManagementSection } from './SessionManagementSection'
import { PasswordPolicySection } from './PasswordPolicySection'
import { AuthenticationSection } from './AuthenticationSection'
import { SecurityOverviewCard } from './SecurityOverviewCard'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useCallback } from 'react'
import { useSettingsTabCapabilities } from '@/features/settings/hooks/useSettingsTabCapabilities'

export function SecuritySettings() {
  const {
    sessionManagement,
    passwordPolicy,
    authentication,
    isLoading,
    isSaving,
    isDirty,
    error,
    updateSessionManagement,
    updatePasswordPolicy,
    updateAuthentication,
    saveAll,
    resetAll,
  } = useSecuritySettings()

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

  useSettingsTabCapabilities('security', {
    dirty: isDirty,
    saving: isSaving,
    blockLeave: isDirty,
  })

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-96 w-full" />
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
      <SecurityOverviewCard
        minLength={passwordPolicy.minLength}
        requireUppercase={passwordPolicy.requireUppercase}
        requireLowercase={passwordPolicy.requireLowercase}
        requireNumbers={passwordPolicy.requireNumbers}
        requireSpecialChars={passwordPolicy.requireSpecialChars}
        mfaEnabled={authentication.mfaEnabled}
        mfaRequired={authentication.mfaRequired}
        ipWhitelistEnabled={authentication.ipWhitelistEnabled}
        ipWhitelistCount={authentication.ipWhitelist?.length ?? 0}
        maxConcurrentSessions={sessionManagement.maxConcurrentSessions}
      />

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
        <div className="space-y-4">
          <PasswordPolicySection
            data={passwordPolicy}
            onChange={updatePasswordPolicy}
            actions={{
              isDirty,
              isSaving,
              onSave: handleSave,
              onReset: handleReset,
            }}
          />
          <AuthenticationSection data={authentication} onChange={updateAuthentication} />
        </div>

        <div className="space-y-4">
          <SessionManagementSection data={sessionManagement} onChange={updateSessionManagement} />
        </div>
      </div>
    </div>
  )
}
