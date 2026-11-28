import React, { useMemo } from 'react'
import { AlertCircle, X, RefreshCw } from 'lucide-react'
import { Card, CardContent, Button } from '@/components/atoms'

/**
 * 执行记录空状态组件
 *
 * 默认内嵌于一体式数据面板，也可作为独立卡片展示。
 */

interface Props {
  hasFilters: boolean
  onClearFilters?: () => void
  onRefresh?: () => void
  embedded?: boolean
}

export const ExecutionEmptyState: React.FC<Props> = React.memo(({
  hasFilters,
  onClearFilters,
  onRefresh,
  embedded = true,
}) => {
  const content = useMemo(() => {
    if (hasFilters) {
      return {
        title: '未找到匹配的执行记录',
        description: '当前筛选条件下没有找到执行记录，请尝试调整筛选条件',
      }
    }

    return {
      title: '暂无执行记录',
      description: '还没有执行过巡检任务，开始第一次巡检吧',
    }
  }, [hasFilters])

  const body = (
    <div className="flex flex-col items-center gap-3 max-w-sm mx-auto">
      {/* 图标 */}
      <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center text-muted-foreground">
        <AlertCircle className="w-6 h-6" />
      </div>

      {/* 文本内容 */}
      <div>
        <h3 className="text-base font-semibold text-foreground">
          {content.title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{content.description}</p>
      </div>

      {/* 快速操作按钮 */}
      {hasFilters && (onClearFilters || onRefresh) && (
        <div className="flex gap-2 mt-1">
          {onClearFilters && (
            <Button variant="outline" onClick={onClearFilters} className="cursor-pointer">
              <X className="w-4 h-4 mr-1.5" />
              清除筛选
            </Button>
          )}
          {onRefresh && (
            <Button variant="default" onClick={onRefresh} className="cursor-pointer">
              <RefreshCw className="w-4 h-4 mr-1.5" />
              刷新数据
            </Button>
          )}
        </div>
      )}
    </div>
  )

  if (embedded) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center px-6 py-12 text-center">
        {body}
      </div>
    )
  }

  return (
    <Card>
      <CardContent className="p-12 text-center">
        {body}
      </CardContent>
    </Card>
  )
})

ExecutionEmptyState.displayName = 'ExecutionEmptyState'
