'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { formatDateTimeYMDHMS } from '@/utils/formatters'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'
import { useWebSocket, useWebSocketEvent, WebSocketEvents } from '@/lib/websocket'
import { useMonitoringV2 } from './useMonitoringV2'
import { INTERFACE_TRAFFIC_QUERY_KEY } from './useDeviceInterfaceTraffic'
import {
  useMonitoringNavigation,
  type MonitoringNavigationState,
} from './useMonitoringNavigation'
import {
  DEFAULT_TIME_RANGE,
  MONITORING_DATA_STALE_THRESHOLD_MS,
  MONITORING_SECTION_LABELS,
  formatDurationFromMs,
  formatMonitoringTimeRangeTriggerLabel,
  isValidMonitoringTimeRange,
} from '../utils/monitoring'
import type { MonitoringDataEnvelope, MonitoringDataV2 } from '../types'
import type { MonitoringTabKey } from '../types/zabbix-monitoring.types'

const REFRESH_DEBOUNCE_MS = 10_000
const REFRESH_MAX_WAIT_MS = 60_000

export interface UseMonitoringPageResult {
  // 状态
  timeRange: string
  setTimeRange: (value: string) => void
  timeRangeLabel: string
  /** 设备筛选（空数组 = 全部设备） */
  deviceIds: number[]
  setDeviceIds: (ids: number[]) => void
  wsHealth: 'connected' | 'stale' | 'disconnected'
  pageVisible: boolean
  // 权限
  canExportReport: boolean
  canReadAlerts: boolean
  canUpdateAlerts?: boolean
  canControlMonitoring?: boolean
  canCreateDeviceGroup?: boolean
  canUpdateDeviceGroup?: boolean
  canDeleteDeviceGroup?: boolean
  canReadInspections?: boolean
  canReadLogs?: boolean
  // 数据
  envelope: MonitoringDataEnvelope | undefined
  data: MonitoringDataV2 | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => unknown
  isRefetching: boolean
  // 计算值
  lastUpdateLabel: string | null
  isDataStale: boolean
  dataAgeLabel: string | null
  apiOkButDataStale: boolean
  hasEffectivePartialFailure: boolean
  effectiveFailedSectionLabels: string[]
  // Task 8 导航与投屏状态（向后兼容旧测试构建）
  activeTab?: MonitoringTabKey
  setActiveTab?: (tab: MonitoringTabKey) => void
  activeGroupId?: number | null
  setActiveGroupId?: (groupId: number | null) => void
  selectedHostId?: number | null
  setSelectedHostId?: (hostId: number | null) => void
  initialHostStatusFilter?: string | null
  setInitialHostStatusFilter?: (status: string | null) => void
  navigateToHostsWithStatus?: (status: string | null) => void
  compareYesterday?: boolean
  setCompareYesterday?: (enabled: boolean) => void
  isKioskMode?: boolean
  setIsKioskMode?: (enabled: boolean) => void
  kioskCountdownSec?: number
  resetKioskCountdown?: () => void
}

export type UseMonitoringPageFullResult = Omit<
  UseMonitoringPageResult,
  | keyof MonitoringNavigationState
  | 'canUpdateAlerts'
  | 'canControlMonitoring'
  | 'canCreateDeviceGroup'
  | 'canUpdateDeviceGroup'
  | 'canDeleteDeviceGroup'
  | 'canReadInspections'
  | 'canReadLogs'
> &
  MonitoringNavigationState & {
    canUpdateAlerts: boolean
    canControlMonitoring: boolean
    canCreateDeviceGroup: boolean
    canUpdateDeviceGroup: boolean
    canDeleteDeviceGroup: boolean
    canReadInspections: boolean
    canReadLogs: boolean
  }

export function useMonitoringPage(): UseMonitoringPageFullResult {
  const canExportReport = usePermission(Permission.MONITORING_EXPORT)
  const canControlMonitoring = usePermission(Permission.MONITORING_CONTROL)
  const canReadAlerts = usePermission(Permission.ALERTS_READ)
  const canUpdateAlerts = usePermission(Permission.ALERTS_UPDATE)
  const canCreateDeviceGroup = usePermission(Permission.DEVICES_CREATE)
  const canUpdateDeviceGroup = usePermission(Permission.DEVICES_UPDATE)
  const canDeleteDeviceGroup = usePermission(Permission.DEVICES_DELETE)
  const canReadInspections = usePermission(Permission.INSPECTIONS_READ)
  const canReadLogs = usePermission(Permission.SYSTEM_LOGS)
  const ws = useWebSocket()
  const queryClient = useQueryClient()

  const refetchRef = useRef<null | (() => unknown)>(null)
  const nav = useMonitoringNavigation(
    useCallback(() => {
      void refetchRef.current?.()
    }, [])
  )

  // ── 时间范围（持久化到 localStorage）──────────────────────────────────────
  const [timeRange, setTimeRange] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_TIME_RANGE
    const stored = window.localStorage.getItem('monitoring:timeRange')
    if (stored && isValidMonitoringTimeRange(stored)) {
      return stored
    }
    return DEFAULT_TIME_RANGE
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('monitoring:timeRange', timeRange)
  }, [timeRange])

  // ── 设备筛选（持久化到 localStorage，空数组 = 全部设备）───────────────────
  const [deviceIds, setDeviceIds] = useState<number[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = window.localStorage.getItem('monitoring:deviceIds')
      if (!stored) return []
      const parsed: unknown = JSON.parse(stored)
      if (!Array.isArray(parsed)) return []
      return parsed
        .map((item) => (typeof item === 'number' ? item : Number(String(item))))
        .filter((id): id is number => Number.isFinite(id) && id > 0)
    } catch {
      return []
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('monitoring:deviceIds', JSON.stringify(deviceIds))
  }, [deviceIds])

  // ── 页面可见性 ─────────────────────────────────────────────────────────────
  const [pageVisible, setPageVisible] = useState(() => {
    if (typeof document === 'undefined') return true
    return document.visibilityState !== 'hidden'
  })

  useEffect(() => {
    if (typeof document === 'undefined') return
    const handleVisibilityChange = () => {
      setPageVisible(document.visibilityState !== 'hidden')
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // ── WS 健康度 + nowMs 时钟 ─────────────────────────────────────────────────
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [wsHealth, setWsHealth] = useState<'connected' | 'stale' | 'disconnected'>(() =>
    ws.getHealthStatus()
  )

  useEffect(() => {
    if (!pageVisible) return
    const timer = setInterval(() => {
      setNowMs(Date.now())
      const next = ws.getHealthStatus()
      setWsHealth((prev) => (prev === next ? prev : next))
    }, 10_000)
    return () => clearInterval(timer)
  }, [pageVisible, ws])

  const lastWsConnectRefetchAtRef = useRef<number>(0)
  const lastStaleAutoRefetchAtRef = useRef<number>(0)

  const {
    data: envelope,
    isLoading,
    error,
    refetch: refetchV2,
    isRefetching,
  } = useMonitoringV2({
    timeRange,
    deviceIds,
    groupId: nav.activeGroupId,
    compareYesterday: nav.compareYesterday,
    enablePolling: pageVisible,
    refetchInterval:
      wsHealth === 'connected' ? 300000 : wsHealth === 'stale' ? 60000 : 120000,
  })

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [INTERFACE_TRAFFIC_QUERY_KEY] })
    nav.resetKioskCountdown()
    return refetchV2()
  }, [queryClient, refetchV2, nav])
  refetchRef.current = refetch

  const subscribeDeviceMonitoring = useCallback(() => {
    ws.subscribeToDeviceMonitoring(deviceIds.length > 0 ? deviceIds : undefined)
  }, [deviceIds, ws])

  const handleWsConnect = useCallback(() => {
    setNowMs(Date.now())
    setWsHealth('connected')
    if (!pageVisible) return
    subscribeDeviceMonitoring()
    const now = Date.now()
    if (now - lastWsConnectRefetchAtRef.current >= 15_000) {
      lastWsConnectRefetchAtRef.current = now
      void refetchRef.current?.()
    }
  }, [pageVisible, subscribeDeviceMonitoring])

  const handleWsDisconnect = useCallback(() => {
    setNowMs(Date.now())
    setWsHealth('disconnected')
  }, [])

  useWebSocketEvent(WebSocketEvents.CONNECT, handleWsConnect)
  useWebSocketEvent(WebSocketEvents.DISCONNECT, handleWsDisconnect)

  useEffect(() => {
    if (!pageVisible || wsHealth !== 'stale') return
    const now = Date.now()
    if (now - lastStaleAutoRefetchAtRef.current < 30_000) return
    lastStaleAutoRefetchAtRef.current = now
    void refetch()
  }, [pageVisible, refetch, wsHealth])

  useEffect(() => {
    if (!pageVisible) {
      ws.unsubscribeFromDeviceMonitoring()
      return
    }
    subscribeDeviceMonitoring()
    return () => ws.unsubscribeFromDeviceMonitoring()
  }, [pageVisible, subscribeDeviceMonitoring, ws])

  // ── 受控刷新（debounce + max wait）────────────────────────────────────────
  const firstRealtimeEventAtRef = useRef<number | null>(null)
  const scheduledRefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refetchDebounced = useCallback(() => {
    const now = Date.now()
    if (firstRealtimeEventAtRef.current === null) {
      firstRealtimeEventAtRef.current = now
    }
    const run = () => {
      firstRealtimeEventAtRef.current = null
      scheduledRefetchTimerRef.current = null
      void refetch()
    }
    if (now - firstRealtimeEventAtRef.current >= REFRESH_MAX_WAIT_MS) {
      if (scheduledRefetchTimerRef.current) {
        clearTimeout(scheduledRefetchTimerRef.current)
        scheduledRefetchTimerRef.current = null
      }
      run()
      return
    }
    if (scheduledRefetchTimerRef.current) {
      clearTimeout(scheduledRefetchTimerRef.current)
      scheduledRefetchTimerRef.current = null
    }
    scheduledRefetchTimerRef.current = setTimeout(run, REFRESH_DEBOUNCE_MS)
  }, [refetch])

  useEffect(() => {
    return () => {
      if (scheduledRefetchTimerRef.current) {
        clearTimeout(scheduledRefetchTimerRef.current)
        scheduledRefetchTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (pageVisible) return
    firstRealtimeEventAtRef.current = null
    if (scheduledRefetchTimerRef.current) {
      clearTimeout(scheduledRefetchTimerRef.current)
      scheduledRefetchTimerRef.current = null
    }
  }, [pageVisible])

  useEffect(() => {
    firstRealtimeEventAtRef.current = null
    if (scheduledRefetchTimerRef.current) {
      clearTimeout(scheduledRefetchTimerRef.current)
      scheduledRefetchTimerRef.current = null
    }
  }, [timeRange, deviceIds])

  const handleRealtimeRefresh = useCallback(
    (_payload: unknown) => {
      if (!pageVisible) return
      refetchDebounced()
    },
    [pageVisible, refetchDebounced]
  )

  useWebSocketEvent(WebSocketEvents.NETWORK_STATS_UPDATE, handleRealtimeRefresh)

  const timeRangeLabel = useMemo(
    () => formatMonitoringTimeRangeTriggerLabel(timeRange),
    [timeRange]
  )

  const lastUpdateAt = useMemo(() => {
    const raw = envelope?.lastUpdate
    if (!raw) return null
    const date = raw instanceof Date ? raw : new Date(String(raw))
    return Number.isNaN(date.getTime()) ? null : date
  }, [envelope?.lastUpdate])

  const lastUpdateLabel = useMemo(() => {
    const raw = envelope?.lastUpdate
    if (!raw) return null
    if (lastUpdateAt) return formatDateTimeYMDHMS(lastUpdateAt)
    const fallback = String(raw).trim()
    return fallback !== '' ? fallback : null
  }, [envelope?.lastUpdate, lastUpdateAt])

  const dataAgeMs = useMemo(() => {
    if (!lastUpdateAt) return null
    return Math.max(0, nowMs - lastUpdateAt.getTime())
  }, [lastUpdateAt, nowMs])

  const dataAgeLabel = useMemo(
    () => (dataAgeMs === null ? null : formatDurationFromMs(dataAgeMs)),
    [dataAgeMs]
  )

  const isDataStale =
    dataAgeMs !== null && dataAgeMs > MONITORING_DATA_STALE_THRESHOLD_MS

  const apiOkButDataStale = useMemo(() => {
    if (!isDataStale || !envelope?.generatedAt) return false
    const generatedDate =
      envelope.generatedAt instanceof Date
        ? envelope.generatedAt
        : new Date(String(envelope.generatedAt))
    if (Number.isNaN(generatedDate.getTime())) return false
    return nowMs - generatedDate.getTime() < 5 * 60 * 1000
  }, [isDataStale, envelope?.generatedAt, nowMs])

  const { effectiveFailedSectionLabels, hasEffectivePartialFailure } = useMemo(() => {
    const allFailed = envelope?.failedSections ?? []
    const singleDeviceView = deviceIds.length === 1
    const sections = allFailed.filter(
      (section) => !(section === 'networkTraffic' && singleDeviceView)
    )
    return {
      effectiveFailedSectionLabels: sections.map(
        (key) => MONITORING_SECTION_LABELS[key] ?? key
      ),
      hasEffectivePartialFailure: sections.length > 0,
    }
  }, [deviceIds.length, envelope?.failedSections])

  return {
    timeRange,
    setTimeRange,
    timeRangeLabel,
    deviceIds,
    setDeviceIds,
    wsHealth,
    pageVisible,
    canExportReport,
    canReadAlerts,
    canUpdateAlerts,
    canControlMonitoring,
    canCreateDeviceGroup,
    canUpdateDeviceGroup,
    canDeleteDeviceGroup,
    canReadInspections,
    canReadLogs,
    envelope,
    data: envelope?.data,
    isLoading,
    error: error ?? null,
    refetch,
    isRefetching,
    lastUpdateLabel,
    isDataStale,
    dataAgeLabel,
    apiOkButDataStale,
    hasEffectivePartialFailure,
    effectiveFailedSectionLabels,
    ...nav,
  }
}
