'use client'

import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { logsSettingsApi } from '../api/logs.api'

export function useLogsSettings() {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['logsSettings'],
    queryFn: logsSettingsApi.getLogsSettings,
    staleTime: 5 * 60 * 1000,
  })

  const [retentionDays, setRetentionDays] = useState<number>(90)
  const [autoCleanupEnabled, setAutoCleanupEnabled] = useState<boolean>(true)
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    if (!data) return
    setRetentionDays(data.retentionDays)
    setAutoCleanupEnabled(data.autoCleanupEnabled)
    setIsDirty(false)
  }, [data])

  const saveMutation = useMutation({
    mutationFn: logsSettingsApi.saveLogsSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logsSettings'] })
      setIsDirty(false)
    },
  })

  const updateRetentionDays = useCallback((value: number) => {
    setRetentionDays(value)
    setIsDirty(true)
  }, [])

  const updateAutoCleanupEnabled = useCallback((value: boolean) => {
    setAutoCleanupEnabled(value)
    setIsDirty(true)
  }, [])

  const saveAll = useCallback(
    async (overrides?: Partial<{ retentionDays: number; autoCleanupEnabled: boolean }>) => {
      await saveMutation.mutateAsync({
        retentionDays: overrides?.retentionDays ?? retentionDays,
        autoCleanupEnabled: overrides?.autoCleanupEnabled ?? autoCleanupEnabled,
      })
    },
    [saveMutation, retentionDays, autoCleanupEnabled]
  )

  const resetAll = useCallback(() => {
    if (!data) return
    setRetentionDays(data.retentionDays)
    setAutoCleanupEnabled(data.autoCleanupEnabled)
    setIsDirty(false)
  }, [data])

  return {
    retentionDays,
    autoCleanupEnabled,
    isLoading,
    error,
    isDirty,
    isSaving: saveMutation.isPending,
    updateRetentionDays,
    updateAutoCleanupEnabled,
    saveAll,
    resetAll,
  }
}
