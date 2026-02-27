import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { DashboardData, DashboardConfig, RecentAlert, AlertSeverity } from '../types'

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
import {
  fetchDashboardData,
  performDeviceScan,
  generateReport,
  searchDevices
} from '../api/dashboard.api'

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

  const loadData = useCallback(async () => {
    const initialLoad = dataRef.current === null
    try {
      if (initialLoad) {
        setIsInitialLoading(true)
        setError(null)
      } else {
        setIsRefreshing(true)
      }
      const dashboardData = await fetchDashboardData()
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
      const dashboardData = await fetchDashboardData()
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

// 快速操作hook
export function useQuickActions() {
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const executeAction = useCallback(async (actionType: string) => {
    try {
      setLoading(prev => ({ ...prev, [actionType]: true }))
      setError(null)

      switch (actionType) {
        case 'deviceScan':
          await performDeviceScan('192.168.1.0/24') // 传递默认子网
          break
        case 'manualInspection':
          // 跳转到巡检任务创建页面
          window.location.href = '/inspection/tasks?action=create'
          break
        case 'generateReport':
          await generateReport('inspection-summary') // 生成巡检汇总报告
          break
        case 'systemConfig':
          // 跳转到系统设置页面
          window.location.href = '/settings'
          break
        default:
          throw new Error(`未知的操作类型: ${actionType}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作执行失败')
    } finally {
      setLoading(prev => ({ ...prev, [actionType]: false }))
    }
  }, [])

  return {
    loading,
    error,
    executeAction
  }
}

// 设备搜索hook
export function useDeviceSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DeviceSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null)

  const search = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      setShowResults(false)
      return
    }

    try {
      setSearching(true)
      const searchResults = await searchDevices(searchQuery)
      const normalizedResults = searchResults.map((item, index) => mapDeviceSearchResult(item, index))
      setResults(normalizedResults)
      setShowResults(true)
    } catch (err) {
      console.error('搜索失败:', err)
    } finally {
      setSearching(false)
    }
  }, [])

  const handleQueryChange = useCallback((newQuery: string) => {
    setQuery(newQuery)
    
    // 防抖搜索
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
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
    setQuery('')
    setResults([])
    setShowResults(false)
  }, [])

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current)
        searchTimerRef.current = null
      }
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
