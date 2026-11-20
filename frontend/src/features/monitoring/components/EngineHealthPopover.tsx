'use client'

import { useContext, useState } from 'react'
import { QueryClientContext, useQuery } from '@tanstack/react-query'
import { Activity, AlertCircle, Clock, Layers, RefreshCw } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/atoms/popover'
import { formatDateTimeYMDHMS } from '@/utils/formatters'
import { getEngineHealth } from '../api/monitoring-hosts.api'
import type { EngineHealthSnapshot } from '../types/zabbix-monitoring.types'

interface EngineHealthPopoverProps {
  onSelectHost?: (deviceId: number) => void
}

function EngineHealthPillButton({
  health,
  onClick,
}: {
  health?: EngineHealthSnapshot
  onClick?: () => void
}) {
  const backoffCount = health?.backoff_devices ?? 0
  const failedCount = health?.failed_devices ?? 0
  const hasWarn = backoffCount > 0 || failedCount > 0

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="采集引擎健康状态"
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={`h-2 w-2 rounded-full ${hasWarn ? 'bg-warning' : 'bg-success'}`}
        aria-hidden="true"
      />
      <span>实时采样</span>
      {health && (
        <span className="text-muted-foreground tabular-nums">
          {health.duration_ms}ms
        </span>
      )}
      {backoffCount > 0 && (
        <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[11px] font-semibold text-warning-soft-foreground tabular-nums">
          退避 {backoffCount}
        </span>
      )}
    </button>
  )
}

function EngineHealthPopoverInner({ onSelectHost }: EngineHealthPopoverProps) {
  const [open, setOpen] = useState(false)
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['monitoring-engine-health'],
    queryFn: getEngineHealth,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  })

  const finishedAtLabel = data?.last_round_finished_at
    ? formatDateTimeYMDHMS(new Date(data.last_round_finished_at))
    : '-'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span className="inline-flex">
          <EngineHealthPillButton health={data} />
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-88 p-4">
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">采集引擎状态</span>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>

        {isLoading ? (
          <p className="py-4 text-center text-xs text-muted-foreground">正在读取引擎快照...</p>
        ) : isError || !data ? (
          <p className="py-4 text-center text-xs text-danger">引擎健康数据获取失败</p>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-border bg-surface-2/60 p-2">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  本轮采集耗时
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground tabular-nums">
                  {data.duration_ms} ms
                </div>
              </div>
              <div className="rounded-md border border-border bg-surface-2/60 p-2">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Layers className="h-3.5 w-3.5" />
                  写入队列长度
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground tabular-nums">
                  {data.pending_write_queue}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-md border border-border p-2 text-center text-xs">
              <div>
                <div className="text-muted-foreground">成功设备</div>
                <div className="mt-0.5 font-semibold text-success tabular-nums">
                  {data.success_devices}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">异常设备</div>
                <div className="mt-0.5 font-semibold text-danger tabular-nums">
                  {data.failed_devices}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">退避熔断</div>
                <div className="mt-0.5 font-semibold text-warning tabular-nums">
                  {data.backoff_devices}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>上次完成</span>
              <span className="tabular-nums">{finishedAtLabel}</span>
            </div>

            {data.backoff_device_list.length > 0 ? (
              <div className="space-y-1.5 border-t border-border pt-2">
                <div className="flex items-center gap-1 text-xs font-medium text-warning-soft-foreground">
                  <AlertCircle className="h-3.5 w-3.5 text-warning" />
                  退避熔断设备 ({data.backoff_device_list.length})
                </div>
                <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                  {data.backoff_device_list.map((item) => (
                    <button
                      key={item.device_id}
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        onSelectHost?.(item.device_id)
                      }}
                      className="w-full rounded-md border border-border bg-surface-2/50 p-2 text-left transition-colors hover:bg-accent"
                    >
                      <div className="flex items-center justify-between text-xs font-medium text-foreground">
                        <span className="truncate">
                          {item.device_name || `设备 #${item.device_id}`}
                        </span>
                        <span className="shrink-0 text-[11px] text-warning tabular-nums">
                          连败 {item.consecutive_failures} 次
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                        {item.last_error_message || '采集异常，已降频等待恢复'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-md bg-success-soft/60 px-2.5 py-2 text-xs text-success-soft-foreground">
                全部纳管设备采集链路运行正常，无退避熔断设备。
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

export function EngineHealthPopover({ onSelectHost }: EngineHealthPopoverProps) {
  const queryClient = useContext(QueryClientContext)
  if (!queryClient) {
    return <EngineHealthPillButton />
  }
  return <EngineHealthPopoverInner onSelectHost={onSelectHost} />
}
