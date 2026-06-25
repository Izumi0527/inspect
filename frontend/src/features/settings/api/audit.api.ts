import { API_PREFIX, authorizedDownload, getApiOrigin, httpClient } from '@/lib/api-client'
import type {
  AuditLogListResponse,
  AuditStats,
  AuditLogQueryParams,
} from '../types/audit.types'

/**
 * 审计日志 API
 */
export const auditApi = {
  /**
   * 获取审计日志列表（支持分页、筛选）
   */
  getAuditLogs: async (params: AuditLogQueryParams = {}): Promise<AuditLogListResponse> => {
    const {
      page = 1,
      pageSize = 50,
      userId,
      action,
      resource,
      status,
      startDate,
      endDate,
      keyword,
    } = params

    const queryParams: Record<string, any> = {
      page,
      page_size: pageSize,
    }

    if (userId) queryParams.user_id = userId
    if (action) queryParams.action = action
    if (resource) queryParams.resource = resource
    if (status) queryParams.status = status
    if (startDate) queryParams.start_date = startDate
    if (endDate) queryParams.end_date = endDate
    if (keyword) queryParams.keyword = keyword

    // 后端返回的实际字段名（snake_case）
    const response = await httpClient.get<{
      items: Array<{
        id: string
        user_id: string | null
        username: string | null
        action: string
        resource_type: string
        resource_id: string | null
        description: string
        details: string | null
        ip_address: string | null
        user_agent: string | null
        status: string
        error_message: string | null
        created_at: string
      }>
      total: number
      page: number
      pageSize: number
    }>('/settings/audit/logs', { params: queryParams })

    // 映射为前端期望的格式（camelCase）
    return {
      logs: response.items.map(item => ({
        id: item.id,
        userId: item.user_id || '',
        username: item.username || '',
        action: item.action as any,
        resource: item.resource_type,
        resourceId: item.resource_id || undefined,
        details: item.description,
        ipAddress: item.ip_address || '',
        userAgent: item.user_agent || '',
        status: item.status as 'success' | 'failed',
        errorMessage: item.error_message || undefined,
        createdAt: item.created_at,
      })),
      totalCount: response.total,
      page: response.page,
      pageSize: response.pageSize,
    }
  },

  /**
   * 获取审计统计信息
   */
  getAuditStats: async (): Promise<AuditStats> => {
    // 后端返回的实际字段名（snake_case）
    const response = await httpClient.get<{
      total_logs: number
      logs_today: number
      logs_this_week: number
      logs_this_month: number
      logs_by_action: Record<string, number>
      logs_by_status: Record<string, number>
      logs_by_resource_type: Record<string, number>
      top_active_users: Array<{ username: string; count: number }>
      top_actions: Array<{ action: string; count: number }>
      failed_operations_count: number
      failed_operations_rate: number
    }>('/settings/audit/stats')

    // 计算成功率（后端返回的是失败率百分比）
    const successRate = response.total_logs > 0
      ? (100 - response.failed_operations_rate) / 100
      : 1.0

    // 映射为前端期望的格式（camelCase）
    return {
      totalLogs: response.total_logs,
      todayLogs: response.logs_today,
      successRate: successRate,
      topUsers: response.top_active_users,
      topActions: response.top_actions as any,
    }
  },

  /**
   * 导出审计日志
   */
  exportAuditLogs: async (params: AuditLogQueryParams = {}): Promise<void> => {
    // 构建导出请求体（匹配后端 ExportLogsRequest 格式）
    const requestBody = {
      format: 'csv', // 支持的格式：csv, excel, json
      startDate: params.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 默认最近30天
      endDate: params.endDate || new Date().toISOString(),
      filters: {} as Record<string, any>,
    }

    // 添加可选筛选条件
    if (params.userId) requestBody.filters.user_id = params.userId
    if (params.action) requestBody.filters.action = params.action
    if (params.resource) requestBody.filters.resource = params.resource
    if (params.status) requestBody.filters.status = params.status
    if (params.keyword) requestBody.filters.keyword = params.keyword

    // 调用后端API接口（POST /api/v1/settings/audit/logs/export）
    // ✅ 兼容前后端分离部署：使用 NEXT_PUBLIC_API_URL 走后端绝对地址
    const response = await authorizedDownload(`${getApiOrigin()}${API_PREFIX}/settings/audit/logs/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      throw new Error('导出审计日志失败')
    }

    // 后端返回StreamingResponse（CSV文件流）
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  },
}
