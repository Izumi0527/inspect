'use client'

import { AlertTriangle, Info, Search } from 'lucide-react'
import { Pagination } from '@/components/atoms/pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDateTimeMDHMS } from '@/utils/formatters'
import {
  MAX_COMPARISON_SERIES,
  buildMetricSelectionId,
  useLatestData,
} from '../../hooks/useLatestData'
import type { LatestDataItem } from '../../types/zabbix-monitoring.types'
import { AdhocComparisonChart } from './AdhocComparisonChart'
import {
  APPLICATION_TAG_OPTIONS,
  getApplicationTagLabel,
  getLatestDataDeltaToneClass,
  resolveLatestDataDeltaDisplay,
  resolveLatestDataPortLabel,
} from './latestDataHelpers'

export interface LatestDataTabProps {
  activeGroupId: number | null
  selectedDeviceIds: number[]
  onSelectHost: (deviceId: number) => void
}

function LatestMetricRow({
  item,
  checked,
  onToggle,
  onSelectHost,
}: {
  item: LatestDataItem
  checked: boolean
  onToggle: () => void
  onSelectHost: (deviceId: number) => void
}) {
  const portLabel = resolveLatestDataPortLabel(item)
  const deltaDisplay = resolveLatestDataDeltaDisplay(item)
  const deltaToneClass = getLatestDataDeltaToneClass(item)

  return (
    <tr className="h-9 border-b border-border/60 bg-card transition-colors hover:bg-accent/50">
      <td className="px-2.5 py-1.5">
        <input
          type="checkbox"
          aria-label={`选择对比 ${item.device_name} ${item.metric_label}`}
          checked={checked}
          onChange={onToggle}
          className="h-3.5 w-3.5 rounded border-input accent-primary"
        />
      </td>
      <td className="px-2.5 py-1.5">
        <button
          type="button"
          onClick={() => onSelectHost(item.device_id)}
          className="text-left font-medium text-primary hover:underline"
        >
          {item.device_name}
        </button>
        <div className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {item.ip_address}
        </div>
      </td>
      <td className="px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-foreground">{item.metric_label}</span>
          {portLabel !== '整机' && portLabel !== '—' && (
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {portLabel}
            </span>
          )}
        </div>
        <div className="font-mono text-[10px] text-muted-foreground/80">
          {item.item_key}
        </div>
      </td>
      <td className="px-2.5 py-1.5">
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {getApplicationTagLabel(item.application_tag)}
        </span>
      </td>
      <td className="px-2.5 py-1.5 text-right tabular-nums">
        <span
          className={`font-semibold ${
            item.is_abnormal ? 'text-danger' : 'text-foreground'
          }`}
        >
          {item.display_value}
        </span>
      </td>
      <td className={`px-2.5 py-1.5 text-right tabular-nums ${deltaToneClass}`}>
        {deltaDisplay}
      </td>
      <td className="px-2.5 py-1.5 text-right text-muted-foreground tabular-nums">
        {formatDateTimeMDHMS(item.collected_at)}
      </td>
    </tr>
  )
}

export function LatestDataTab({
  activeGroupId,
  selectedDeviceIds,
  onSelectHost,
}: LatestDataTabProps) {
  const state = useLatestData({ activeGroupId, selectedDeviceIds })
  const pageData = state.latestQuery.data
  const items = pageData?.items ?? []
  const selectedIdSet = new Set(state.selectedSeries.map((s) => s.id))
  const showLargeNetworkHint =
    !state.hasNarrowingFilter && !state.onlyAbnormalOrChanged

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={state.deviceFilterId !== null ? String(state.deviceFilterId) : 'all'}
            onValueChange={(val) =>
              state.setDeviceFilterId(
                val === 'all' ? null : Number.parseInt(val, 10)
              )
            }
          >
            <SelectTrigger aria-label="按设备筛选指标" className="h-9 w-auto gap-2 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部设备</SelectItem>
              {state.devices.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {`${d.name} (${d.ipAddress})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={state.applicationTag || 'all'}
            onValueChange={(val) => state.setApplicationTag(val === 'all' ? '' : val)}
          >
            <SelectTrigger aria-label="按指标分类筛选" className="h-9 w-auto gap-2 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APPLICATION_TAG_OPTIONS.map((opt) => (
                <SelectItem key={opt.label} value={opt.value || 'all'}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={state.search}
              onChange={(e) => state.setSearch(e.target.value)}
              placeholder="搜索指标名、端口或主机..."
              aria-label="搜索实时指标"
              className="h-9 w-52 rounded-lg border border-input bg-surface-2/50 pl-8 pr-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-foreground">
            <input
              type="checkbox"
              role="switch"
              aria-checked={state.onlyAbnormalOrChanged}
              checked={state.onlyAbnormalOrChanged}
              onChange={(e) => state.setOnlyAbnormalOrChanged(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-input accent-primary"
            />
            <span>仅看异常与近期变动</span>
          </label>
          <span className="text-muted-foreground tabular-nums">
            已勾选对比 {state.selectedSeries.length}/{MAX_COMPARISON_SERIES}
          </span>
        </div>
      </div>

      {showLargeNetworkHint && (
        <div className="flex items-center gap-2 rounded-xl border border-info/30 bg-info-soft/50 px-3.5 py-2 text-xs text-info-soft-foreground">
          <Info className="h-4 w-4 shrink-0" />
          <span>
            大网提示：当前未限定设备或分组，建议开启「仅看异常与近期变动」或按设备/分组聚焦，避免全网指标刷屏。
          </span>
        </div>
      )}

      {state.limitNotice && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning-soft/60 px-3.5 py-2 text-xs text-warning-soft-foreground"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{state.limitNotice}</span>
        </div>
      )}

      <AdhocComparisonChart
        data={state.adhocQuery.data}
        selectedSeries={state.selectedSeries}
        isLoading={state.adhocQuery.isLoading}
        timeRange={state.timeRange}
        onTimeRangeChange={state.setTimeRange}
        onRemoveSeries={state.removeSeries}
        onClearAll={state.clearSeries}
      />

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="h-8 border-b border-border bg-surface-2 text-muted-foreground">
                <th className="w-9 px-2.5 font-medium">对比</th>
                <th className="px-2.5 font-medium">设备 / IP</th>
                <th className="px-2.5 font-medium">指标名称</th>
                <th className="px-2.5 font-medium">分类</th>
                <th className="px-2.5 text-right font-medium">最新值</th>
                <th className="px-2.5 text-right font-medium">较上次变化</th>
                <th className="px-2.5 text-right font-medium">采集时间</th>
              </tr>
            </thead>
            <tbody>
              {state.latestQuery.isLoading && items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    正在加载实时指标明细...
                  </td>
                </tr>
              ) : state.latestQuery.isError ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-danger">
                    {state.latestQuery.error?.message || '实时指标明细加载失败'}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    暂无匹配的实时指标记录
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const id = buildMetricSelectionId(
                    item.device_id,
                    item.metric_name,
                    item.interface_name
                  )
                  return (
                    <LatestMetricRow
                      key={id}
                      item={item}
                      checked={selectedIdSet.has(id)}
                      onToggle={() => state.toggleSeries(item)}
                      onSelectHost={onSelectHost}
                    />
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={pageData?.page ?? state.page}
          totalPages={Math.max(1, pageData?.total_pages ?? 1)}
          totalItems={pageData?.total ?? 0}
          pageSize={pageData?.page_size ?? state.pageSize}
          onPageChange={state.setPage}
          onPageSizeChange={state.setPageSize}
          className="border-t border-border"
        />
      </div>
    </div>
  )
}
