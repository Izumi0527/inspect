import { useState, useCallback } from 'react'
import { SystemConfig } from '../types'

export const useSettingsFilters = () => {
  const [filters, setFilters] = useState({
    userRole: 'all' as 'all' | string,
    userStatus: 'all' as 'all' | 'active' | 'inactive' | 'locked' | 'pending',
    logAction: 'all' as 'all' | string,
    logStatus: 'all' as 'all' | 'success' | 'failed' | 'error',
    dateRange: {
      start: '',
      end: '',
    },
    searchText: '',
  })

  const updateFilter = useCallback((key: string, value: unknown) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
    }))
  }, [])

  const resetFilters = useCallback(() => {
    setFilters({
      userRole: 'all',
      userStatus: 'all',
      logAction: 'all',
      logStatus: 'all',
      dateRange: { start: '', end: '' },
      searchText: '',
    })
  }, [])

  return {
    filters,
    updateFilter,
    resetFilters,
  }
}

export const useSettingsEditor = () => {
  const [editingConfig, setEditingConfig] = useState<string | null>(null)
  const [pendingChanges, setPendingChanges] = useState<Record<string, SystemConfig['value'] | undefined>>({})

  const startEditing = useCallback((configKey: string) => {
    setEditingConfig(configKey)
  }, [])

  const stopEditing = useCallback(() => {
    setEditingConfig(null)
    setPendingChanges({})
  }, [])

  const updatePendingChange = useCallback((key: string, value: SystemConfig['value'] | undefined) => {
    setPendingChanges(prev => ({
      ...prev,
      [key]: value,
    }))
  }, [])

  const hasPendingChanges = Object.keys(pendingChanges).length > 0

  return {
    editingConfig,
    pendingChanges,
    hasPendingChanges,
    startEditing,
    stopEditing,
    updatePendingChange,
  }
}