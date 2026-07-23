'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/contexts/auth-context'
import { fetchDisplayPreferences } from '@/features/settings/api/general.api'
import {
  resetDatetimeDisplayPreferences,
  setDatetimeDisplayPreferences,
} from '@/utils/formatters'

export const DATETIME_DISPLAY_PREFERENCES_QUERY_KEY = ['datetime-display-preferences'] as const

/**
 * 登录后拉取时间显示偏好（system.timezone + user_preference.time_format）
 * 并注入时间格式化中央工具；登出或加载失败时回退浏览器本地时区 + 24 时制。
 *
 * 已知限制：偏好变更只影响之后渲染的时间文本（模块级状态不触发全局重渲染），
 * 设置页保存后会 invalidate 本 query，新渲染内容随即生效。
 */
export function useDatetimePreferencesSync(): void {
  const { isAuthenticated } = useAuth()

  const { data } = useQuery({
    queryKey: DATETIME_DISPLAY_PREFERENCES_QUERY_KEY,
    queryFn: fetchDisplayPreferences,
    enabled: isAuthenticated,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

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
}
