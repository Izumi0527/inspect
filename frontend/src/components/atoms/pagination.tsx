import React from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from './button'
import { PageSizeSelect } from '@/components/atoms/page-size-select'
import { PAGE_SIZE_OPTIONS } from '@/constants/pagination'
import { cn } from '@/utils/cn'

export interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
  pageSizeOptions?: readonly number[]
  /** 「每页条数」选择器的前置标签，全站默认统一为「每页」。 */
  sizeChangerLabel?: string
  /** 是否渲染左侧「显示 X - Y / 共 Z 条」区间文案。 */
  showRangeText?: boolean
  /** 是否渲染「跳至第 N 页」输入框。 */
  showJumpToPage?: boolean
  onPageChange: (page: number) => void
  /**
   * 每页条数变更回调。
   *
   * 契约：本组件只负责上报新的条数，**不再擅自回调 `onPageChange`**。
   * 「切换条数后回到第 1 页」由调用方在该回调内完成，保证全站行为一致。
   */
  onPageSizeChange?: (pageSize: number) => void
  showPageSizeSelector?: boolean
  className?: string
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  sizeChangerLabel = '每页',
  showRangeText = true,
  showJumpToPage = false,
  onPageChange,
  onPageSizeChange,
  showPageSizeSelector = true,
  className
}) => {
  // 计算显示的页码范围
  const getPageNumbers = () => {
    const pages: (number | string)[] = []
    const maxVisiblePages = 7 // 最多显示7个页码按钮

    if (totalPages <= maxVisiblePages) {
      // 如果总页数小于等于最大可见页数，显示所有页码
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // 否则，智能显示页码
      if (currentPage <= 4) {
        // 当前页在前面
        for (let i = 1; i <= 5; i++) {
          pages.push(i)
        }
        pages.push('...')
        pages.push(totalPages)
      } else if (currentPage >= totalPages - 3) {
        // 当前页在后面
        pages.push(1)
        pages.push('...')
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i)
        }
      } else {
        // 当前页在中间
        pages.push(1)
        pages.push('...')
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i)
        }
        pages.push('...')
        pages.push(totalPages)
      }
    }

    return pages
  }

  const pages = getPageNumbers()
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages || page === currentPage) return
    onPageChange(page)
  }

  const handlePageSizeChange = (newPageSize: number) => {
    // 只上报新条数；页码归位由调用方决定，避免组件与调用方各改一次页码。
    onPageSizeChange?.(newPageSize)
  }

  // 「跳至第 N 页」输入框：受控并跟随当前页同步，避免翻页后残留旧值。
  const [jumpValue, setJumpValue] = React.useState(String(currentPage))
  React.useEffect(() => {
    setJumpValue(String(currentPage))
  }, [currentPage])

  const commitJump = () => {
    const parsed = Number.parseInt(jumpValue, 10)
    const upperBound = Math.max(totalPages, 1)
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= upperBound) {
      handlePageChange(parsed)
    }
    setJumpValue(String(currentPage))
  }

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-4', className)}>
      {/* 左侧：总数信息和每页条数选择器 */}
      <div className="flex flex-wrap items-center gap-4">
        {showRangeText && (
          <div className="text-sm text-muted-foreground">
            显示 <span className="font-medium">{startItem}</span> - <span className="font-medium">{endItem}</span>{' '}
            / 共 <span className="font-medium">{totalItems}</span> 条
          </div>
        )}

        {showPageSizeSelector && onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{sizeChangerLabel}</span>
            <PageSizeSelect
              value={pageSize}
              options={pageSizeOptions}
              onChange={handlePageSizeChange}
              ariaLabel="每页条数"
              triggerClassName="h-8 w-[112px]"
            />
          </div>
        )}
      </div>

      {/* 右侧：分页按钮 */}
      <div className="flex flex-wrap items-center gap-1">
        {/* 跳转到第一页 */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handlePageChange(1)}
          disabled={currentPage <= 1}
          className="h-8 w-8 p-0"
          title="第一页"
        >
          <ChevronsLeft className="w-4 h-4" />
        </Button>

        {/* 上一页 */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="h-8 w-8 p-0"
          title="上一页"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        {/* 页码按钮 */}
        {pages.map((page, index) => {
          if (page === '...') {
            return (
              <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">
                ...
              </span>
            )
          }

          return (
            <Button
              key={page}
              variant={currentPage === page ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handlePageChange(page as number)}
              aria-current={currentPage === page ? 'page' : undefined}
              className={cn(
                'h-8 w-8 p-0',
                currentPage === page && 'bg-purple-600 text-white hover:bg-purple-700'
              )}
            >
              {page}
            </Button>
          )
        })}

        {/* 下一页 */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="h-8 w-8 p-0"
          title="下一页"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>

        {/* 跳转到最后一页 */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handlePageChange(totalPages)}
          disabled={currentPage >= totalPages}
          className="h-8 w-8 p-0"
          title="最后一页"
        >
          <ChevronsRight className="w-4 h-4" />
        </Button>

        {/* 跳转到指定页 */}
        {showJumpToPage && (
          <div className="flex items-center gap-1 ml-2">
            <span className="text-sm text-muted-foreground">跳至</span>
            <input
              type="number"
              min={1}
              max={Math.max(totalPages, 1)}
              value={jumpValue}
              aria-label="跳转页码"
              onChange={(e) => setJumpValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitJump()
                }
              }}
              onBlur={commitJump}
              className="w-14 px-2 py-1 text-sm text-center border border-border/70 rounded-md bg-card text-foreground/90 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-muted-foreground">页</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default Pagination
