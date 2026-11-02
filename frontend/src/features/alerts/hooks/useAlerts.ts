import { useState, useEffect, useCallback, useMemo } from 'react'
import { useExcludeKeywords } from '@/hooks/useExcludeKeywords'
import {
  Alert,
  AlertFilters,
  AlertStats,
  AlertQueryParams,
  AlertSeverity,
  AlertStatus,
  AlertAction,
  DEFAULT_ALERT_FILTERS,
} from '../types'
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination'
import {
  fetchAlerts,
  fetchAlertStats,
  acknowledgeAlert,
  resolveAlert,
  bulkAlertAction,
  deleteAlert,
} from '../api/alerts.api'

// 告警数据管理hook
export function useAlerts(queryParams: AlertQueryParams = {}) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
    hasNext: false,
    hasPrev: false,
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
        hasPrev: response.hasPrev,
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载告警数据失败'
      setError(errorMessage)
      setAlerts([]) // 错误时清空列表，而非显示假数据
      setPagination({
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        total: 0,
        hasNext: false,
        hasPrev: false,
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

  // 批量操作告警
  const performBulkAction = useCallback(async (
    action: AlertAction,
    target?: string[] | {
      alertIds?: string[]
      selectAllFiltered?: boolean
      excludeIds?: string[]
      filters?: AlertQueryParams
      assignee?: string
      comment?: string
    },
    legacyAssignee?: string
  ) => {
    try {
      setLoading(true)
      let alertIds: string[] | undefined
      let selectAllFiltered: boolean | undefined
      let excludeIds: string[] | undefined
      let status: string | undefined
      let severity: string | undefined
      let search: string | undefined
      let excludeSearch: string | undefined
      let startDate: string | undefined
      let endDate: string | undefined
      let assignee: string | undefined
      let comment: string | undefined

      if (Array.isArray(target)) {
        alertIds = target
        assignee = legacyAssignee
      } else if (target) {
        alertIds = target.alertIds
        selectAllFiltered = target.selectAllFiltered
        excludeIds = target.excludeIds
        assignee = target.assignee
        comment = target.comment
        if (target.filters) {
          if (target.filters.status) {
            status = Array.isArray(target.filters.status)
              ? target.filters.status.join(',')
              : String(target.filters.status)
          }
          if (target.filters.severity) {
            severity = Array.isArray(target.filters.severity)
              ? target.filters.severity.join(',')
              : String(target.filters.severity)
          }
          search = target.filters.search
          excludeSearch = target.filters.excludeSearch
          startDate = target.filters.startDate
          endDate = target.filters.endDate
        }
      }

      const res = await bulkAlertAction({
        action,
        alertIds,
        selectAllFiltered,
        excludeIds,
        status,
        severity,
        search,
        excludeSearch,
        startDate,
        endDate,
        assignee,
        comment,
      })
      await loadAlerts()
      return res
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '批量操作失败'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [loadAlerts])

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
    handleDeleteAlert,
    performBulkAction,
  }
}

// 告警统计hook。excludeSearch 与列表同口径，避免列表被屏蔽后统计卡仍显示噪声数量。
export function useAlertStats(excludeSearch?: string) {
  const [stats, setStats] = useState<AlertStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const alertStats = await fetchAlertStats({ excludeSearch })
      setStats(alertStats)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载统计数据失败')
    } finally {
      setLoading(false)
    }
  }, [excludeSearch])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  return {
    stats,
    loading,
    error,
    loadStats,
  }
}

// 告警筛选hook
//
// 屏蔽关键字是「视图偏好」而非「筛选」：持久化到 localStorage、输入防抖，并且 resetFilters 不清它
// （用户清空筛选是为了换查看条件，不是要重新被噪声淹没）。
export const ALERT_EXCLUDE_KEYWORDS_STORAGE_KEY = 'alert_exclude_keywords'

export function useAlertFilters() {
  const [filters, setFilters] = useState<AlertFilters>({ ...DEFAULT_ALERT_FILTERS })
  const exclude = useExcludeKeywords(ALERT_EXCLUDE_KEYWORDS_STORAGE_KEY)

  const updateFilter = useCallback((key: keyof AlertFilters, value: string) => {
    if (key === 'excludeQuery') {
      exclude.setExcludeQuery(value)
      return
    }
    setFilters(prev => ({ ...prev, [key]: value }))
  }, [exclude])

  const resetFilters = useCallback(() => {
    setFilters({ ...DEFAULT_ALERT_FILTERS })
  }, [])

  const mergedFilters = useMemo(
    () => ({ ...filters, excludeQuery: exclude.excludeQuery }),
    [filters, exclude.excludeQuery],
  )

  return {
    filters: mergedFilters,
    updateFilter,
    resetFilters,
    debouncedExcludeQuery: exclude.debouncedExcludeQuery,
    excludeKeywords: exclude.excludeKeywords,
  }
}

// 告警样式工具hook
//
// 精密仪器方向：状态色全部走语义令牌（soft 底 + on-soft 文字，浅深两套成对）。
// 旧实现返回硬编码浅色粉彩且无 dark: 变体，深色主题下对比度曾低至 1.02:1（P0）。
export function useAlertStyles() {
  const getSeverityColor = useCallback((severity: AlertSeverity) => {
    switch (severity) {
      case 'critical':
        return 'bg-danger-soft text-danger-soft-foreground'
      case 'warning':
        return 'bg-warning-soft text-warning-soft-foreground'
      case 'info':
        return 'bg-info-soft text-info-soft-foreground'
    }
  }, [])

  const getStatusColor = useCallback((status: AlertStatus) => {
    switch (status) {
      case 'active':
        return 'bg-danger-soft text-danger-soft-foreground'
      case 'acknowledged':
        return 'bg-warning-soft text-warning-soft-foreground'
      case 'resolved':
        return 'bg-success-soft text-success-soft-foreground'
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
    getStatusText,
  }
}
