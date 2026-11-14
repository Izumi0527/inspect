'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { MAX_EXCLUDE_KEYWORDS, splitExcludeKeywords } from '@/utils/excludeKeywords'
import { DATETIME_DISPLAY_PREFERENCES_QUERY_KEY } from '@/hooks/useDatetimePreferencesSync'
import { filterRulesApi, type FilterRulesSettingsData } from '../api/filter.api'

function mergeKeywordsWithPending(
  current: string[],
  rawPending?: string,
): { merged: string[]; exceeded: boolean } {
  const parsed = splitExcludeKeywords(rawPending ?? '')
  if (parsed.length === 0) {
    return { merged: current, exceeded: false }
  }
  const existing = new Set(current.map((k) => k.toLowerCase()))
  const toAdd: string[] = []
  for (const kw of parsed) {
    if (!existing.has(kw.toLowerCase())) {
      existing.add(kw.toLowerCase())
      toAdd.push(kw)
    }
  }
  if (current.length + toAdd.length > MAX_EXCLUDE_KEYWORDS) {
    return { merged: current, exceeded: true }
  }
  return { merged: [...current, ...toAdd], exceeded: false }
}

export function useFilterRulesSettings() {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery<FilterRulesSettingsData>({
    queryKey: ['filterRulesSettings'],
    queryFn: filterRulesApi.getFilterRulesSettings,
    staleTime: 5 * 60 * 1000,
  })

  const [alertKeywords, setAlertKeywords] = useState<string[]>([])
  const [logKeywords, setLogKeywords] = useState<string[]>([])

  useEffect(() => {
    if (data) {
      setAlertKeywords(data.alertKeywords)
      setLogKeywords(data.logKeywords)
    }
  }, [data])

  const isDirty = useMemo(() => {
    if (!data) return false
    const alertSame =
      data.alertKeywords.length === alertKeywords.length &&
      data.alertKeywords.every((kw, idx) => kw === alertKeywords[idx])
    const logSame =
      data.logKeywords.length === logKeywords.length &&
      data.logKeywords.every((kw, idx) => kw === logKeywords[idx])
    return !alertSame || !logSame
  }, [data, alertKeywords, logKeywords])

  const saveMutation = useMutation({
    mutationFn: filterRulesApi.saveFilterRulesSettings,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['filterRulesSettings'] }),
        queryClient.invalidateQueries({ queryKey: DATETIME_DISPLAY_PREFERENCES_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ['alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['logs'] }),
      ])
    },
  })

  const addAlertKeywords = useCallback((rawInput: string): boolean => {
    const parsed = splitExcludeKeywords(rawInput)
    if (parsed.length === 0) return false

    const existing = new Set(alertKeywords.map((k) => k.toLowerCase()))
    const toAdd: string[] = []
    for (const kw of parsed) {
      if (!existing.has(kw.toLowerCase())) {
        existing.add(kw.toLowerCase())
        toAdd.push(kw)
      }
    }

    if (toAdd.length === 0) {
      return false
    }

    if (alertKeywords.length + toAdd.length > MAX_EXCLUDE_KEYWORDS) {
      toast.error(`最多可配置 ${MAX_EXCLUDE_KEYWORDS} 个屏蔽关键字`)
      return false
    }

    setAlertKeywords((prev) => [...prev, ...toAdd])
    return true
  }, [alertKeywords])

  const removeAlertKeyword = useCallback((keyword: string) => {
    const target = keyword.trim().toLowerCase()
    setAlertKeywords((prev) => prev.filter((item) => item.toLowerCase() !== target))
  }, [])

  const clearAlertKeywords = useCallback(() => {
    setAlertKeywords([])
  }, [])

  const addLogKeywords = useCallback((rawInput: string): boolean => {
    const parsed = splitExcludeKeywords(rawInput)
    if (parsed.length === 0) return false

    const existing = new Set(logKeywords.map((k) => k.toLowerCase()))
    const toAdd: string[] = []
    for (const kw of parsed) {
      if (!existing.has(kw.toLowerCase())) {
        existing.add(kw.toLowerCase())
        toAdd.push(kw)
      }
    }

    if (toAdd.length === 0) {
      return false
    }

    if (logKeywords.length + toAdd.length > MAX_EXCLUDE_KEYWORDS) {
      toast.error(`最多可配置 ${MAX_EXCLUDE_KEYWORDS} 个屏蔽关键字`)
      return false
    }

    setLogKeywords((prev) => [...prev, ...toAdd])
    return true
  }, [logKeywords])

  const removeLogKeyword = useCallback((keyword: string) => {
    const target = keyword.trim().toLowerCase()
    setLogKeywords((prev) => prev.filter((item) => item.toLowerCase() !== target))
  }, [])

  const clearLogKeywords = useCallback(() => {
    setLogKeywords([])
  }, [])

  const saveAll = useCallback(
    async (pending?: { alertInput?: string; logInput?: string }): Promise<boolean> => {
      const alertMerge = mergeKeywordsWithPending(alertKeywords, pending?.alertInput)
      const logMerge = mergeKeywordsWithPending(logKeywords, pending?.logInput)
      if (alertMerge.exceeded || logMerge.exceeded) {
        toast.error(`最多可配置 ${MAX_EXCLUDE_KEYWORDS} 个屏蔽关键字`)
        return false
      }
      setAlertKeywords(alertMerge.merged)
      setLogKeywords(logMerge.merged)
      await saveMutation.mutateAsync({
        alertKeywords: alertMerge.merged,
        logKeywords: logMerge.merged,
      })
      return true
    },
    [alertKeywords, logKeywords, saveMutation],
  )

  const resetAll = useCallback(() => {
    if (data) {
      setAlertKeywords(data.alertKeywords)
      setLogKeywords(data.logKeywords)
    }
  }, [data])

  return {
    alertKeywords,
    logKeywords,
    isLoading,
    isSaving: saveMutation.isPending,
    isDirty,
    error,
    addAlertKeywords,
    removeAlertKeyword,
    clearAlertKeywords,
    addLogKeywords,
    removeLogKeyword,
    clearLogKeywords,
    saveAll,
    resetAll,
  }
}
