'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuditLogs } from '../../hooks/useAuditLogs'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Activity, FileText, ShieldCheck, Download, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { EmptyState } from '../shared/EmptyState'
import { AuditLogDetailDialog } from './AuditLogDetailDialog'
import { toast } from 'react-hot-toast'
import type { AuditAction, AuditLog } from '../../types/audit.types'
import type { SettingsStatCardDescriptor } from '@/features/settings/types/shell.types'
import { useSettingsTabCapabilities } from '@/features/settings/hooks/useSettingsTabCapabilities'

// 操作映射（供本组件及详情弹窗共用，此处 export 供详情组件复用）
export const actionLabels: Record<AuditAction, string> = {
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
    <Badge className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 gap-1">
      <CheckCircle className="w-3 h-3" />
      成功
    </Badge>
  ) : (
    <Badge className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 gap-1">
      <XCircle className="w-3 h-3" />
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
    stats,
    isLoading,
    error,
    refetch,
    updateQueryParams,
    exportLogs,
  } = useAuditLogs()

  // 搜索关键词
  const [keyword, setKeyword] = useState('')

  // 高级筛选状态
  const [filterAction, setFilterAction] = useState<AuditAction | ''>('')
  const [filterStatus, setFilterStatus] = useState<'success' | 'failed' | ''>('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')

  // 详情弹窗
  const [detailLog, setDetailLog] = useState<AuditLog | null>(null)

  // 筛选变化时触发查询（排除初始挂载无筛选的情况）
  useEffect(() => {
    if (filterAction || filterStatus || filterStartDate || filterEndDate) {
      updateQueryParams({
        action: filterAction || undefined,
        status: filterStatus || undefined,
        startDate: filterStartDate ? new Date(filterStartDate).toISOString() : undefined,
        endDate: filterEndDate ? new Date(filterEndDate + 'T23:59:59').toISOString() : undefined,
        page: 1,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAction, filterStatus, filterStartDate, filterEndDate])

  // 清除所有筛选
  const handleClearFilters = useCallback(() => {
    setFilterAction('')
    setFilterStatus('')
    setFilterStartDate('')
    setFilterEndDate('')
    updateQueryParams({
      action: undefined,
      status: undefined,
      startDate: undefined,
      endDate: undefined,
      page: 1,
    })
  }, [updateQueryParams])

  // 是否有活跃筛选
  const hasActiveFilters = Boolean(filterAction || filterStatus || filterStartDate || filterEndDate)

  // 处理导出
  const handleExport = useCallback(async () => {
    try {
      await exportLogs()
      toast.success('审计日志导出成功！')
    } catch (err) {
      toast.error('导出失败：' + (err as Error).message)
    }
  }, [exportLogs])

  // 高级筛选器 JSX（注入 toolbar.filters 插槽）
  const filters = useMemo(() => (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={filterAction}
        onValueChange={(v) => setFilterAction(v === '_all' ? '' : v as AuditAction)}
      >
        <SelectTrigger className="h-9 w-[110px] text-sm" aria-label="筛选操作类型">
          <SelectValue placeholder="操作类型" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">全部操作</SelectItem>
          {Object.entries(actionLabels).map(([value, label]) => (
            <SelectItem key={value} value={value}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filterStatus}
        onValueChange={(v) => setFilterStatus(v === '_all' ? '' : v as 'success' | 'failed')}
      >
        <SelectTrigger className="h-9 w-[100px] text-sm" aria-label="筛选状态">
          <SelectValue placeholder="状态" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">全部状态</SelectItem>
          <SelectItem value="success">成功</SelectItem>
          <SelectItem value="failed">失败</SelectItem>
        </SelectContent>
      </Select>

      <input
        type="date"
        aria-label="开始日期"
        value={filterStartDate}
        onChange={(e) => setFilterStartDate(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
      />
      <input
        type="date"
        aria-label="结束日期"
        value={filterEndDate}
        onChange={(e) => setFilterEndDate(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
      />

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={handleClearFilters}>
          清除筛选
        </Button>
      )}
    </div>
  ), [filterAction, filterStatus, filterStartDate, filterEndDate, hasActiveFilters, handleClearFilters])

  const toolbar = useMemo(
    () => ({
      search: {
        value: keyword,
        placeholder: '搜索日志...',
        ariaLabel: '搜索审计日志',
        onChange: setKeyword,
        onSubmit: () => updateQueryParams({ keyword, page: 1 }),
      },
      filters,
    }),
    [keyword, updateQueryParams, filters]
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

  // Shell 统计卡
  const statsDescriptors = useMemo((): SettingsStatCardDescriptor[] => {
    if (!stats) return []
    return [
      {
        key: 'total',
        title: '总日志数',
        value: stats.totalLogs.toLocaleString(),
        icon: FileText,
        iconClassName: 'text-blue-600 dark:text-blue-400',
      },
      {
        key: 'today',
        title: '今日日志',
        value: stats.todayLogs.toLocaleString(),
        icon: Activity,
        iconClassName: 'text-green-600 dark:text-green-400',
      },
      {
        key: 'rate',
        title: '操作成功率',
        value: `${Math.round(stats.successRate * 100)}%`,
        icon: ShieldCheck,
        iconClassName: 'text-amber-600 dark:text-amber-400',
      },
    ]
  }, [stats])

  useSettingsTabCapabilities('audit', {
    stats: statsDescriptors,
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
      {/* 详情弹窗 */}
      <AuditLogDetailDialog
        open={Boolean(detailLog)}
        log={detailLog}
        onOpenChange={(open) => {
          if (!open) setDetailLog(null)
        }}
      />

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
              description="当前筛选条件下暂无数据，可尝试调整关键词或筛选条件后再查询。"
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
                  <tr
                    key={log.id}
                    className="hover:bg-muted/40 cursor-pointer transition-colors"
                    onClick={() => setDetailLog(log)}
                    title="点击查看详情"
                  >
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
              第 {page} 页 / 共 {Math.ceil(totalCount / pageSize)} 页（{totalCount.toLocaleString()} 条记录）
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
