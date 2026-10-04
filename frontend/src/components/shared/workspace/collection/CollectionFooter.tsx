import React from 'react'
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination'
import { Pagination, type PaginationProps } from '@/components/atoms/pagination'

export interface CollectionFooterProps extends Omit<PaginationProps, 'pageSize' | 'totalPages'> {
  pageSize?: number
  totalPages?: number
}

/** 外围留白由本组件拥有；不修改 Pagination 的数值与交互契约。 */
export function CollectionFooter({ pageSize = DEFAULT_PAGE_SIZE, totalPages, totalItems, className = 'px-3', ...props }: CollectionFooterProps) {
  return <Pagination {...props} pageSize={pageSize} totalItems={totalItems}
    totalPages={totalPages ?? Math.ceil(totalItems / Math.max(pageSize, 1))} className={className} />
}
