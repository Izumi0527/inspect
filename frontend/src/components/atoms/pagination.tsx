import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
  /** 胶囊内的条数标签，默认统一为「每页条数」。 */
  sizeChangerLabel?: string
  /** 是否渲染左侧「第 X - Y 条，共 Z 条」区间文案。 */
  showRangeText?: boolean
  onPageChange: (page: number) => void
  /** 只上报条数；调用方负责归位第一页，避免重复触发页码更新。 */
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
  sizeChangerLabel = '每页条数',
  showRangeText = true,
  onPageChange,
  onPageSizeChange,
  showPageSizeSelector = true,
  className,
}) => {
  const getPageNumbers = (): (number | '...')[] => {
    if (totalItems === 0) return []
    if (totalPages <= 8) return Array.from({ length: totalPages }, (_, index) => index + 1)

    const visible = new Set([1, 2, totalPages - 1, totalPages])
    const start = currentPage <= 3 ? 1 : currentPage >= totalPages - 2 ? totalPages - 3 : currentPage - 1
    const end = currentPage <= 3 ? 4 : currentPage >= totalPages - 2 ? totalPages : currentPage + 1
    for (let page = start; page <= end; page++) visible.add(page)

    const numbers = [...visible].filter(page => page >= 1 && page <= totalPages).sort((a, b) => a - b)
    const pages: (number | '...')[] = []
    numbers.forEach((page, index) => {
      const previous = numbers[index - 1]
      // 只缺一页时直接补齐，避免用省略号替代单个数字。
      if (index > 0 && page - previous === 2) pages.push(previous + 1)
      else if (index > 0 && page - previous > 2) pages.push('...')
      pages.push(page)
    })
    return pages
  }

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)
  const handlePageChange = (page: number) => {
    if (totalItems === 0 || page < 1 || page > totalPages || page === currentPage) return
    onPageChange(page)
  }

  return (
    <div data-slot="pagination" className={cn('flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-pagination px-4 py-1 text-sm', className)}>
      {showRangeText && (
        <div className="whitespace-nowrap text-muted-foreground tabular-nums">
          {`第 ${startItem} - ${endItem} 条，共 ${totalItems} 条`}
        </div>
      )}
      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
        <nav aria-label="分页导航" className="flex flex-wrap items-center justify-end gap-1">
          <Button type="button" variant="ghost" size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={totalItems === 0 || currentPage <= 1}
            className="h-8 w-8 rounded-md p-0 text-muted-foreground hover:bg-pagination-control hover:text-foreground"
            aria-label="上一页" title="上一页">
            <ChevronLeft />
          </Button>
          {getPageNumbers().map((page, index) => page === '...' ? (
            <span key={`ellipsis-${index}`} data-page-item="ellipsis" aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center text-foreground">...</span>
          ) : (
            <Button key={page} type="button" variant="ghost" size="sm"
              data-page-item={page}
              onClick={() => handlePageChange(page)}
              aria-current={currentPage === page ? 'page' : undefined}
              className={cn(
                'h-8 min-w-8 rounded-md px-1 py-0 text-sm font-normal shadow-none tabular-nums',
                currentPage === page
                  ? 'bg-pagination-selected text-pagination-selected-foreground hover:bg-pagination-selected hover:text-pagination-selected-foreground'
                  : 'text-foreground hover:bg-pagination-control hover:text-foreground'
              )}>
              {page}
            </Button>
          ))}
          <Button type="button" variant="ghost" size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={totalItems === 0 || currentPage >= totalPages}
            className="h-8 w-8 rounded-md p-0 text-muted-foreground hover:bg-pagination-control hover:text-foreground"
            aria-label="下一页" title="下一页">
            <ChevronRight />
          </Button>
        </nav>
        {showPageSizeSelector && onPageSizeChange && (
          <PageSizeSelect value={pageSize} options={pageSizeOptions}
            onChange={onPageSizeChange} ariaLabel="每页条数"
            valueLabel={`${sizeChangerLabel}：${pageSize}`}
            triggerClassName="h-8 w-auto min-w-[128px] gap-2 rounded-md border-0 bg-pagination-control px-3 py-0 text-sm shadow-none focus:bg-pagination-control"
          />
        )}
      </div>
    </div>
  )
}

export default Pagination
