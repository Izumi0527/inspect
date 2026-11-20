'use client'

import { Pagination } from '@/components/atoms/pagination'
import type {
  CrossModulePermissions,
  HostMatrixItem,
} from '../../types/zabbix-monitoring.types'
import { HostMatrixRow } from './HostMatrixRow'

export interface HostsMatrixTableProps {
  items: HostMatrixItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  isLoading: boolean
  isError: boolean
  errorMessage?: string
  permissions?: CrossModulePermissions
  selectedIds: number[]
  onToggleSelect: (deviceId: number) => void
  onToggleSelectAllPage: (checked: boolean) => void
  onTogglePin: (deviceId: number, currentlyPinned: boolean) => void
  onSelectHost: (deviceId: number) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

export function HostsMatrixTable({
  items,
  total,
  page,
  pageSize,
  totalPages,
  isLoading,
  isError,
  errorMessage,
  permissions,
  selectedIds,
  onToggleSelect,
  onToggleSelectAllPage,
  onTogglePin,
  onSelectHost,
  onPageChange,
  onPageSizeChange,
}: HostsMatrixTableProps) {
  const inspectionsAllowed = permissions ? permissions.inspections.allowed : true
  const logsAllowed = permissions ? permissions.logs.allowed : true
  const selectedSet = new Set(selectedIds)
  const allPageSelected =
    items.length > 0 && items.every((item) => selectedSet.has(item.id))

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="h-8 border-b border-border bg-surface-2 text-muted-foreground">
              <th className="w-9 px-2.5 font-medium">
                <input
                  type="checkbox"
                  aria-label="全选当前页设备"
                  checked={allPageSelected}
                  onChange={(e) => onToggleSelectAllPage(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-input accent-primary"
                />
              </th>
              <th className="w-8 px-1.5 font-medium" aria-label="关注" />
              <th className="min-w-48 px-2.5 font-medium">设备 / IP / 分组</th>
              <th className="min-w-36 px-2.5 font-medium">三协议连通</th>
              <th className="px-2.5 text-right font-medium">CPU</th>
              <th className="px-2.5 text-right font-medium">内存</th>
              <th className="px-2.5 text-right font-medium">温度</th>
              <th className="px-2.5 text-right font-medium">Ping 延迟</th>
              <th className="px-2.5 text-right font-medium">端口 / 硬件</th>
              <th className="px-2.5 text-right font-medium">最近巡检分</th>
              <th className="px-2.5 text-right font-medium">异常日志</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && items.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  正在加载设备监控矩阵...
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-sm text-danger">
                  {errorMessage || '设备监控矩阵加载失败'}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  当前筛选条件下暂无纳管设备
                </td>
              </tr>
            ) : (
              items.map((host) => (
                <HostMatrixRow
                  key={host.id}
                  host={host}
                  selected={selectedSet.has(host.id)}
                  inspectionsAllowed={inspectionsAllowed}
                  logsAllowed={logsAllowed}
                  onToggleSelect={onToggleSelect}
                  onTogglePin={onTogglePin}
                  onSelectHost={onSelectHost}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={page}
        totalPages={Math.max(1, totalPages)}
        totalItems={total}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        className="border-t border-border"
      />
    </div>
  )
}
