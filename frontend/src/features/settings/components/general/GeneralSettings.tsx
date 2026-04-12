'use client'

import { useGeneralSettings } from '../../hooks/useGeneralSettings'
import { BasicInfoSection } from './BasicInfoSection'
import { GeneralOverviewCard } from './GeneralOverviewCard'
import { InspectionConfigSection } from './InspectionConfigSection'
import { ReportConfigSection } from './ReportConfigSection'
import { UserPreferenceSection } from './UserPreferenceSection'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useCallback } from 'react'
import { useSettingsTabCapabilities } from '@/features/settings/hooks/useSettingsTabCapabilities'

export function GeneralSettings() {
  const {
    basicInfo,
    inspectionConfig,
    reportConfig,
    userPreference,
    isLoading,
    isSaving,
    isDirty,
    error,
    updateBasicInfo,
    updateInspectionConfig,
    updateReportConfig,
    updateUserPreference,
    saveAll,
    resetAll,
  } = useGeneralSettings()

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

  useSettingsTabCapabilities('general', {
    dirty: isDirty,
    saving: isSaving,
    blockLeave: Boolean(isDirty),
  })

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
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
      <GeneralOverviewCard
        applicationName={basicInfo.applicationName}
        timezone={basicInfo.timezone}
        maxConcurrentTasks={inspectionConfig.maxConcurrentTasks}
        defaultTimeout={inspectionConfig.defaultTimeout}
        defaultFormat={reportConfig.defaultFormat}
        theme={userPreference.theme}
        language={userPreference.language}
      />

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
        <div className="space-y-4">
          <BasicInfoSection
            data={basicInfo}
            onChange={updateBasicInfo}
            actions={{
              isDirty,
              isSaving,
              onSave: handleSave,
              onReset: handleReset,
            }}
          />
          <InspectionConfigSection data={inspectionConfig} onChange={updateInspectionConfig} />
        </div>

        <div className="space-y-4">
          <ReportConfigSection data={reportConfig} onChange={updateReportConfig} />
          <UserPreferenceSection data={userPreference} onChange={updateUserPreference} />
        </div>
      </div>
    </div>
  )
}
