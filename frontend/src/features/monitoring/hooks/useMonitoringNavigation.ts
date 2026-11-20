'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { MonitoringTabKey } from '../types/zabbix-monitoring.types'

const VALID_TABS: ReadonlySet<MonitoringTabKey> = new Set([
  'overview',
  'hosts',
  'latest',
  'templates',
  'triggers',
  'maintenance',
])

const KIOSK_REFRESH_SECONDS = 30

function parseTabParam(raw: string | null): MonitoringTabKey {
  const val = raw?.trim().toLowerCase() ?? ''
  return VALID_TABS.has(val as MonitoringTabKey) ? (val as MonitoringTabKey) : 'overview'
}

function parsePositiveIntParam(raw: string | null): number | null {
  const trimmed = raw?.trim() ?? ''
  if (!/^\d+$/.test(trimmed)) return null
  const num = Number.parseInt(trimmed, 10)
  return Number.isSafeInteger(num) && num > 0 ? num : null
}

function parseKioskParam(raw: string | null): boolean {
  const val = raw?.trim().toLowerCase() ?? ''
  return val === '1' || val === 'true'
}

export interface MonitoringNavigationState {
  activeTab: MonitoringTabKey
  setActiveTab: (tab: MonitoringTabKey) => void
  activeGroupId: number | null
  setActiveGroupId: (groupId: number | null) => void
  selectedHostId: number | null
  setSelectedHostId: (hostId: number | null) => void
  initialHostStatusFilter: string | null
  setInitialHostStatusFilter: (status: string | null) => void
  navigateToHostsWithStatus: (status: string | null) => void
  compareYesterday: boolean
  setCompareYesterday: (enabled: boolean) => void
  isKioskMode: boolean
  setIsKioskMode: (enabled: boolean) => void
  kioskCountdownSec: number
  resetKioskCountdown: () => void
}

export function useMonitoringNavigation(
  onAutoRefresh: () => void
): MonitoringNavigationState {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [activeTab, setActiveTabState] = useState<MonitoringTabKey>(() =>
    parseTabParam(searchParams.get('tab'))
  )
  const [activeGroupId, setActiveGroupId] = useState<number | null>(() =>
    parsePositiveIntParam(searchParams.get('groupId'))
  )
  const [selectedHostId, setSelectedHostId] = useState<number | null>(() =>
    parsePositiveIntParam(searchParams.get('hostId'))
  )
  const [initialHostStatusFilter, setInitialHostStatusFilter] = useState<string | null>(
    () => {
      const raw = searchParams.get('status')?.trim()
      return raw ? raw : null
    }
  )
  const [compareYesterday, setCompareYesterday] = useState(false)
  const [isKioskMode, setIsKioskModeState] = useState<boolean>(() =>
    parseKioskParam(searchParams.get('kiosk'))
  )
  const [kioskCountdownSec, setKioskCountdownSec] = useState(KIOSK_REFRESH_SECONDS)

  const setActiveTab = useCallback((tab: MonitoringTabKey) => {
    setActiveTabState(tab)
  }, [])

  const navigateToHostsWithStatus = useCallback((status: string | null) => {
    setInitialHostStatusFilter(status)
    setActiveTabState('hosts')
  }, [])

  const setIsKioskMode = useCallback((enabled: boolean) => {
    setIsKioskModeState(enabled)
    setKioskCountdownSec(KIOSK_REFRESH_SECONDS)
    if (enabled) {
      setActiveTabState('overview')
    }
  }, [])

  const resetKioskCountdown = useCallback(() => {
    setKioskCountdownSec(KIOSK_REFRESH_SECONDS)
  }, [])

  // 同步 URL 查询参数 (?tab=...&groupId=...&hostId=...&kiosk=1)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const next = new URLSearchParams()
    if (activeTab !== 'overview') next.set('tab', activeTab)
    if (activeGroupId !== null && activeGroupId > 0) next.set('groupId', String(activeGroupId))
    if (selectedHostId !== null && selectedHostId > 0) next.set('hostId', String(selectedHostId))
    if (isKioskMode) next.set('kiosk', '1')

    const nextQuery = next.toString()
    const currentQuery = window.location.search.replace(/^\?/, '')
    if (nextQuery !== currentQuery) {
      const target = nextQuery ? `${pathname}?${nextQuery}` : pathname
      router.replace(target, { scroll: false })
    }
  }, [activeTab, activeGroupId, selectedHostId, isKioskMode, pathname, router])

  // 值班投屏模式：Esc 退出 + 30s 自动刷新倒计时
  useEffect(() => {
    if (!isKioskMode) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsKioskModeState(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    const timer = window.setInterval(() => {
      setKioskCountdownSec((prev) => {
        if (prev <= 1) {
          onAutoRefresh()
          return KIOSK_REFRESH_SECONDS
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.clearInterval(timer)
    }
  }, [isKioskMode, onAutoRefresh])

  return {
    activeTab,
    setActiveTab,
    activeGroupId,
    setActiveGroupId,
    selectedHostId,
    setSelectedHostId,
    initialHostStatusFilter,
    setInitialHostStatusFilter,
    navigateToHostsWithStatus,
    compareYesterday,
    setCompareYesterday,
    isKioskMode,
    setIsKioskMode,
    kioskCountdownSec,
    resetKioskCountdown,
  }
}
