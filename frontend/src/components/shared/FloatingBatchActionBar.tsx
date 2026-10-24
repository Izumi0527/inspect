import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, CheckSquare } from 'lucide-react'
import { Button } from '@/components/atoms/button'
import { cn } from '@/utils/cn'

export interface FloatingBatchActionBarProps {
  /** 当前选中的条数 */
  selectedCount: number
  /** 当前选择模式：'explicit' 逐项显式选择，'all_filtered' 全选筛选结果 */
  selectionMode?: 'explicit' | 'all_filtered'
  /** 总可选项数 */
  totalCount?: number
  /** 当前页是否处于全选状态 */
  isAllCurrentPageSelected?: boolean
  /** 点击全选当前页回调 */
  onSelectCurrentPage: () => void
  /** 点击全选筛选结果回调 */
  onSelectAllFiltered?: () => void
  /** 点击反选当前页回调 */
  onInvertCurrentPage: () => void
  /** 点击取消选择回调 */
  onClearSelection: () => void
  /** 点击删除按钮回调 */
  onDelete?: () => void
  /** 是否显示删除按钮，默认 true */
  showDelete?: boolean
  /** 额外的操作按钮 */
  extraActions?: Array<{
    key: string
    label: string
    icon?: React.ReactNode
    onClick: () => void
    disabled?: boolean
  }>
  /** 是否正在执行删除中 */
  isDeleting?: boolean
  /** 自定义类名 */
  className?: string
}

export const FloatingBatchActionBar: React.FC<FloatingBatchActionBarProps> = ({
  selectedCount,
  selectionMode = 'explicit',
  onSelectCurrentPage,
  onSelectAllFiltered,
  onInvertCurrentPage,
  onClearSelection,
  onDelete,
  showDelete = true,
  extraActions,
  isDeleting = false,
  className,
}) => {
  const Container = AnimatePresence ?? React.Fragment

  return (
    <Container>
      {selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 24, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: 24, x: '-50%' }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          role="region"
          aria-label="批量操作栏"
          className={cn(
            'fixed bottom-6 left-1/2 -translate-x-1/2 z-40',
            'flex items-center gap-2 sm:gap-3',
            'px-4 py-2.5 rounded-2xl',
            'bg-background/95 dark:bg-card/95 backdrop-blur-md',
            'border border-border/80 shadow-2xl dark:shadow-black/60',
            'text-sm text-foreground',
            className
          )}
        >
          {/* 已选计数摘要 */}
          <div className="flex items-center gap-1.5 font-medium whitespace-nowrap pl-1">
            <CheckSquare className="w-4 h-4 text-primary shrink-0" />
            <span>
              {selectionMode === 'all_filtered'
                ? `已全选筛选结果 (${selectedCount} 项)`
                : `已选择 ${selectedCount} 项`}
            </span>
          </div>

          <div className="h-4 w-px bg-border my-auto shrink-0" />

          {/* 选项操作按钮组 */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={onSelectCurrentPage}
            >
              全选当前页
            </Button>
            {onSelectAllFiltered && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={onSelectAllFiltered}
              >
                全选筛选结果
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={onInvertCurrentPage}
            >
              反选当前页
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={onClearSelection}
            >
              取消选择
            </Button>
          </div>

          {/* 附加动作按钮 */}
          {extraActions && extraActions.length > 0 && (
            <>
              <div className="h-4 w-px bg-border my-auto shrink-0" />
              <div className="flex items-center gap-1">
                {extraActions.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    disabled={action.disabled}
                    onClick={action.onClick}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {action.icon}
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* 红色删除字样按钮 */}
          {showDelete && onDelete && (
            <>
              <div className="h-4 w-px bg-border my-auto shrink-0" />
              <Button
                variant="ghost"
                size="sm"
                disabled={isDeleting}
                onClick={onDelete}
                className={cn(
                  'h-8 px-3 font-semibold text-xs',
                  'text-red-600 dark:text-red-400',
                  'hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-300',
                  'transition-colors duration-150'
                )}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                删除
              </Button>
            </>
          )}
        </motion.div>
      )}
    </Container>
  )
}
