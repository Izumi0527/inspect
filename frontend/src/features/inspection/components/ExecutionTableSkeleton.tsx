import React from 'react'

/**
 * 执行记录表格加载骨架屏
 *
 * 与一体式主数据面板结构保持一致，全部采用三皮肤语义 Token。
 */

interface Props {
  rows?: number
}

export const ExecutionTableSkeleton: React.FC<Props> = ({ rows = 5 }) => {
  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4">
      {/* 顶部工具栏骨架 */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-1">
        <div className="flex items-center gap-3">
          <div className="h-9 w-72 rounded-lg bg-muted/60 animate-pulse" />
          <div className="h-9 w-28 rounded-lg bg-muted/60 animate-pulse" />
        </div>
        <div className="h-9 w-20 rounded-lg bg-muted/60 animate-pulse" />
      </div>

      {/* 一体式面板骨架 */}
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
        {/* 表头骨架 */}
        <div className="grid grid-cols-6 gap-4 border-b border-border bg-muted/40 px-4 py-3">
          <div className="h-3.5 w-20 rounded bg-muted animate-pulse" />
          <div className="h-3.5 w-16 rounded bg-muted animate-pulse" />
          <div className="h-3.5 w-20 rounded bg-muted animate-pulse" />
          <div className="h-3.5 w-16 rounded bg-muted animate-pulse" />
          <div className="h-3.5 w-16 rounded bg-muted animate-pulse" />
          <div className="h-3.5 w-12 rounded bg-muted animate-pulse justify-self-end" />
        </div>

        {/* 表格行骨架 */}
        <div className="flex-1 divide-y divide-border overflow-hidden">
          {[...Array(rows)].map((_, index) => (
            <div
              key={index}
              className="grid grid-cols-6 items-center gap-4 px-4 py-3.5 animate-pulse"
            >
              {/* 策略与触发 */}
              <div className="space-y-2">
                <div className="h-4 w-3/4 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted/60" />
              </div>

              {/* 执行状态 */}
              <div className="h-5 w-16 rounded-md bg-muted" />

              {/* 覆盖设备 / 进度 */}
              <div className="space-y-2">
                <div className="h-3 w-24 rounded bg-muted/60" />
                <div className="h-1.5 w-32 rounded-full bg-muted" />
              </div>

              {/* 巡检结果 */}
              <div className="space-y-1.5">
                <div className="h-5 w-12 rounded bg-muted" />
                <div className="h-3 w-24 rounded bg-muted/60" />
              </div>

              {/* 执行时间 */}
              <div className="space-y-1.5">
                <div className="h-4 w-32 rounded bg-muted" />
                <div className="h-3 w-16 rounded bg-muted/60" />
              </div>

              {/* 操作按钮 */}
              <div className="flex justify-end gap-1.5">
                <div className="h-7 w-7 rounded bg-muted" />
                <div className="h-7 w-7 rounded bg-muted" />
                <div className="h-7 w-7 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>

        {/* 吸底分页条骨架 */}
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <div className="h-4 w-32 rounded bg-muted/60 animate-pulse" />
          <div className="h-7 w-48 rounded bg-muted/60 animate-pulse" />
        </div>
      </div>
    </div>
  )
}
