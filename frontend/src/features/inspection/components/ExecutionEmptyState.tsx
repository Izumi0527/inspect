import React, { useMemo } from 'react'
import { AlertCircle, X, RefreshCw } from 'lucide-react'
import { Card, CardContent, Button } from '@/components/atoms'

/**
 * 执行记录空状态组件
 *
 * 根据不同场景显示友好的提示信息和快速操作
 */

interface Props {
  hasFilters: boolean
  onClearFilters?: () => void
  onRefresh?: () => void
}

export const ExecutionEmptyState: React.FC<Props> = React.memo(({
  hasFilters,
  onClearFilters,
  onRefresh
}) => {
  // 使用 useMemo 缓存内容计算
  const content = useMemo(() => {
    if (hasFilters) {
      return {
        title: '未找到匹配的执行记录',
        description: '当前筛选条件下没有找到执行记录，请尝试调整筛选条件'
      }
    }

    return {
      title: '暂无执行记录',
      description: '还没有执行过巡检任务，开始第一次巡检吧'
    }
  }, [hasFilters])

  return (
    <Card>
      <CardContent className="p-12 text-center">
        <div className="flex flex-col items-center gap-4 max-w-md mx-auto">
          {/* 图标 */}
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-gray-400 dark:text-gray-500" />
          </div>

          {/* 文本内容 */}
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {content.title}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{content.description}</p>
          </div>

          {/* 快速操作按钮 */}
          {hasFilters && (onClearFilters || onRefresh) && (
            <div className="flex gap-2 mt-2">
              {onClearFilters && (
                <Button variant="outline" onClick={onClearFilters}>
                  <X className="w-4 h-4 mr-2" />
                  清除筛选
                </Button>
              )}
              {onRefresh && (
                <Button variant="default" onClick={onRefresh}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  刷新数据
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
})
