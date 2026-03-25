'use client'

import { useCallback, useMemo, useState } from 'react'
import { useAuditLogs } from '../../hooks/useAuditLogs'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { FileText, Download, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { EmptyState } from '../shared/EmptyState'
import { toast } from 'react-hot-toast'
import type { AuditAction } from '../../types/audit.types'
import { useSettingsTabCapabilities } from '@/features/settings/hooks/useSettingsTabCapabilities'

// 操作映射
const actionLabels: Record<AuditAction, string> = {
  login: '登录',
  logout: '登出',
  create: '创建',
  update: '更新',
  delete: '删除',
  export: '导出',
  import: '导入',
  config_change: '配置变更',
}

// 状态Badge
function StatusBadge({ status }: { status: 'success' | 'failed' }) {
  return status === 'success' ? (
    <Badge className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
      <CheckCircle className="w-3 h-3 mr-1" />
      成功
    </Badge>
  ) : (
    <Badge className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
      <XCircle className="w-3 h-3 mr-1" />
      失败
    </Badge>
  )
}

// 格式化日期
function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString('zh-CN')
}

export function AuditLogs() {
  const {
    logs,
    totalCount,
    page,
    pageSize,
    isLoading,
    error,
    refetch,
    updateQueryParams,
    exportLogs,
  } = useAuditLogs()

  const [keyword, setKeyword] = useState('')

  // 处理导出
  const handleExport = useCallback(async () => {
    try {
      await exportLogs()
      toast.success('审计日志导出成功！')
    } catch (err) {
      toast.error('导出失败：' + (err as Error).message)
    }
  }, [exportLogs])

  const toolbar = useMemo(
    () => ({
      search: {
        value: keyword,
        placeholder: '搜索日志...',
        ariaLabel: '搜索审计日志',
        onChange: setKeyword,
        onSubmit: () => updateQueryParams({ keyword, page: 1 }),
      },
    }),
    [keyword, page, updateQueryParams]
  )

  const primaryActions = useMemo(
    () => [
      {
        key: 'export-logs',
        label: '导出日志',
        icon: <Download className="w-4 h-4 mr-2" />,
        onClick: () => void handleExport(),
      },
    ],
    [handleExport]
  )

  const secondaryActions = useMemo(
    () => [
      {
        key: 'refresh',
        label: '刷新',
        icon: <RefreshCw className="w-4 h-4 mr-2" />,
        disabled: Boolean(isLoading),
        onClick: () => void refetch(),
      },
    ],
    [isLoading, refetch]
  )

  useSettingsTabCapabilities('audit', {
    toolbar,
    primaryActions,
    secondaryActions,
  })

  // 加载状态
  if (isLoading && !logs.length) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 flex-1 flex flex-col min-h-0">
      {/* 日志列表 */}
      <Card className="flex-1 flex flex-col min-h-0">
        {error && !logs.length ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={AlertCircle}
              title="加载审计日志失败"
              description={(error as Error).message || '无法连接到服务器，请稍后重试'}
              action={{
                label: '重试',
                onClick: () => void refetch(),
              }}
            />
          </div>
        ) : !logs.length ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={FileText}
              title="暂无审计日志"
              description="当前筛选条件下暂无数据，可尝试调整关键词后再查询。"
            />
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">时间</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">用户</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">操作</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">资源</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">详情</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">IP地址</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(log.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{log.username}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{actionLabels[log.action]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{log.resource}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate" title={log.details}>
                      {log.details}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{log.ipAddress}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={log.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {totalCount > pageSize && (
          <div className="px-4 py-3 border-t border-border flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              共 {totalCount.toLocaleString()} 条记录，第 {page} 页
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateQueryParams({ page: page - 1 })}
                disabled={page <= 1}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateQueryParams({ page: page + 1 })}
                disabled={page * pageSize >= totalCount}
              >
                下一页
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
