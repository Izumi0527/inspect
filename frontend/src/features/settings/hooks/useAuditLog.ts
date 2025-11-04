import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { auditLogApi } from '../api/settings.api'
import { showErrorToast, handleDownload } from './utils/toastHandlers'
import toast from 'react-hot-toast'

export const useAuditLogs = (params?: {
  page?: number
  pageSize?: number
  userId?: string
  action?: string
  status?: string
  search?: string
  startDate?: string
  endDate?: string
}) => {
  return useQuery({
    queryKey: ['settings', 'audit', 'logs', params],
    queryFn: () => auditLogApi.getLogs(params),
    staleTime: 1 * 60 * 1000, // 1分钟缓存
  })
}

export const useAuditLog = (id: string) => {
  return useQuery({
    queryKey: ['settings', 'audit', 'logs', 'detail', id],
    queryFn: () => auditLogApi.getLog(id),
    enabled: !!id,
  })
}

export const useExportAuditLogs = () => {
  return useMutation({
    mutationFn: auditLogApi.exportLogs,
    onSuccess: (blob, variables) => {
      handleDownload(blob, 'audit_logs', variables.format)
      toast.success('审计日志导出成功')
    },
    onError: (error: Error) => {
      showErrorToast(error, '审计日志导出失败')
    },
  })
}

export const useCleanupAuditLogs = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: auditLogApi.cleanupLogs,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'audit', 'logs'] })
      const count = data.deletedCount || 0
      toast.success(`已清理 ${count} 条日志记录`)
    },
    onError: (error: Error) => {
      showErrorToast(error, '日志清理失败')
    },
  })
}