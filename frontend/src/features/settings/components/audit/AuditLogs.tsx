'use client'

import { useState } from 'react'
import { useAuditLogs } from '../../hooks/useAuditLogs'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { FileText, Download, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import type { AuditAction } from '../../types/audit.types'

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
    stats,
    isLoading,
    updateQueryParams,
    exportLogs,
  } = useAuditLogs()

  const [keyword, setKeyword] = useState('')

  // 处理导出
  const handleExport = async () => {
    try {
      await exportLogs()
      toast.success('审计日志导出成功！')
    } catch (err) {
      toast.error('导出失败：' + (err as Error).message)
    }
  }

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
      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">总日志数</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.totalLogs.toLocaleString()}</p>
              </div>
              <FileText className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">今日日志</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {stats.todayLogs.toLocaleString()}
                </p>
              </div>
              <FileText className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">成功率</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {(stats.successRate * 100).toFixed(1)}%
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-purple-600 dark:text-purple-400" />
            </div>
          </Card>
        </div>
      )}

      {/* 操作栏 */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 flex items-center gap-2">
            <Input
              placeholder="搜索日志..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  updateQueryParams({ keyword, page: 1 })
                }
              }}
              className="max-w-md"
            />
            <Button
              variant="outline"
              onClick={() => updateQueryParams({ keyword, page: 1 })}
            >
              搜索
            </Button>
          </div>
          <Button onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            导出日志
          </Button>
        </div>
      </Card>

      {/* 日志列表 */}
      <Card className="flex-1 flex flex-col min-h-0">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">时间</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">用户</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">操作</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">资源</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">详情</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">IP地址</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{formatDate(log.createdAt)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{log.username}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{actionLabels[log.action]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{log.resource}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-xs truncate" title={log.details}>
                    {log.details}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono text-xs">{log.ipAddress}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={log.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {totalCount > pageSize && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
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
