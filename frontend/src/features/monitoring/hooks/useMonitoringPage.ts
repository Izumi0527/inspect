'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'
import { useWebSocket, useWebSocketEvent, WebSocketEvents } from '@/lib/websocket'
import { useMonitoringV2 } from './useMonitoringV2'
import {
  TIME_RANGE_OPTIONS,
  MONITORING_SECTION_LABELS,
  resolveTimeRangeLabel,
  resolveMonitoringDataStaleThresholdMs,
  formatDurationFromMs,
} from '../utils/monitoring'
import type { MonitoringDataEnvelope, MonitoringDataV2 } from '../types'

// 推送触发"受控刷新"的节流参数：
// - debounce：等待推送"安静"一小段时间再刷新，尽量一次性拿到同一轮采集的完整数据
// - max wait：防止持续推送导致永不刷新（兜底定时触发一次）
const REFRESH_DEBOUNCE_MS = 10_000
const REFRESH_MAX_WAIT_MS = 60_000

export interface UseMonitoringPageResult {
  // 状态
  timeRange: string
  setTimeRange: (value: string) => void
  timeRangeLabel: string
  wsHealth: 'connected' | 'stale' | 'disconnected'
  pageVisible: boolean
  // 权限
  canExportReport: boolean
  canReadAlerts: boolean
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
  /** API 正常响应但无新数据点（采集可能失败/设备不可达） */
  apiOkButDataStale: boolean
  hasEffectivePartialFailure: boolean
  effectiveFailedSectionLabels: string[]
  realtimeAlertsPermissionLimited: boolean
}

export function useMonitoringPage(): UseMonitoringPageResult {
  const canExportReport = usePermission(Permission.MONITORING_EXPORT)
  const canReadAlerts = usePermission(Permission.ALERTS_READ)
  const ws = useWebSocket()

  // ── 时间范围（持久化到 localStorage）──────────────────────────────────────
  const [timeRange, setTimeRange] = useState<string>(() => {
    if (typeof window === 'undefined') return '24h'
    const stored = window.localStorage.getItem('monitoring:timeRange')
    if (stored && TIME_RANGE_OPTIONS.some((item) => item.value === stored)) {
      return stored
    }
    return '24h'
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('monitoring:timeRange', timeRange)
  }, [timeRange])

  // ── 页面可见性 ─────────────────────────────────────────────────────────────
  // 页面不可见时暂停轮询：降低无意义的后台刷新；返回页面时 React Query 会因 focus 自动 refetch。
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

  // WS 健康度（stale）检测：用于识别"显示已连接但实际上已半开/无响应"的场景。
  // 通过 wsManager 的心跳 ack（后端会回 heartbeat:ok）判断最近活跃时间。
  useEffect(() => {
    if (!pageVisible) return

    const timer = setInterval(() => {
      const now = Date.now()
      setNowMs(now)
      const next = ws.getHealthStatus()
      setWsHealth((prev) => (prev === next ? prev : next))
    }, 10_000)

    return () => {
      clearInterval(timer)
    }
  }, [pageVisible, ws])

  // ── 引用 ──────────────────────────────────────────────────────────────────
  const refetchRef = useRef<null | (() => unknown)>(null)
  const lastWsConnectRefetchAtRef = useRef<number>(0)
  const lastStaleAutoRefetchAtRef = useRef<number>(0)

  // ── React Query ────────────────────────────────────────────────────────────
  const {
    data: envelope,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useMonitoringV2({
    timeRange,
    // 轮询兜底策略：
    // - 页面不可见：关闭轮询（避免后台无意义刷新）
    // - WS 在线：低频轮询（防止"无推送/订阅异常"导致页面长期不更新）
    // - WS 离线：恢复较高频轮询兜底
    enablePolling: pageVisible,
    refetchInterval: wsHealth === 'connected' ? 300000 : wsHealth === 'stale' ? 60000 : 120000,
  })
  refetchRef.current = refetch

  // ── WS 订阅回调 ────────────────────────────────────────────────────────────
  const subscribeDeviceMonitoring = useCallback(() => {
    ws.subscribeToDeviceMonitoring()
  }, [ws])

  const subscribeAlertsRoom = useCallback(() => {
    if (!canReadAlerts) return
    ws.subscribeToAlerts()
  }, [canReadAlerts, ws])

  // ── WS connect/disconnect 处理 ─────────────────────────────────────────────
  const handleWsConnect = useCallback(() => {
    setNowMs(Date.now())
    setWsHealth('connected')
    // 页面不可见时不订阅房间，避免后台接收推送与触发刷新；返回页面时会在可见性 effect 中重新订阅。
    if (!pageVisible) return
    subscribeDeviceMonitoring()
    subscribeAlertsRoom()

    // WS 连接建立后主动触发一次首轮刷新，避免"连接成功但短期无推送"导致页面长期不更新。
    const now = Date.now()
    if (now - lastWsConnectRefetchAtRef.current >= 15_000) {
      lastWsConnectRefetchAtRef.current = now
      void refetchRef.current?.()
    }
  }, [pageVisible, subscribeAlertsRoom, subscribeDeviceMonitoring])

  const handleWsDisconnect = useCallback(() => {
    setNowMs(Date.now())
    setWsHealth('disconnected')
  }, [])

  // WebSocket 连接/断开状态监听（用于轮询兜底开关 + 重连后重新订阅）
  useWebSocketEvent(WebSocketEvents.CONNECT, handleWsConnect)
  useWebSocketEvent(WebSocketEvents.DISCONNECT, handleWsDisconnect)

  // ── stale 状态自动刷新（限流）─────────────────────────────────────────────
  // 当 WS 连接处于 stale（无心跳 ack）时，主动触发一次刷新，尽快恢复数据更新体验。
  useEffect(() => {
    if (!pageVisible) return
    if (wsHealth !== 'stale') return

    const now = Date.now()
    if (now - lastStaleAutoRefetchAtRef.current < 30_000) return
    lastStaleAutoRefetchAtRef.current = now
    void refetch()
  }, [pageVisible, refetch, wsHealth])

  // ── 页面可见性驱动订阅 ─────────────────────────────────────────────────────
  // 页面级订阅：进入监控中心才订阅 device_metrics，离开页面即退订，降低无关推送开销。
  useEffect(() => {
    if (!pageVisible) {
      ws.unsubscribeFromDeviceMonitoring()
      ws.unsubscribeFromAlerts()
      return
    }

    subscribeDeviceMonitoring()
    subscribeAlertsRoom()

    return () => {
      ws.unsubscribeFromDeviceMonitoring()
      ws.unsubscribeFromAlerts()
    }
  }, [pageVisible, subscribeAlertsRoom, subscribeDeviceMonitoring, ws])

  // ── 受控刷新（debounce + max wait）────────────────────────────────────────
  // 推送触发"受控刷新"：合并同一轮采集产生的爆发推送，避免 refetch 风暴。
  // 经验值：将刷新频率控制在"约 1 次/分钟"量级，既接近实时又避免对后端造成额外压力。
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

  // cleanup：组件卸载时清理 pending 定时器
  useEffect(() => {
    return () => {
      if (!scheduledRefetchTimerRef.current) return
      clearTimeout(scheduledRefetchTimerRef.current)
      scheduledRefetchTimerRef.current = null
    }
  }, [])

  // 页面不可见时清理"受控刷新"定时器，避免后台触发 refetch。
  useEffect(() => {
    if (pageVisible) return

    firstRealtimeEventAtRef.current = null
    if (!scheduledRefetchTimerRef.current) return
    clearTimeout(scheduledRefetchTimerRef.current)
    scheduledRefetchTimerRef.current = null
  }, [pageVisible])

  // 切换时间范围时清理 pending 定时器，避免旧 queryKey 的 refetch 泄漏。
  useEffect(() => {
    firstRealtimeEventAtRef.current = null
    if (!scheduledRefetchTimerRef.current) return
    clearTimeout(scheduledRefetchTimerRef.current)
    scheduledRefetchTimerRef.current = null
  }, [timeRange])

  // ── WS 事件处理 ────────────────────────────────────────────────────────────
  // 注意：后端 device_metrics 推送会映射为多个事件，这里只监听一个，避免重复刷新。
  const handleRealtimeRefresh = useCallback(
    (_payload: unknown) => {
      if (!pageVisible) return
      refetchDebounced()
    },
    [pageVisible, refetchDebounced]
  )

  useWebSocketEvent(WebSocketEvents.NETWORK_STATS_UPDATE, handleRealtimeRefresh)

  const handleAlertRealtimeRefresh = useCallback(
    (_payload: unknown) => {
      if (!canReadAlerts) return
      if (!pageVisible) return
      refetchDebounced()
    },
    [canReadAlerts, pageVisible, refetchDebounced]
  )

  useWebSocketEvent(WebSocketEvents.NEW_ALERT, handleAlertRealtimeRefresh)
  useWebSocketEvent(WebSocketEvents.ALERT_UPDATE, handleAlertRealtimeRefresh)
  useWebSocketEvent(WebSocketEvents.ALERT_RESOLVED, handleAlertRealtimeRefresh)

  // ── 计算值 ─────────────────────────────────────────────────────────────────
  const timeRangeLabel = useMemo(() => resolveTimeRangeLabel(timeRange), [timeRange])

  const lastUpdateAt = useMemo(() => {
    const raw = envelope?.lastUpdate
    if (!raw) return null

    const date = raw instanceof Date ? raw : new Date(String(raw))
    if (Number.isNaN(date.getTime())) {
      return null
    }
    return date
  }, [envelope?.lastUpdate])

  const lastUpdateLabel = useMemo(() => {
    const raw = envelope?.lastUpdate
    if (!raw) return null

    if (lastUpdateAt) {
      return lastUpdateAt.toLocaleString()
    }

    const fallback = String(raw).trim()
    return fallback !== '' ? fallback : null
  }, [envelope?.lastUpdate, lastUpdateAt])

  const dataStaleThresholdMs = useMemo(
    () => resolveMonitoringDataStaleThresholdMs(timeRange),
    [timeRange]
  )

  const dataAgeMs = useMemo(() => {
    if (!lastUpdateAt) return null
    return Math.max(0, nowMs - lastUpdateAt.getTime())
  }, [lastUpdateAt, nowMs])

  const dataAgeLabel = useMemo(() => {
    if (dataAgeMs === null) return null
    return formatDurationFromMs(dataAgeMs)
  }, [dataAgeMs])

  const isDataStale = dataAgeMs !== null && dataAgeMs > dataStaleThresholdMs

  // 区分"API 正常响应但数据源无新数据"与"API 不可达"
  const apiOkButDataStale = useMemo(() => {
    if (!isDataStale || !envelope?.generatedAt) return false
    const generatedDate = envelope.generatedAt instanceof Date
      ? envelope.generatedAt
      : new Date(String(envelope.generatedAt))
    if (Number.isNaN(generatedDate.getTime())) return false
    // generatedAt 在 5 分钟内说明 API 仍在正常响应
    return nowMs - generatedDate.getTime() < 5 * 60 * 1000
  }, [isDataStale, envelope?.generatedAt, nowMs])

  const realtimeAlertsPermissionLimited =
    !canReadAlerts || envelope?.sections.realtimeAlerts?.limitedByPermission === true

  const { effectiveFailedSectionLabels, hasEffectivePartialFailure } =
    useMemo(() => {
      const allFailed = envelope?.failedSections ?? []
      const sections = realtimeAlertsPermissionLimited
        ? allFailed.filter((section) => section !== 'realtimeAlerts')
        : allFailed
      return {
        effectiveFailedSections: sections,
        effectiveFailedSectionLabels: sections.map((key) => MONITORING_SECTION_LABELS[key] ?? key),
        hasEffectivePartialFailure: sections.length > 0,
      }
    }, [envelope?.failedSections, realtimeAlertsPermissionLimited])

  return {
    // 状态
    timeRange,
    setTimeRange,
    timeRangeLabel,
    wsHealth,
    pageVisible,
    // 权限
    canExportReport,
    canReadAlerts,
    // 数据
    envelope,
    data: envelope?.data,
    isLoading,
    error: error ?? null,
    refetch,
    isRefetching,
    // 计算值
    lastUpdateLabel,
    isDataStale,
    dataAgeLabel,
    apiOkButDataStale,
    hasEffectivePartialFailure,
    effectiveFailedSectionLabels,
    realtimeAlertsPermissionLimited,
  }
}
