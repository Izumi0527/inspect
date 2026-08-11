/**
 * 日志中心 Hooks
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { toast } from 'react-hot-toast'
import * as logsApi from '../api/logsApi'
import type {
  DeviceLog,
  LogStatistics,
  LogQueryParams,
  LogFilters
} from '../types'

interface RequestOptions {
  showToast?: boolean
}

/** 从 unknown 错误对象提取展示消息（catch 参数不使用 any） */
const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback

/**
 * 日志列表 Hook
 */
export function useLogs(params: LogQueryParams = {}) {
  const [logs, setLogs] = useState<DeviceLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0
  })

  const loadLogs = useCallback(async (options: RequestOptions = {}) => {
    const { showToast = true } = options
    setLoading(true)
    setError(null)
    try {
      const response = params.device_id
        ? await logsApi.getDeviceLogs(params.device_id, params)
        : await logsApi.getAllLogs(params)
      
      // 安全地访问响应数据
      const items = response?.items || []
      setLogs(items)
      setPagination({
        page: response?.page || params.page || 1,
        pageSize: response?.page_size || params.page_size || 20,
        total: response?.total || 0
      })
      return true
    } catch (err) {
      const message = errorMessage(err, '加载日志失败')
      setError(message)
      if (showToast) {
        toast.error(message)
      }
      return false
    } finally {
      setLoading(false)
    }
  }, [params])

  useEffect(() => {
    void loadLogs()
  }, [loadLogs])

  const deleteLog = useCallback(async (logId: number, options: RequestOptions = {}) => {
    const { showToast = true } = options
    try {
      await logsApi.deleteLog(logId)
      if (showToast) {
        toast.success('日志删除成功')
      }
      await loadLogs({ showToast: false })
      return true
    } catch (err) {
      if (showToast) {
        toast.error(errorMessage(err, '删除日志失败'))
      }
      return false
    }
  }, [loadLogs])

  const batchDeleteLogs = useCallback(async (logIds: number[], options: RequestOptions = {}) => {
    const { showToast = true } = options
    try {
      const result = await logsApi.batchDeleteLogs(logIds)
      if (showToast) {
        toast.success(`成功删除 ${result.deleted_count} 条日志`)
      }
      await loadLogs({ showToast: false })
      return true
    } catch (err) {
      if (showToast) {
        toast.error(errorMessage(err, '批量删除日志失败'))
      }
      return false
    }
  }, [loadLogs])

  return {
    logs,
    loading,
    error,
    pagination,
    loadLogs,
    deleteLog,
    batchDeleteLogs
  }
}

/**
 * 日志统计 Hook
 */
export function useLogStats(hours: number = 24) {
  const [stats, setStats] = useState<LogStatistics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await logsApi.getLogStatistics(hours)
      setStats(data)
      return true
    } catch (err) {
      const message = errorMessage(err, '加载日志统计失败')
      setError(message)
      // 不显示toast，避免频繁提示
      return false
    } finally {
      setLoading(false)
    }
  }, [hours])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  return {
    stats,
    loading,
    error,
    refresh: loadStats
  }
}

/**
 * 日志过滤器 Hook
 */
export function useLogFilters() {
  const [filters, setFilters] = useState<LogFilters>({
    searchQuery: '',
    levelFilter: 'all',
    facilityFilter: 'all',
    sourceFilter: 'all'
  })

  // 搜索防抖：避免每次按键都触发后端请求
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null)

  const updateFilter = useCallback(<K extends keyof LogFilters>(
    key: K,
    value: LogFilters[K]
  ) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }, [])

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)

    const value = (filters.searchQuery || '').trim()
    if (!value) {
      setDebouncedSearchQuery('')
      return
    }

    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearchQuery(value)
    }, 350)

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [filters.searchQuery])

  // 转换为API查询参数
  const queryParams = useMemo((): LogQueryParams => {
    const params: LogQueryParams = {}
    
    if (debouncedSearchQuery) {
      params.search = debouncedSearchQuery
    }
    if (filters.levelFilter !== 'all') {
      params.level = filters.levelFilter
    }
    if (filters.facilityFilter !== 'all') {
      params.facility = filters.facilityFilter
    }
    if (filters.sourceFilter !== 'all') {
      params.source = filters.sourceFilter
    }
    if (filters.deviceId) {
      params.device_id = filters.deviceId
    }
    if (filters.dateRange?.start) {
      params.start_time = filters.dateRange.start
    }
    if (filters.dateRange?.end) {
      params.end_time = filters.dateRange.end
    }
    
    return params
  }, [
    debouncedSearchQuery,
    filters.levelFilter,
    filters.facilityFilter,
    filters.sourceFilter,
    filters.deviceId,
    filters.dateRange,
  ])

  return {
    filters,
    updateFilter,
    queryParams
  }
}

/**
 * 日志采集 Hook
 */
export function useLogCollection() {
  const [collecting, setCollecting] = useState(false)
  const [progress, setProgress] = useState<Record<number, 'pending' | 'collecting' | 'done' | 'error'>>({})

  const collectLogs = useCallback(async (
    deviceId: number,
    options: { logType?: string; maxEntries?: number } = {}
  ) => {
    setCollecting(true)
    setProgress(prev => ({ ...prev, [deviceId]: 'collecting' }))
    
    try {
      const result = await logsApi.collectDeviceLogs(deviceId, {
        device_id: deviceId,
        log_type: options.logType || 'system',
        max_entries: options.maxEntries,
      })

      if (result.success) {
        setProgress(prev => ({ ...prev, [deviceId]: 'done' }))
        toast.success(result.message || `采集完成，获取 ${result.collected_count} 条日志`)
      } else {
        setProgress(prev => ({ ...prev, [deviceId]: 'error' }))
        toast.error(result.message || '日志采集失败')
      }
      return result
    } catch (err) {
      const message = errorMessage(err, '日志采集失败')
      setProgress(prev => ({ ...prev, [deviceId]: 'error' }))
      toast.error(message)
      return {
        success: false,
        message,
        collected_count: 0,
        device_id: deviceId,
        failed: { [deviceId]: message },
      }
    } finally {
      setCollecting(false)
    }
  }, [])

  const batchCollect = useCallback(async (
    deviceIds: number[],
    options: { logType?: string; maxEntries?: number; maxConcurrent?: number } = {}
  ) => {
    setCollecting(true)
    deviceIds.forEach(id => {
      setProgress(prev => ({ ...prev, [id]: 'pending' }))
    })
    
    try {
      const result = await logsApi.batchCollectLogs(deviceIds, {
        logType: options.logType || 'system',
        maxEntries: options.maxEntries,
        maxConcurrent: options.maxConcurrent,
      })

      const failedIds = new Set<number>(
        result.failed ? Object.keys(result.failed).map(value => Number(value)) : []
      )
      const markAllError = failedIds.size === 0 && !result.success

      deviceIds.forEach(id => {
        setProgress(prev => ({ ...prev, [id]: markAllError || failedIds.has(id) ? 'error' : 'done' }))
      })

      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.message || '批量采集失败')
      }
      return result
    } catch (err) {
      const message = errorMessage(err, '批量采集失败')
      deviceIds.forEach(id => {
        setProgress(prev => ({ ...prev, [id]: 'error' }))
      })
      toast.error(message)

      const failed: Record<number, string> = {}
      deviceIds.forEach(id => {
        failed[id] = message
      })
      return {
        success: false,
        message,
        collected_count: 0,
        device_id: 0,
        failed,
      }
    } finally {
      setCollecting(false)
    }
  }, [])

  return {
    collecting,
    progress,
    collectLogs,
    batchCollect
  }
}

/**
 * 日志选择 Hook
 */
export function useLogSelection() {
  const [selectedLogs, setSelectedLogs] = useState<number[]>([])

  const toggleLog = useCallback((logId: number) => {
    setSelectedLogs(prev =>
      prev.includes(logId)
        ? prev.filter(id => id !== logId)
        : [...prev, logId]
    )
  }, [])

  const selectAll = useCallback((logIds: number[]) => {
    setSelectedLogs(logIds)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedLogs([])
  }, [])

  const isSelected = useCallback((logId: number) => {
    return selectedLogs.includes(logId)
  }, [selectedLogs])

  return {
    selectedLogs,
    toggleLog,
    selectAll,
    clearSelection,
    isSelected
  }
}

/**
 * 最近日志 Hook
 */
export function useRecentLogs(hours: number = 24, limit: number = 50) {
  const [logs, setLogs] = useState<DeviceLog[]>([])
  const [loading, setLoading] = useState(false)

  const loadRecentLogs = useCallback(async () => {
    setLoading(true)
    try {
      const data = await logsApi.getRecentLogs(hours, limit)
      setLogs(data)
    } catch (err) {
      // 静默处理错误
      console.error('加载最近日志失败:', err)
    } finally {
      setLoading(false)
    }
  }, [hours, limit])

  useEffect(() => {
    loadRecentLogs()
  }, [loadRecentLogs])

  return {
    logs,
    loading,
    refresh: loadRecentLogs
  }
}
