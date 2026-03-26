# MonitoringView 重构实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 923 行的 `MonitoringView.tsx` 拆分为职责单一的 hook + 组件，使主文件精简至 ≤100 行。

**Architecture:** 提取 `useMonitoringPage` hook 封装所有状态与 WS 逻辑；提取 `shared/` 子目录放置内联 UI 子组件；提取 `sections/` 子目录放置 4 个 Section 渲染组件；将工具函数移入 `utils/monitoring.ts`。最终 MonitoringView.tsx 仅负责"搭积木"——组合 hook、Layout 与 Section。

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, Zustand, React Query, WebSocket

---

## 最终目标目录结构

```
features/monitoring/
├── components/
│   ├── MonitoringView.tsx          ← 精简后 ≤100 行
│   ├── ReportExportButton.tsx      ← 不动
│   ├── shared/                     ← NEW
│   │   ├── index.ts
│   │   ├── SectionHeader.tsx
│   │   └── SectionFailure.tsx
│   ├── sections/                   ← NEW
│   │   ├── index.ts
│   │   ├── StatsSection.tsx
│   │   ├── PerformanceSection.tsx
│   │   ├── StatusSection.tsx
│   │   └── NetworkSection.tsx
│   ├── cards/                      ← 不动
│   └── charts/                     ← 不动
├── hooks/
│   ├── useMonitoringV2.ts          ← 不动
│   └── useMonitoringPage.ts        ← NEW
└── utils/
    ├── monitoring-error.ts         ← 不动
    └── monitoring.ts               ← NEW
```

---

## Task 1: 提取工具函数与常量 → `utils/monitoring.ts`

**Files:**
- Create: `frontend/src/features/monitoring/utils/monitoring.ts`
- Modify: `frontend/src/features/monitoring/components/MonitoringView.tsx`（删除相关代码，改为 import）

**Step 1: 创建 `utils/monitoring.ts`**

```typescript
// frontend/src/features/monitoring/utils/monitoring.ts
import type { MonitoringSectionKey } from '../types'

export const TIME_RANGE_OPTIONS = [
  { value: '24h', label: '近24小时' },
  { value: '7d', label: '近7天' },
  { value: '30d', label: '近30天' },
] as const

export const MONITORING_SECTION_LABELS: Record<MonitoringSectionKey, string> = {
  stats: '关键指标',
  systemPerformance: '系统性能趋势',
  temperature: '设备温度监控',
  deviceStatus: '设备状态分布',
  availability: '整体可用性',
  networkTraffic: '网络流量',
  realtimeAlerts: '实时告警',
}

export function resolveTimeRangeLabel(timeRange: string): string {
  return TIME_RANGE_OPTIONS.find((item) => item.value === timeRange)?.label ?? timeRange
}

export function resolveMonitoringDataStaleThresholdMs(timeRange: string): number {
  switch (timeRange) {
    case '24h': return 10 * 60 * 1000
    case '7d':  return 2 * 60 * 60 * 1000
    case '30d': return 12 * 60 * 60 * 1000
    default:    return 10 * 60 * 1000
  }
}

export function formatDurationFromMs(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms))
  const seconds = Math.floor(safeMs / 1000)
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时`
  return `${Math.floor(hours / 24)} 天`
}
```

**Step 2: 验证文件内容正确（读取文件确认）**

**Step 3: Commit**

```bash
git add frontend/src/features/monitoring/utils/monitoring.ts
git commit -m "refactor(monitoring): extract utility functions to utils/monitoring.ts"
```

---

## Task 2: 提取共享 UI 子组件 → `components/shared/`

**Files:**
- Create: `frontend/src/features/monitoring/components/shared/SectionHeader.tsx`
- Create: `frontend/src/features/monitoring/components/shared/SectionFailure.tsx`
- Create: `frontend/src/features/monitoring/components/shared/index.ts`

**Step 1: 创建 `SectionHeader.tsx`**

```tsx
// frontend/src/features/monitoring/components/shared/SectionHeader.tsx
interface SectionHeaderProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
}

export function SectionHeader({ icon: Icon, title, description }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 dark:bg-primary/20">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  )
}
```

**Step 2: 创建 `SectionFailure.tsx`**

从 MonitoringView.tsx 的第 154-214 行完整复制 `SectionFailureContent`、`SectionFailureCard`、`SectionPermissionLimitedCard` 三个组件，放入此文件。

```tsx
// frontend/src/features/monitoring/components/shared/SectionFailure.tsx
'use client'

import { WifiOff, ShieldOff, RefreshCw } from 'lucide-react'
import { Button, Card, CardContent } from '@/components/atoms'

interface SectionFailureContentProps {
  title: string
  message: string
  onRetry: () => void
  className?: string
}

export function SectionFailureContent({ title, message, onRetry, className }: SectionFailureContentProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${className ?? ''}`}>
      <WifiOff className="h-6 w-6 text-red-600 dark:text-red-400" />
      <p className="mt-2 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      <Button variant="outline" onClick={onRetry} className="mt-3 cursor-pointer">
        <RefreshCw className="mr-2 h-4 w-4" />
        重试
      </Button>
    </div>
  )
}

interface SectionFailureCardProps {
  title: string
  message: string
  onRetry: () => void
}

export function SectionFailureCard({ title, message, onRetry }: SectionFailureCardProps) {
  return (
    <Card className="border-2 border-dashed border-red-200 bg-red-50/60 dark:border-red-800 dark:bg-red-900/10">
      <CardContent className="p-6">
        <SectionFailureContent title={title} message={message} onRetry={onRetry} />
      </CardContent>
    </Card>
  )
}

interface SectionPermissionLimitedCardProps {
  title: string
  message: string
}

export function SectionPermissionLimitedCard({ title, message }: SectionPermissionLimitedCardProps) {
  return (
    <Card className="border-2 border-dashed border-border bg-muted/40 dark:border-border dark:bg-muted/40">
      <CardContent className="p-6">
        <div className="flex flex-col items-center justify-center text-center">
          <ShieldOff className="h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{message}</p>
        </div>
      </CardContent>
    </Card>
  )
}
```

**Step 3: 创建 `shared/index.ts`**

```typescript
// frontend/src/features/monitoring/components/shared/index.ts
export { SectionHeader } from './SectionHeader'
export { SectionFailureContent, SectionFailureCard, SectionPermissionLimitedCard } from './SectionFailure'
```

**Step 4: Commit**

```bash
git add frontend/src/features/monitoring/components/shared/
git commit -m "refactor(monitoring): extract shared UI components to shared/"
```

---

## Task 3: 提取 `useMonitoringPage` Hook

**Files:**
- Create: `frontend/src/features/monitoring/hooks/useMonitoringPage.ts`

**Step 1: 创建 `useMonitoringPage.ts`**

该 Hook 封装 MonitoringView.tsx 第 217-494 行的所有状态逻辑。

```typescript
// frontend/src/features/monitoring/hooks/useMonitoringPage.ts
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
import type { MonitoringSectionKey } from '../types'

const REFRESH_DEBOUNCE_MS = 10_000
const REFRESH_MAX_WAIT_MS = 60_000

export function useMonitoringPage() {
  const canExportReport = usePermission(Permission.MONITORING_EXPORT)
  const canReadAlerts = usePermission(Permission.ALERTS_READ)
  const ws = useWebSocket()

  // ── 时间范围（持久化到 localStorage）──
  const [timeRange, setTimeRange] = useState<string>(() => {
    if (typeof window === 'undefined') return '24h'
    const stored = window.localStorage.getItem('monitoring:timeRange')
    if (stored && TIME_RANGE_OPTIONS.some((item) => item.value === stored)) return stored
    return '24h'
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('monitoring:timeRange', timeRange)
  }, [timeRange])

  // ── 页面可见性 ──
  const [pageVisible, setPageVisible] = useState(() => {
    if (typeof document === 'undefined') return true
    return document.visibilityState !== 'hidden'
  })

  useEffect(() => {
    if (typeof document === 'undefined') return
    const handleVisibilityChange = () => setPageVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // ── WS 健康度 ──
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [wsHealth, setWsHealth] = useState(() => ws.getHealthStatus())
  const lastWsConnectRefetchAtRef = useRef<number>(0)
  const lastStaleAutoRefetchAtRef = useRef<number>(0)
  const refetchRef = useRef<null | (() => unknown)>(null)

  useEffect(() => {
    if (!pageVisible) return
    const timer = setInterval(() => {
      const now = Date.now()
      setNowMs(now)
      const next = ws.getHealthStatus()
      setWsHealth((prev) => (prev === next ? prev : next))
    }, 10_000)
    return () => clearInterval(timer)
  }, [pageVisible, ws])

  // ── React Query ──
  const { data: envelope, isLoading, error, refetch, isRefetching } = useMonitoringV2({
    timeRange,
    enablePolling: pageVisible,
    refetchInterval: wsHealth === 'connected' ? 300000 : wsHealth === 'stale' ? 60000 : 120000,
  })
  refetchRef.current = refetch

  // ── WS 订阅 ──
  const subscribeDeviceMonitoring = useCallback(() => ws.subscribeToDeviceMonitoring(), [ws])
  const subscribeAlertsRoom = useCallback(() => {
    if (!canReadAlerts) return
    ws.subscribeToAlerts()
  }, [canReadAlerts, ws])

  const handleWsConnect = useCallback(() => {
    setNowMs(Date.now())
    setWsHealth('connected')
    if (!pageVisible) return
    subscribeDeviceMonitoring()
    subscribeAlertsRoom()
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

  useWebSocketEvent(WebSocketEvents.CONNECT, handleWsConnect)
  useWebSocketEvent(WebSocketEvents.DISCONNECT, handleWsDisconnect)

  useEffect(() => {
    if (!pageVisible) return
    if (wsHealth !== 'stale') return
    const now = Date.now()
    if (now - lastStaleAutoRefetchAtRef.current < 30_000) return
    lastStaleAutoRefetchAtRef.current = now
    void refetch()
  }, [pageVisible, refetch, wsHealth])

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

  // ── 受控刷新（debounce + max wait）──
  const firstRealtimeEventAtRef = useRef<number | null>(null)
  const scheduledRefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refetchDebounced = useCallback(() => {
    const now = Date.now()
    if (firstRealtimeEventAtRef.current === null) firstRealtimeEventAtRef.current = now
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
    if (scheduledRefetchTimerRef.current) clearTimeout(scheduledRefetchTimerRef.current)
    scheduledRefetchTimerRef.current = setTimeout(run, REFRESH_DEBOUNCE_MS)
  }, [refetch])

  useEffect(() => () => {
    if (scheduledRefetchTimerRef.current) clearTimeout(scheduledRefetchTimerRef.current)
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
  }, [timeRange])

  const handleRealtimeRefresh = useCallback((_payload: unknown) => {
    if (!pageVisible) return
    refetchDebounced()
  }, [pageVisible, refetchDebounced])

  const handleAlertRealtimeRefresh = useCallback((_payload: unknown) => {
    if (!canReadAlerts || !pageVisible) return
    refetchDebounced()
  }, [canReadAlerts, pageVisible, refetchDebounced])

  useWebSocketEvent(WebSocketEvents.NETWORK_STATS_UPDATE, handleRealtimeRefresh)
  useWebSocketEvent(WebSocketEvents.NEW_ALERT, handleAlertRealtimeRefresh)
  useWebSocketEvent(WebSocketEvents.ALERT_UPDATE, handleAlertRealtimeRefresh)
  useWebSocketEvent(WebSocketEvents.ALERT_RESOLVED, handleAlertRealtimeRefresh)

  // ── 计算值 ──
  const timeRangeLabel = useMemo(() => resolveTimeRangeLabel(timeRange), [timeRange])

  const lastUpdateAt = useMemo(() => {
    const raw = envelope?.lastUpdate
    if (!raw) return null
    const date = raw instanceof Date ? raw : new Date(String(raw))
    return Number.isNaN(date.getTime()) ? null : date
  }, [envelope?.lastUpdate])

  const lastUpdateLabel = useMemo(() => {
    if (!envelope?.lastUpdate) return null
    if (lastUpdateAt) return lastUpdateAt.toLocaleString()
    const fallback = String(envelope.lastUpdate).trim()
    return fallback !== '' ? fallback : null
  }, [envelope?.lastUpdate, lastUpdateAt])

  const dataStaleThresholdMs = useMemo(() => resolveMonitoringDataStaleThresholdMs(timeRange), [timeRange])

  const dataAgeMs = useMemo(() => {
    if (!lastUpdateAt) return null
    return Math.max(0, nowMs - lastUpdateAt.getTime())
  }, [lastUpdateAt, nowMs])

  const dataAgeLabel = useMemo(() => {
    if (dataAgeMs === null) return null
    return formatDurationFromMs(dataAgeMs)
  }, [dataAgeMs])

  const isDataStale = dataAgeMs !== null && dataAgeMs > dataStaleThresholdMs

  const failedSections = envelope?.failedSections ?? []

  const realtimeAlertsPermissionLimited =
    !canReadAlerts || envelope?.sections.realtimeAlerts?.limitedByPermission === true

  const effectiveFailedSections = realtimeAlertsPermissionLimited
    ? failedSections.filter((section) => section !== 'realtimeAlerts')
    : failedSections

  const hasEffectivePartialFailure = effectiveFailedSections.length > 0

  const effectiveFailedSectionLabels = useMemo(
    () => effectiveFailedSections.map((key) => MONITORING_SECTION_LABELS[key] ?? key),
    [effectiveFailedSections]
  )

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
    error,
    refetch,
    isRefetching,
    // 计算值
    lastUpdateLabel,
    isDataStale,
    dataAgeLabel,
    hasEffectivePartialFailure,
    effectiveFailedSectionLabels,
    realtimeAlertsPermissionLimited,
  }
}
```

**Step 2: 验证文件无 TypeScript 错误（读取确认）**

**Step 3: Commit**

```bash
git add frontend/src/features/monitoring/hooks/useMonitoringPage.ts
git commit -m "refactor(monitoring): extract useMonitoringPage hook"
```

---

## Task 4: 提取 4 个 Section 组件 → `components/sections/`

**Files:**
- Create: `frontend/src/features/monitoring/components/sections/StatsSection.tsx`
- Create: `frontend/src/features/monitoring/components/sections/PerformanceSection.tsx`
- Create: `frontend/src/features/monitoring/components/sections/StatusSection.tsx`
- Create: `frontend/src/features/monitoring/components/sections/NetworkSection.tsx`
- Create: `frontend/src/features/monitoring/components/sections/index.ts`

### 4a: `StatsSection.tsx`

对应 MonitoringView.tsx 第 727-779 行。

```tsx
// frontend/src/features/monitoring/components/sections/StatsSection.tsx
import Link from 'next/link'
import { Activity, Server, AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/atoms'
import { CompactStatCard } from '@/components/shared'
import { SectionHeader, SectionFailureContent } from '../shared'
import type { MonitoringDataV2, MonitoringDataEnvelope } from '../../types'

// 图标映射
const ICON_MAP = {
  total_devices: Server,
  availability: Activity,
  active_alerts: AlertTriangle,
  avg_cpu: Cpu,       // 需要从 lucide-react 导入
  avg_memory: HardDrive,
  avg_network: Network,
} as const

// 颜色映射
const COLOR_MAP = {
  total_devices: 'text-blue-600 dark:text-blue-400',
  availability: 'text-green-600 dark:text-green-400',
  active_alerts: 'text-red-600 dark:text-red-400',
  avg_cpu: 'text-teal-600 dark:text-teal-400',
  avg_memory: 'text-orange-600 dark:text-orange-400',
  avg_network: 'text-cyan-600 dark:text-cyan-400',
} as const
```

> **注意：** 上方 `Cpu`, `HardDrive`, `Network` 需在文件顶部从 `lucide-react` 导入。请按照 MonitoringView.tsx 第 727-779 行的实际 JSX 完整复制，保持逻辑一致。

**StatsSection 组件 props：**
```typescript
interface StatsSectionProps {
  section: MonitoringDataEnvelope['sections']['stats'] | undefined
  statsV2: MonitoringDataV2['statsV2']
  onRetry: () => void
}
```

### 4b: `PerformanceSection.tsx`

对应 MonitoringView.tsx 第 781-842 行。

```typescript
interface PerformanceSectionProps {
  chartsRef: React.RefObject<HTMLElement>
  chartsInView: boolean
  sectionSystemPerformance: MonitoringDataEnvelope['sections']['systemPerformance'] | undefined
  sectionTemperature: MonitoringDataEnvelope['sections']['temperature'] | undefined
  systemPerformance: MonitoringDataV2['systemPerformance']
  temperatureHistory: MonitoringDataV2['temperatureHistory']
  timeRange: string
  onRetry: () => void
}
```

### 4c: `StatusSection.tsx`

对应 MonitoringView.tsx 第 844-886 行。

```typescript
interface StatusSectionProps {
  sectionDeviceStatus: MonitoringDataEnvelope['sections']['deviceStatus'] | undefined
  sectionAvailability: MonitoringDataEnvelope['sections']['availability'] | undefined
  sectionRealtimeAlerts: MonitoringDataEnvelope['sections']['realtimeAlerts'] | undefined
  deviceStatusDistribution: MonitoringDataV2['deviceStatusDistribution']
  availability: MonitoringDataV2['availability']
  realtimeAlerts: MonitoringDataV2['realtimeAlerts']
  realtimeAlertsPermissionLimited: boolean
  requiredAlertsPermission: string
  onRetry: () => void
}
```

### 4d: `NetworkSection.tsx`

对应 MonitoringView.tsx 第 888-916 行。

```typescript
interface NetworkSectionProps {
  networkRef: React.RefObject<HTMLElement>
  networkInView: boolean
  sectionNetworkTraffic: MonitoringDataEnvelope['sections']['networkTraffic'] | undefined
  networkTrafficHistory: MonitoringDataV2['networkTrafficHistory']
  timeRange: string
  onRetry: () => void
}
```

### 4e: `sections/index.ts`

```typescript
export { StatsSection } from './StatsSection'
export { PerformanceSection } from './PerformanceSection'
export { StatusSection } from './StatusSection'
export { NetworkSection } from './NetworkSection'
```

**Step: Commit**

```bash
git add frontend/src/features/monitoring/components/sections/
git commit -m "refactor(monitoring): extract section components to sections/"
```

---

## Task 5: 精简 `MonitoringView.tsx`

**Files:**
- Modify: `frontend/src/features/monitoring/components/MonitoringView.tsx`（全量重写）

**目标：** 删除全部内联代码，仅保留 import + hook 调用 + 状态渲染分支 + JSX 组合。

```tsx
// frontend/src/features/monitoring/components/MonitoringView.tsx
'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useSidebar } from '@/lib/contexts/sidebar-context'
import { Permission } from '@/lib/types/auth.types'
import { Sidebar } from '@/features/dashboard/components/Sidebar'
import { DashboardHeader } from '@/features/dashboard'
import { Button, Badge, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/atoms'
import { WifiOff, DatabaseZap, RefreshCw, AlertTriangle, ShieldOff } from 'lucide-react'
import { useInView } from '@/hooks'
import { resolveMonitoringErrorView } from '../utils/monitoring-error'
import { TIME_RANGE_OPTIONS } from '../utils/monitoring'
import { useMonitoringPage } from '../hooks/useMonitoringPage'
import { ReportExportButton } from './ReportExportButton'
import { StatsSection, PerformanceSection, StatusSection, NetworkSection } from './sections'
import { Card, CardContent } from '@/components/atoms'
import { ChartSkeleton } from './charts'

export function MonitoringView() {
  const { sidebarOpen, toggleSidebar } = useSidebar()
  const page = useMonitoringPage()
  const { ref: chartsRef, inView: chartsInView } = useInView(
    useMemo(() => ({ threshold: 0.1, triggerOnce: true, rootMargin: '100px' }), [])
  )
  const { ref: networkRef, inView: networkInView } = useInView(
    useMemo(() => ({ threshold: 0.1, triggerOnce: true, rootMargin: '100px' }), [])
  )

  const layout = (children: React.ReactNode) => (
    <div className="min-h-screen bg-muted/40 dark:bg-background">
      <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} currentPath="/monitoring" />
      <div className={`${sidebarOpen ? 'ml-64' : 'ml-20'} transition-all duration-300`}>
        <DashboardHeader title="监控中心" showSearch={false} />
        {children}
      </div>
    </div>
  )

  // ── 加载态 ──
  if (page.isLoading) {
    return layout(
      <main className="p-5">
        {/* 骨架屏（保留原有 grid 布局不变）*/}
        ...
      </main>
    )
  }

  // ── 错误态 ──
  const errorView = page.error ? resolveMonitoringErrorView(page.error) : null
  if (page.error) {
    return layout(
      <main className="flex h-[calc(100vh-80px)] items-center justify-center p-5">
        {/* 错误视图（保留原有内容不变）*/}
        ...
      </main>
    )
  }

  // ── 无数据态 ──
  if (!page.data) {
    return layout(
      <main className="flex h-[calc(100vh-80px)] items-center justify-center">
        <div className="text-center">
          <DatabaseZap className="mx-auto mb-3 h-10 w-10 text-muted-foreground/80" />
          <p className="text-muted-foreground">无法加载监控数据</p>
        </div>
      </main>
    )
  }

  // ── 正常渲染 ──
  return (
    <div className="min-h-screen bg-muted/40 dark:bg-background">
      <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} currentPath="/monitoring" />
      <div className={`${sidebarOpen ? 'ml-64' : 'ml-20'} transition-all duration-300`}>
        <DashboardHeader
          title="监控中心"
          alertCount={page.canReadAlerts
            ? (page.data.realtimeAlerts?.filter(a => a.severity === 'critical')?.length ?? 0)
            : 0}
          showSearch={false}
          actions={<MonitoringHeaderActions page={page} />}
        />
        <main className="p-5">
          <div className="space-y-6">
            {/* 警告横幅 */}
            {page.hasEffectivePartialFailure && <PartialFailureBanner page={page} />}
            {!page.hasEffectivePartialFailure && page.realtimeAlertsPermissionLimited && (
              <PermissionLimitedBanner permission={Permission.ALERTS_READ} />
            )}
            {/* 4 个 Section */}
            <StatsSection
              section={page.envelope?.sections.stats}
              statsV2={page.data.statsV2}
              onRetry={page.refetch}
            />
            <PerformanceSection
              chartsRef={chartsRef}
              chartsInView={chartsInView}
              sectionSystemPerformance={page.envelope?.sections.systemPerformance}
              sectionTemperature={page.envelope?.sections.temperature}
              systemPerformance={page.data.systemPerformance}
              temperatureHistory={page.data.temperatureHistory}
              timeRange={page.timeRange}
              onRetry={page.refetch}
            />
            <StatusSection
              sectionDeviceStatus={page.envelope?.sections.deviceStatus}
              sectionAvailability={page.envelope?.sections.availability}
              sectionRealtimeAlerts={page.envelope?.sections.realtimeAlerts}
              deviceStatusDistribution={page.data.deviceStatusDistribution}
              availability={page.data.availability}
              realtimeAlerts={page.data.realtimeAlerts}
              realtimeAlertsPermissionLimited={page.realtimeAlertsPermissionLimited}
              requiredAlertsPermission={Permission.ALERTS_READ}
              onRetry={page.refetch}
            />
            <NetworkSection
              networkRef={networkRef}
              networkInView={networkInView}
              sectionNetworkTraffic={page.envelope?.sections.networkTraffic}
              networkTrafficHistory={page.data.networkTrafficHistory}
              timeRange={page.timeRange}
              onRetry={page.refetch}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
```

> **注意：** `MonitoringHeaderActions`、`PartialFailureBanner`、`PermissionLimitedBanner` 是文件内的小型内联函数组件，只负责渲染 Header 右侧操作区和两种横幅。它们足够简单（<30行），不需要单独提取。

**Step: Commit**

```bash
git add frontend/src/features/monitoring/components/MonitoringView.tsx
git commit -m "refactor(monitoring): slim down MonitoringView to orchestration-only"
```

---

## Task 6: 验证重构完整性

**Step 1: 检查 TypeScript 编译无错误**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -50
```

期望输出：无错误（0 个 error）

**Step 2: 检查无遗漏导入**

确认以下文件全部存在且导出正确：
- `utils/monitoring.ts` → 导出 5 个函数/常量
- `components/shared/index.ts` → 导出 4 个组件
- `components/sections/index.ts` → 导出 4 个组件
- `hooks/useMonitoringPage.ts` → 导出 1 个 hook

**Step 3: 检查 MonitoringView.tsx 行数**

```bash
wc -l frontend/src/features/monitoring/components/MonitoringView.tsx
```

期望：≤ 150 行

**Step 4: 最终 Commit**

```bash
git add .
git commit -m "refactor(monitoring): complete MonitoringView decomposition - 923L→<150L"
```

---

## 重构前后对比

| 维度 | 重构前 | 重构后 |
|------|--------|--------|
| MonitoringView.tsx | 923 行 | ≤150 行 |
| 职责数量 | 状态+WS+UI+渲染 = 4 | 仅组合（orchestration）= 1 |
| 可测试性 | 难（状态与视图耦合）| 易（hook 独立可测试）|
| 可复用性 | 无 | Section 组件可单独使用 |
| 文件数量 | 1 | 9（均 ≤200 行）|
| 层级约束 | 违反（单文件超大）| 符合（每层 ≤8 文件）|
