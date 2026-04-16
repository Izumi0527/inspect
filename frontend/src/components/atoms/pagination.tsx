import React from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from './button'
import { PageSizeSelect } from '@/components/atoms/page-size-select'
import { cn } from '@/utils/cn'

export interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
  pageSizeOptions?: number[]
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  showPageSizeSelector?: boolean
  className?: string
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  pageSizeOptions = [10, 20, 50, 100],
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
  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages || page === currentPage) return
    onPageChange(page)
  }

  const handlePageSizeChange = (newPageSize: number) => {
    if (onPageSizeChange) {
      onPageSizeChange(newPageSize)
      // 调整当前页码，确保不超出范围
      const newTotalPages = Math.ceil(totalItems / newPageSize)
      if (currentPage > newTotalPages) {
        onPageChange(newTotalPages)
      }
    }
  }

  return (
    <div className={cn('flex items-center justify-between', className)}>
      {/* 左侧：总数信息和每页条数选择器 */}
      <div className="flex items-center gap-4">
        <div className="text-sm text-muted-foreground">
          显示 <span className="font-medium">{startItem}</span> - <span className="font-medium">{endItem}</span>{' '}
          / 共 <span className="font-medium">{totalItems}</span> 条
        </div>

        {showPageSizeSelector && onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">每页:</span>
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
      <div className="flex items-center gap-1">
        {/* 跳转到第一页 */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handlePageChange(1)}
          disabled={currentPage === 1}
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
          disabled={currentPage === 1}
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
          disabled={currentPage === totalPages}
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
          disabled={currentPage === totalPages}
          className="h-8 w-8 p-0"
          title="最后一页"
        >
          <ChevronsRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

export default Pagination
