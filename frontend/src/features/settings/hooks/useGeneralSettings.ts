'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { generalApi } from '../api/general.api'
import type {
  BasicInfoConfig,
  InspectionConfig,
  ReportConfig,
  UserPreferenceConfig,
} from '../types/general.types'

export function useGeneralSettings() {
  const queryClient = useQueryClient()

  // 获取配置
  const { data, isLoading, error } = useQuery({
    queryKey: ['generalSettings'],
    queryFn: generalApi.getGeneralSettings,
    staleTime: 5 * 60 * 1000, // 5 分钟缓存
  })

  // 本地状态
  const [basicInfo, setBasicInfo] = useState<BasicInfoConfig>({
    applicationName: '',
    version: '',
    timezone: '',
  })
  const [inspectionConfig, setInspectionConfig] = useState<InspectionConfig>({
    maxConcurrentTasks: 10,
    defaultTimeout: 30,
    retryAttempts: 3,
  })
  const [reportConfig, setReportConfig] = useState<ReportConfig>({
    defaultFormat: 'excel',
    maxExportRecords: 10000,
  })
  const [userPreference, setUserPreference] = useState<UserPreferenceConfig>({
    theme: 'auto',
    language: 'zh-CN',
    dateFormat: 'YYYY-MM-DD',
    timeFormat: '24h',
  })
  const [isDirty, setIsDirty] = useState(false)

  // 同步服务端数据到本地状态
  useEffect(() => {
    if (data) {
      setBasicInfo(data.basicInfo)
      setInspectionConfig(data.inspectionConfig)
      setReportConfig(data.reportConfig)
      setUserPreference(data.userPreference)
      setIsDirty(false)
    }
  }, [data])

  // 保存所有配置
  const saveMutation = useMutation({
    mutationFn: generalApi.saveAll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generalSettings'] })
      setIsDirty(false)
    },
  })

  // 更新方法
  const updateBasicInfo = useCallback(<K extends keyof BasicInfoConfig>(field: K, value: BasicInfoConfig[K]) => {
    setBasicInfo((prev) => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }, [])

  const updateInspectionConfig = useCallback(<K extends keyof InspectionConfig>(field: K, value: InspectionConfig[K]) => {
    setInspectionConfig((prev) => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }, [])

  const updateReportConfig = useCallback(<K extends keyof ReportConfig>(field: K, value: ReportConfig[K]) => {
    setReportConfig((prev) => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }, [])

  const updateUserPreference = useCallback(<K extends keyof UserPreferenceConfig>(field: K, value: UserPreferenceConfig[K]) => {
    setUserPreference((prev) => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }, [])

  // 保存所有
  const saveAll = useCallback(async () => {
    await saveMutation.mutateAsync({
      basicInfo,
      inspectionConfig,
      reportConfig,
      userPreference,
    })
  }, [basicInfo, inspectionConfig, reportConfig, userPreference, saveMutation])

  // 重置所有
  const resetAll = useCallback(() => {
    if (data) {
      setBasicInfo(data.basicInfo)
      setInspectionConfig(data.inspectionConfig)
      setReportConfig(data.reportConfig)
      setUserPreference(data.userPreference)
      setIsDirty(false)
    }
  }, [data])

  return {
    basicInfo,
    inspectionConfig,
    reportConfig,
    userPreference,
    isLoading,
    isSaving: saveMutation.isPending,
    isDirty,
    error,
    updateBasicInfo,
    updateInspectionConfig,
    updateReportConfig,
    updateUserPreference,
    saveAll,
    resetAll,
  }
}
