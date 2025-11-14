import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { auditApi } from '../api/audit.api'
import type {
  AuditLogListResponse,
  AuditStats,
  AuditLogQueryParams,
} from '../types/audit.types'

/**
 * 审计日志 Hook
 */
export function useAuditLogs() {
  const [queryParams, setQueryParams] = useState<AuditLogQueryParams>({
    page: 1,
    pageSize: 50,
  })

  // 获取审计日志列表
  const {
    data: logsData,
    isLoading,
    error,
  } = useQuery<AuditLogListResponse>({
    queryKey: ['auditLogs', queryParams],
    queryFn: () => auditApi.getAuditLogs(queryParams),
    staleTime: 1000 * 60, // 1分钟缓存
  })

  // 获取审计统计
  const { data: statsData } = useQuery<AuditStats>({
    queryKey: ['auditStats'],
    queryFn: auditApi.getAuditStats,
    staleTime: 1000 * 60 * 5, // 5分钟缓存
  })

  // 更新查询参数
  const updateQueryParams = useCallback((params: Partial<AuditLogQueryParams>) => {
    setQueryParams((prev) => ({ ...prev, ...params }))
  }, [])

  // 导出日志
  const exportLogs = useCallback(async () => {
    await auditApi.exportAuditLogs(queryParams)
  }, [queryParams])

  return {
    // 数据
    logs: logsData?.logs || [],
    totalCount: logsData?.totalCount || 0,
    page: logsData?.page || 1,
    pageSize: logsData?.pageSize || 50,
    stats: statsData,
    queryParams,

    // 状态
    isLoading,
    error,

    // 方法
    updateQueryParams,
    exportLogs,
  }
}
