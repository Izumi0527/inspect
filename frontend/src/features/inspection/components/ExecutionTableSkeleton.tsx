import React from 'react'
import { Card, CardContent } from '@/components/atoms'

/**
 * 执行记录表格加载骨架屏
 *
 * 模拟真实表格结构，提供更好的加载体验
 */

interface Props {
  rows?: number
}

export const ExecutionTableSkeleton: React.FC<Props> = ({ rows = 5 }) => {
  const headers = ['策略信息', '执行状态', '进度', '巡检结果', '执行时间', '操作']

  return (
    <Card>
      <CardContent className="p-6">
        {/* 表头骨架 */}
        <div className="grid grid-cols-6 gap-4 pb-4 border-b border-gray-200">
          {headers.map((header) => (
            <div
              key={header}
              className="h-4 bg-gray-200 rounded animate-pulse"
            ></div>
          ))}
        </div>

        {/* 表格行骨架 */}
        {[...Array(rows)].map((_, index) => (
          <div
            key={index}
            className="grid grid-cols-6 gap-4 py-4 border-b border-gray-100"
          >
            {/* 策略信息 */}
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse"></div>
              <div className="h-3 bg-gray-100 rounded w-1/2 animate-pulse"></div>
            </div>

            {/* 执行状态 */}
            <div className="h-4 bg-gray-200 rounded w-2/3 animate-pulse"></div>

            {/* 进度 */}
            <div className="space-y-2">
              <div className="h-2 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-3 bg-gray-100 rounded w-1/2 animate-pulse"></div>
            </div>

            {/* 巡检结果 */}
            <div className="space-y-2">
              <div className="h-5 bg-gray-200 rounded w-12 animate-pulse"></div>
              <div className="h-3 bg-gray-100 rounded w-3/4 animate-pulse"></div>
            </div>

            {/* 执行时间 */}
            <div className="space-y-2">
              <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-3 bg-gray-100 rounded w-2/3 animate-pulse"></div>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-1">
              <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
