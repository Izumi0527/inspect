/**
 * 屏蔽关键字状态：localStorage 持久化 + 输入防抖。
 *
 * 屏蔽关键字是"视图偏好"而非"临时筛选"——噪声是持续存在的，用户不该每次进页面都重输；
 * 告警中心与日志中心各用一个 storageKey 共享这套行为。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { splitExcludeKeywords } from '@/utils/excludeKeywords'

export const EXCLUDE_KEYWORDS_DEBOUNCE_MS = 350

export interface ExcludeKeywordsState {
  /** 输入框实时值 */
  excludeQuery: string
  setExcludeQuery: (value: string) => void
  /** 防抖后的值，用于发请求；清空时即时生效 */
  debouncedExcludeQuery: string
  /** debouncedExcludeQuery 切分后的关键字列表 */
  excludeKeywords: string[]
}

function readStorage(key: string): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    if (value) {
      window.localStorage.setItem(key, value)
    } else {
      window.localStorage.removeItem(key)
    }
  } catch {
    // 隐私模式或被策略禁用：静默降级为会话内状态
  }
}

export function useExcludeKeywords(storageKey: string): ExcludeKeywordsState {
  const [excludeQuery, setExcludeQueryState] = useState(() => readStorage(storageKey))
  // 初始值直接生效，避免首屏先发一次不带屏蔽的请求再被防抖值覆盖
  const [debouncedExcludeQuery, setDebouncedExcludeQuery] = useState(excludeQuery)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setExcludeQuery = useCallback((value: string) => {
    setExcludeQueryState(value)
  }, [])

  useEffect(() => {
    writeStorage(storageKey, excludeQuery)
  }, [storageKey, excludeQuery])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    const value = excludeQuery.trim()
    if (!value) {
      setDebouncedExcludeQuery('')
      return
    }

    timerRef.current = setTimeout(() => {
      setDebouncedExcludeQuery(value)
    }, EXCLUDE_KEYWORDS_DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [excludeQuery])

  const excludeKeywords = useMemo(
    () => splitExcludeKeywords(debouncedExcludeQuery),
    [debouncedExcludeQuery],
  )

  return useMemo(
    () => ({ excludeQuery, setExcludeQuery, debouncedExcludeQuery, excludeKeywords }),
    [excludeQuery, setExcludeQuery, debouncedExcludeQuery, excludeKeywords],
  )
}
