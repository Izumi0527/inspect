import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { DashboardData, DashboardConfig, RecentAlert, AlertSeverity } from '../types'
import {
  fetchDashboardData,
  searchDevices
} from '../api/dashboard.api'

const DASHBOARD_REQUEST_DEDUPE_WINDOW_MS = 1500

let dashboardDataInFlight: Promise<DashboardData> | null = null
let dashboardDataSnapshot:
  | {
      data: DashboardData
      resolvedAt: number
    }
  | null = null

type DeviceSearchResult = {
  id: string
  name: string
  ip: string
  status: string
}

const mapDeviceSearchResult = (item: Record<string, unknown>, index: number): DeviceSearchResult => ({
  id: String(item.id ?? item.device_id ?? index),
  name: typeof item.name === 'string' && item.name ? item.name : '未知设备',
  ip: typeof item.ip_address === 'string'
    ? item.ip_address
    : (typeof item.ip === 'string' ? item.ip : '未提供 IP'),
  status: typeof item.status === 'string' ? item.status : 'unknown',
})

const requestDashboardData = async (force: boolean = false): Promise<DashboardData> => {
  if (!force && dashboardDataSnapshot) {
    const elapsed = Date.now() - dashboardDataSnapshot.resolvedAt
    if (elapsed <= DASHBOARD_REQUEST_DEDUPE_WINDOW_MS) {
      return dashboardDataSnapshot.data
    }
  }

  if (!force && dashboardDataInFlight) {
    return dashboardDataInFlight
  }

  const request = fetchDashboardData()
    .then((dashboardData) => {
      dashboardDataSnapshot = {
        data: dashboardData,
        resolvedAt: Date.now(),
      }
      return dashboardData
    })
    .finally(() => {
      dashboardDataInFlight = null
    })

  dashboardDataInFlight = request
  return request
}

// Dashboard数据管理hook
export function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [isInitialLoading, setIsInitialLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dataRef = useRef<DashboardData | null>(null)

  useEffect(() => {
    dataRef.current = data
  }, [data])

  const loadData = useCallback(async (force: boolean = false) => {
    const initialLoad = dataRef.current === null
    try {
      if (initialLoad) {
        setIsInitialLoading(true)
        setError(null)
      } else {
        setIsRefreshing(true)
      }
      const dashboardData = await requestDashboardData(force)
      setData(dashboardData)
    } catch (err) {
      if (initialLoad) {
        setError(err instanceof Error ? err.message : '加载Dashboard数据失败')
      } else {
        console.error('刷新Dashboard数据失败:', err)
      }
    } finally {
      if (initialLoad) {
        setIsInitialLoading(false)
      } else {
        setIsRefreshing(false)
      }
    }
  }, [])

  // 刷新统计数据
  const refreshStats = useCallback(async () => {
    try {
      setIsRefreshing(true)
      // 统一使用 fetchDashboardData() 保证数据一致性
      const dashboardData = await requestDashboardData(true)
      setData(dashboardData)
    } catch (err) {
      console.error('刷新统计数据失败:', err)
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  // 初始加载
  useEffect(() => {
    const init = async () => {
      await loadData()
      // 移除自动刷新逻辑，避免数据覆盖冲突
      // 数据已在 loadData() 中获取完整，无需额外刷新
    }
    init()
  }, [loadData])

  return {
    data,
    isInitialLoading,
    isRefreshing,
    error,
    loadData,
    refreshStats
  }
}

// Dashboard配置管理hook
export function useDashboardConfig() {
  const [config, setConfig] = useState<DashboardConfig>({
    sidebarOpen: true,
    autoRefresh: true,
    refreshInterval: 60000 // 改为60秒，避免过于频繁
  })

  const toggleSidebar = useCallback(() => {
    setConfig(prev => ({ ...prev, sidebarOpen: !prev.sidebarOpen }))
  }, [])

  const toggleAutoRefresh = useCallback(() => {
    setConfig(prev => ({ ...prev, autoRefresh: !prev.autoRefresh }))
  }, [])

  const setRefreshInterval = useCallback((interval: number) => {
    setConfig(prev => ({ ...prev, refreshInterval: interval }))
  }, [])

  return {
    config,
    toggleSidebar,
    toggleAutoRefresh,
    setRefreshInterval
  }
}

// 自动刷新hook
export function useDashboardAutoRefresh(callback: () => void, enabled: boolean, interval: number) {
  useEffect(() => {
    if (!enabled) return

    const intervalId = setInterval(callback, interval)
    return () => clearInterval(intervalId)
  }, [callback, enabled, interval])
}

// 设备搜索hook
export function useDeviceSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DeviceSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null)
  const requestIdRef = useRef(0)
  const MIN_QUERY_LENGTH = 2

  const search = useCallback(async (searchQuery: string) => {
    const trimmed = searchQuery.trim()
    if (!trimmed || trimmed.length < MIN_QUERY_LENGTH) {
      setResults([])
      setShowResults(false)
      setSearching(false)
      return
    }

    const requestId = ++requestIdRef.current

    try {
      setSearching(true)
      const searchResults = await searchDevices(trimmed)
      if (requestId !== requestIdRef.current) return
      const normalizedResults = searchResults.map((item, index) => mapDeviceSearchResult(item, index))
      setResults(normalizedResults)
      setShowResults(true)
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      console.error('搜索失败:', err)
    } finally {
      if (requestId === requestIdRef.current) {
        setSearching(false)
      }
    }
  }, [])

  const handleQueryChange = useCallback((newQuery: string) => {
    setQuery(newQuery)
    
    // 防抖搜索
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
    }

    const trimmed = newQuery.trim()
    if (!trimmed || trimmed.length < MIN_QUERY_LENGTH) {
      // 触发取消：避免旧请求回写结果
      requestIdRef.current += 1
      setResults([])
      setShowResults(false)
      setSearching(false)
      return
    }

    searchTimerRef.current = setTimeout(() => {
      search(newQuery)
    }, 300)
  }, [search])

  const clearSearch = useCallback(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
      searchTimerRef.current = null
    }
    requestIdRef.current += 1
    setQuery('')
    setResults([])
    setShowResults(false)
    setSearching(false)
  }, [])

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current)
        searchTimerRef.current = null
      }
      requestIdRef.current += 1
    }
  }, [])

  return {
    query,
    results,
    searching,
    showResults,
    setQuery: handleQueryChange,
    clearSearch,
    search
  }
}

// 告警分析hook
export function useAlertAnalysis(alerts: RecentAlert[]) {
  return useMemo(() => {
    const total = alerts.length
    const high = alerts.filter(a => a.severity === 'high').length
    const medium = alerts.filter(a => a.severity === 'medium').length
    const low = alerts.filter(a => a.severity === 'low').length

    const categories = alerts.reduce((acc, alert) => {
      if (alert.category) {
        acc[alert.category] = (acc[alert.category] || 0) + 1
      }
      return acc
    }, {} as Record<string, number>)

    return {
      total,
      high,
      medium,
      low,
      categories,
      criticalPercentage: total > 0 ? Math.round((high / total) * 100) : 0
    }
  }, [alerts])
}

// 告警样式工具hook
export function useAlertSeverityStyles() {
  const getSeverityColor = useCallback((severity: AlertSeverity) => {
    switch (severity) {
      case 'high':
        return 'bg-red-500'
      case 'medium':
        return 'bg-yellow-500'
      case 'low':
        return 'bg-green-500'
    }
  }, [])

  const getSeverityTextColor = useCallback((severity: AlertSeverity) => {
    switch (severity) {
      case 'high':
        return 'text-red-600'
      case 'medium':
        return 'text-yellow-600'
      case 'low':
        return 'text-green-600'
    }
  }, [])

  return {
    getSeverityColor,
    getSeverityTextColor
  }
}
