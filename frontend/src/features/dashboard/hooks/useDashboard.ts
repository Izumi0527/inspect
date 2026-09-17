import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardData, DashboardConfig, RecentAlert, AlertSeverity } from '../types'
import {
  fetchDashboardData,
  searchDevices
} from '../api/dashboard.api'
import { ApiClientError } from '@/lib/api-client'
import { useWebSocket, useWebSocketEvent, WebSocketEvents } from '@/lib/websocket'

const DASHBOARD_REQUEST_DEDUPE_WINDOW_MS = 1500

// 一轮告警评估可能连发多条新增/恢复推送，合并为一次总览刷新
const ALERT_REFRESH_DEBOUNCE_MS = 2000

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
  const router = useRouter()
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
      // 强制改密用户访问业务接口会被后端拦截（403 PasswordChangeRequired）：直接跳改密页，
      // 而非显示通用「无法加载数据」。这是路由守卫之外的兜底（如会话中途被管理员重置密码）。
      if (err instanceof ApiClientError && err.type === 'PasswordChangeRequired') {
        router.push('/change-password')
        return
      }
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
  }, [router])

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

// 把连发的实时事件合并成一次刷新：返回稳定的触发函数，卸载时清掉未触发的定时器。
function useDebouncedRefresh(refresh: () => void) {
  const refreshRef = useRef(refresh)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      refreshRef.current()
    }, ALERT_REFRESH_DEBOUNCE_MS)
  }, [])
}

// 实时告警的动态刷新：订阅 alerts 房间，告警新增/处理/解决（含系统自动恢复）推送后刷新总览，
// 让已恢复的告警不必等待 60s 轮询就从卡片消失。enabled 为 false（无 alerts:read）时不订阅也不刷新。
export function useDashboardAlertRealtimeRefresh(refresh: () => void, enabled: boolean) {
  const ws = useWebSocket()
  const trigger = useDebouncedRefresh(refresh)

  useEffect(() => {
    if (!enabled) return
    return ws.subscribeToAlerts()
  }, [enabled, ws])

  const handleAlertEvent = useCallback(() => {
    if (!enabled) return
    trigger()
  }, [enabled, trigger])

  useWebSocketEvent(WebSocketEvents.NEW_ALERT, handleAlertEvent)
  useWebSocketEvent(WebSocketEvents.ALERT_UPDATE, handleAlertEvent)
  useWebSocketEvent(WebSocketEvents.ALERT_RESOLVED, handleAlertEvent)
}

// 顶栏通知中心的实时刷新：告警房间受 alerts:read 门控；notifications 房间（巡检/报表/扫描终态信号）
// 不含业务数据、任何登录用户都可订阅，因此始终订阅。两路事件共用一个防抖，避免同一轮变更刷新两次。
export function useNotificationCenterRealtimeRefresh(refresh: () => void, canReadAlerts: boolean) {
  const ws = useWebSocket()
  const trigger = useDebouncedRefresh(refresh)

  useEffect(() => {
    if (!canReadAlerts) return
    return ws.subscribeToAlerts()
  }, [canReadAlerts, ws])

  useEffect(() => ws.subscribeToNotifications(), [ws])

  const handleAlertEvent = useCallback(() => {
    if (!canReadAlerts) return
    trigger()
  }, [canReadAlerts, trigger])

  useWebSocketEvent(WebSocketEvents.NEW_ALERT, handleAlertEvent)
  useWebSocketEvent(WebSocketEvents.ALERT_UPDATE, handleAlertEvent)
  useWebSocketEvent(WebSocketEvents.ALERT_RESOLVED, handleAlertEvent)
  useWebSocketEvent(WebSocketEvents.NOTIFICATION_UPDATE, trigger)
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
