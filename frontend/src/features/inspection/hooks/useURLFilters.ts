import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * URL筛选参数管理Hook
 *
 * 功能：
 * 1. 从URL读取初始筛选条件
 * 2. 自动同步筛选条件到URL
 * 3. 支持刷新后保持筛选状态
 */

export interface URLFiltersState {
  page: number
  pageSize: number
  status: string
  startDate: string
  endDate: string
}

/**
 * URL 参数命名映射
 *
 * 前端使用 camelCase，后端/URL 使用 snake_case
 * 确保与后端 API 参数命名保持一致
 */
const URL_PARAM_MAP: Record<keyof URLFiltersState, string> = {
  page: 'page',
  pageSize: 'page_size',
  status: 'status',
  startDate: 'start_date',
  endDate: 'end_date'
}

export const useURLFilters = () => {
  const router = useRouter()
  const searchParams = useSearchParams()

  // 从 URL 读取初始值（使用 snake_case 参数名）
  const [filters, setFilters] = useState<URLFiltersState>(() => ({
    page: Number(searchParams.get(URL_PARAM_MAP.page)) || 1,
    pageSize: Number(searchParams.get(URL_PARAM_MAP.pageSize)) || 10,
    status: searchParams.get(URL_PARAM_MAP.status) || 'all',
    startDate: searchParams.get(URL_PARAM_MAP.startDate) || '',
    endDate: searchParams.get(URL_PARAM_MAP.endDate) || ''
  }))

  /**
   * 更新 URL 参数（不添加历史记录）
   *
   * 使用 snake_case 参数名写入 URL，确保与后端 API 一致
   */
  const updateURLParams = (updates: Partial<URLFiltersState>) => {
    const params = new URLSearchParams()

    Object.entries(updates).forEach(([key, value]) => {
      const urlKey = URL_PARAM_MAP[key as keyof URLFiltersState]
      if (value && value !== 'all') {
        params.set(urlKey, String(value))
      }
    })

    router.replace(`?${params.toString()}`, { scroll: false })
  }

  /**
   * 更新单个筛选条件
   */
  const updateFilter = <K extends keyof URLFiltersState>(
    key: K,
    value: URLFiltersState[K]
  ) => {
    setFilters((prev) => {
      const newFilters = { ...prev, [key]: value }

      // 当筛选条件变化时（非page和pageSize），重置到第一页
      if (key !== 'page' && key !== 'pageSize' && prev.page !== 1) {
        newFilters.page = 1
      }

      return newFilters
    })
  }

  /**
   * 批量更新筛选条件
   */
  const updateFilters = (updates: Partial<URLFiltersState>) => {
    setFilters((prev) => ({
      ...prev,
      ...updates
    }))
  }

  /**
   * 重置所有筛选条件
   */
  const resetFilters = () => {
    setFilters({
      page: 1,
      pageSize: 10,
      status: 'all',
      startDate: '',
      endDate: ''
    })
  }

  // 当筛选条件变化时，同步到 URL
  useEffect(() => {
    updateURLParams(filters)
  }, [filters])

  return {
    filters,
    updateFilter,
    updateFilters,
    resetFilters
  }
}
