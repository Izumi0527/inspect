'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/contexts/auth-context'
import { fetchDisplayPreferences } from '@/features/settings/api/general.api'
import {
  resetDatetimeDisplayPreferences,
  setDatetimeDisplayPreferences,
} from '@/utils/formatters'

export const DATETIME_DISPLAY_PREFERENCES_QUERY_KEY = ['datetime-display-preferences'] as const

/**
 * 读取展示偏好（system.timezone + user_preference.time_format + application_name）。
 * 与 useDatetimePreferencesSync 共享同一 query 缓存；设置页保存后 invalidate
 * 该 key，消费方（侧边栏标题等）随即更新。
 */
export function useDisplayPreferences() {
  const { isAuthenticated } = useAuth()

  return useQuery({
    queryKey: DATETIME_DISPLAY_PREFERENCES_QUERY_KEY,
    queryFn: fetchDisplayPreferences,
    enabled: isAuthenticated,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
}

/**
 * 登录后拉取展示偏好并注入：
 * - 时区/12h 制注入时间格式化中央工具（utils/formatters）
 * - 应用名称注入 document.title（依赖 pathname，路由切换被 Next metadata
 *   重置后重新覆盖）
 * 登出或加载失败时回退浏览器本地时区 + 24 时制，标题交还 Next 默认值。
 *
 * 已知限制：偏好变更只影响之后渲染的时间文本（模块级状态不触发全局重渲染），
 * 设置页保存后会 invalidate 本 query，新渲染内容随即生效。
 */
export function useDatetimePreferencesSync(): void {
  const { isAuthenticated } = useAuth()
  const pathname = usePathname()
  const { data } = useDisplayPreferences()

  useEffect(() => {
    if (!isAuthenticated) {
      resetDatetimeDisplayPreferences()
      return
    }
    if (data) {
      setDatetimeDisplayPreferences({
        timeZone: data.timezone,
        hour12: data.time_format === '12h',
      })
    }
  }, [isAuthenticated, data])

  useEffect(() => {
    if (!isAuthenticated) return
    const name = data?.application_name?.trim()
    if (name) {
      document.title = name
    }
  }, [isAuthenticated, data, pathname])
}
