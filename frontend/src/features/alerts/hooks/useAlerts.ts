import { useState, useEffect, useCallback } from 'react'
import { Alert, AlertFilters, AlertStats, AlertQueryParams, AlertSeverity, AlertStatus, AlertAction } from '../types'
import { 
  fetchAlerts, 
  fetchAlertStats, 
  acknowledgeAlert, 
  resolveAlert, 
  bulkAlertAction,
  deleteAlert 
} from '../api/alerts.api'

// 告警数据管理hook
export function useAlerts(queryParams: AlertQueryParams = {}) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    hasNext: false,
    hasPrev: false
  })

  const loadAlerts = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetchAlerts(queryParams)
      setAlerts(response.alerts)
      setPagination({
        page: response.page,
        pageSize: response.pageSize,
        total: response.total,
        hasNext: response.hasNext,
        hasPrev: response.hasPrev
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载告警数据失败'
      setError(errorMessage)
      setAlerts([])  // 错误时清空列表，而非显示假数据
      setPagination({
        page: 1,
        pageSize: 10,
        total: 0,
        hasNext: false,
        hasPrev: false
      })
      console.error('Failed to load alerts:', err)
    } finally {
      setLoading(false)
    }
  }, [queryParams])

  // 确认告警
  const handleAcknowledgeAlert = useCallback(async (id: string, assignee?: string) => {
    try {
      await acknowledgeAlert(id, assignee)
    } catch (err) {
      setError(err instanceof Error ? err.message : '确认告警失败')
    }
  }, [])

  // 解决告警
  const handleResolveAlert = useCallback(async (id: string, comment?: string) => {
    try {
      await resolveAlert(id, comment)
    } catch (err) {
      setError(err instanceof Error ? err.message : '解决告警失败')
    }
  }, [])

  // 删除告警
  const handleDeleteAlert = useCallback(async (id: string) => {
    try {
      await deleteAlert(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除告警失败')
    }
  }, [])

  // 初始加载
  useEffect(() => {
    loadAlerts()
  }, [loadAlerts])

  return {
    alerts,
    loading,
    error,
    pagination,
    loadAlerts,
    handleAcknowledgeAlert,
    handleResolveAlert,
    handleDeleteAlert
  }
}

// 告警统计hook
export function useAlertStats() {
  const [stats, setStats] = useState<AlertStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const alertStats = await fetchAlertStats()
      setStats(alertStats)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载统计数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  return {
    stats,
    loading,
    error,
    loadStats
  }
}

// 告警筛选hook
export function useAlertFilters() {
  const [filters, setFilters] = useState<AlertFilters>({
    searchQuery: '',
    severityFilter: 'all',
    statusFilter: 'all'
  })

  const updateFilter = useCallback((key: keyof AlertFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }, [])

  const resetFilters = useCallback(() => {
    setFilters({
      searchQuery: '',
      severityFilter: 'all',
      statusFilter: 'all'
    })
  }, [])

  return {
    filters,
    updateFilter,
    resetFilters
  }
}

// 告警选择hook
export function useAlertSelection() {
  const [selectedAlerts, setSelectedAlerts] = useState<string[]>([])

  const selectAlert = useCallback((alertId: string) => {
    setSelectedAlerts(prev => [...prev, alertId])
  }, [])

  const deselectAlert = useCallback((alertId: string) => {
    setSelectedAlerts(prev => prev.filter(id => id !== alertId))
  }, [])

  const toggleAlert = useCallback((alertId: string) => {
    setSelectedAlerts(prev =>
      prev.includes(alertId)
        ? prev.filter(id => id !== alertId)
        : [...prev, alertId]
    )
  }, [])

  const selectAll = useCallback((alertIds: string[]) => {
    setSelectedAlerts(alertIds)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedAlerts([])
  }, [])

  const handleBulkAction = useCallback(async (action: AlertAction, assignee?: string) => {
    if (selectedAlerts.length === 0) return

    try {
      await bulkAlertAction({
        alertIds: selectedAlerts,
        action,
        assignee
      })
      setSelectedAlerts([])
    } catch (error) {
      console.error('批量操作失败:', error)
      throw error
    }
  }, [selectedAlerts])

  return {
    selectedAlerts,
    selectAlert,
    deselectAlert,
    toggleAlert,
    selectAll,
    clearSelection,
    handleBulkAction,
    setSelectedAlerts
  }
}

// 告警样式工具hook
export function useAlertStyles() {
  const getSeverityColor = useCallback((severity: AlertSeverity) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'info':
        return 'bg-blue-100 text-blue-800 border-blue-200'
    }
  }, [])

  const getStatusColor = useCallback((status: AlertStatus) => {
    switch (status) {
      case 'active':
        return 'bg-red-100 text-red-800'
      case 'acknowledged':
        return 'bg-yellow-100 text-yellow-800'
      case 'resolved':
        return 'bg-green-100 text-green-800'
    }
  }, [])

  const getStatusText = useCallback((status: AlertStatus) => {
    switch (status) {
      case 'active':
        return '活跃'
      case 'acknowledged':
        return '已确认'
      case 'resolved':
        return '已解决'
    }
  }, [])

  return {
    getSeverityColor,
    getStatusColor,
    getStatusText
  }
}
