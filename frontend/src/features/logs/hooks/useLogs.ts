/**
 * 日志中心 Hooks
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import { toast } from 'react-hot-toast'
import * as logsApi from '../api/logsApi'
import type {
  DeviceLog,
  LogStatistics,
  LogQueryParams,
  LogFilters
} from '../types'

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

  const loadLogs = useCallback(async () => {
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
    } catch (err: any) {
      const message = err.message || '加载日志失败'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [params])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const deleteLog = useCallback(async (logId: number) => {
    try {
      await logsApi.deleteLog(logId)
      toast.success('日志删除成功')
      await loadLogs()
    } catch (err: any) {
      toast.error(err.message || '删除日志失败')
    }
  }, [loadLogs])

  const batchDeleteLogs = useCallback(async (logIds: number[]) => {
    try {
      const result = await logsApi.batchDeleteLogs(logIds)
      toast.success(`成功删除 ${result.deleted_count} 条日志`)
      await loadLogs()
    } catch (err: any) {
      toast.error(err.message || '批量删除日志失败')
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
    } catch (err: any) {
      const message = err.message || '加载日志统计失败'
      setError(message)
      // 不显示toast，避免频繁提示
    } finally {
      setLoading(false)
    }
  }, [hours])

  useEffect(() => {
    loadStats()
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

  const updateFilter = useCallback(<K extends keyof LogFilters>(
    key: K,
    value: LogFilters[K]
  ) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }, [])

  const resetFilters = useCallback(() => {
    setFilters({
      searchQuery: '',
      levelFilter: 'all',
      facilityFilter: 'all',
      sourceFilter: 'all'
    })
  }, [])

  // 转换为API查询参数
  const queryParams = useMemo((): LogQueryParams => {
    const params: LogQueryParams = {}
    
    if (filters.searchQuery) {
      params.search = filters.searchQuery
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
  }, [filters])

  return {
    filters,
    updateFilter,
    resetFilters,
    queryParams
  }
}

/**
 * 日志采集 Hook
 */
export function useLogCollection() {
  const [collecting, setCollecting] = useState(false)
  const [progress, setProgress] = useState<Record<number, 'pending' | 'collecting' | 'done' | 'error'>>({})

  const collectLogs = useCallback(async (deviceId: number, logType: string = 'system') => {
    setCollecting(true)
    setProgress(prev => ({ ...prev, [deviceId]: 'collecting' }))
    
    try {
      const result = await logsApi.collectDeviceLogs(deviceId, {
        device_id: deviceId,
        log_type: logType
      })
      
      setProgress(prev => ({ ...prev, [deviceId]: 'done' }))
      toast.success(`采集完成，获取 ${result.collected_count} 条日志`)
      return result
    } catch (err: any) {
      setProgress(prev => ({ ...prev, [deviceId]: 'error' }))
      toast.error(err.message || '日志采集失败')
      throw err
    } finally {
      setCollecting(false)
    }
  }, [])

  const batchCollect = useCallback(async (deviceIds: number[], logType: string = 'system') => {
    setCollecting(true)
    deviceIds.forEach(id => {
      setProgress(prev => ({ ...prev, [id]: 'pending' }))
    })
    
    try {
      const result = await logsApi.batchCollectLogs(deviceIds, logType)
      deviceIds.forEach(id => {
        setProgress(prev => ({ ...prev, [id]: 'done' }))
      })
      toast.success(result.message)
      return result
    } catch (err: any) {
      deviceIds.forEach(id => {
        setProgress(prev => ({ ...prev, [id]: 'error' }))
      })
      toast.error(err.message || '批量采集失败')
      throw err
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
    } catch (err: any) {
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
