import * as React from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'

export interface Column<T extends object> {
  key: string
  title: string
  width?: string
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
  render?: (value: unknown, record: T, index: number) => React.ReactNode
}

export interface TableProps<T extends object> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  pagination?: {
    current: number
    pageSize: number
    total: number
    onChange: (page: number, pageSize: number) => void
    showTotal?: boolean
  }
  rowSelection?: {
    selectedRowKeys: (string | number)[]
    onChange: (selectedRowKeys: (string | number)[], selectedRows: T[]) => void
  }
  onRow?: (record: T, index: number) => HTMLMotionProps<'tr'>
  className?: string
  size?: 'default' | 'small' | 'large'
  showHeader?: boolean
  scroll?: { x?: number; y?: number }
  rowKey?: keyof T | ((record: T) => string | number)
}

export function Table<T extends object>({
  columns,
  data,
  loading = false,
  pagination,
  rowSelection,
  onRow,
  className,
  size = 'default',
  showHeader = true,
  scroll,
  rowKey
}: TableProps<T>) {
  const [sortColumn, setSortColumn] = React.useState<string | null>(null)
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc' | null>(null)

  const getRowKey = React.useCallback((record: T, index: number): string | number => {
    if (!rowKey) {
      return index
    }
    if (typeof rowKey === 'function') {
      return rowKey(record)
    }
    const key = rowKey as keyof T
    const value = (record as Record<keyof T, unknown>)[key]
    if (typeof value === 'string' || typeof value === 'number') {
      return value
    }
    if (value instanceof Date) {
      return value.getTime()
    }
    return index
  }, [rowKey])

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      if (sortOrder === 'asc') {
        setSortOrder('desc')
      } else if (sortOrder === 'desc') {
        setSortColumn(null)
        setSortOrder(null)
      } else {
        setSortOrder('asc')
      }
    } else {
      setSortColumn(columnKey)
      setSortOrder('asc')
    }
  }

  const sortedData = React.useMemo(() => {
    if (!sortColumn || !sortOrder) return data

    const toComparable = (value: unknown): string | number => {
      if (typeof value === 'number') return value
      if (typeof value === 'string') return value
      if (value instanceof Date) return value.getTime()
      if (value == null) return ''
      try {
        return JSON.stringify(value)
      } catch {
        return ''
      }
    }

    return [...data].sort((a, b) => {
      const recordA = a as Record<string, unknown>
      const recordB = b as Record<string, unknown>
      const aValue = recordA[sortColumn]
      const bValue = recordB[sortColumn]

      if (aValue === bValue) return 0

      const aComparable = toComparable(aValue)
      const bComparable = toComparable(bValue)

      if (sortOrder === 'asc') {
        return aComparable > bComparable ? 1 : -1
      }
      return aComparable < bComparable ? 1 : -1
    })
  }, [data, sortColumn, sortOrder])

  const sizeClasses: Record<'small' | 'default' | 'large', string> = {
    small: 'text-xs',
    default: 'text-sm',
    large: 'text-base'
  }

  const cellPadding: Record<'small' | 'default' | 'large', string> = {
    small: 'px-3 py-2',
    default: 'px-4 py-3',
    large: 'px-6 py-4'
  }

  return (
    <div className={cn('rounded-xl overflow-hidden bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border border-gray-200/50 dark:border-gray-700/50', className)}>
      <div className="overflow-auto" style={{ maxHeight: scroll?.y }}>
        <table className="w-full" style={{ minWidth: scroll?.x }}>
          {showHeader && (
            <thead>
              <tr className="border-b border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/50">
                {rowSelection && (
                  <th className={cn('text-left font-medium text-gray-900 dark:text-gray-100 w-12', cellPadding[size])} style={{ width: '48px' }}>
                    <input
                      type="checkbox"
                      className="custom-checkbox"
                      checked={rowSelection.selectedRowKeys.length === data.length && data.length > 0}
                      ref={(input) => {
                        if (input) {
                          input.indeterminate = rowSelection.selectedRowKeys.length > 0 && rowSelection.selectedRowKeys.length < data.length
                        }
                      }}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const allKeys = data.map((record, index) => getRowKey(record, index))
                          rowSelection.onChange(allKeys, data)
                        } else {
                          rowSelection.onChange([], [])
                        }
                      }}
                    />
                  </th>
                )}
                {columns.map((column, index) => (
                  <th
                    key={index}
                    className={cn(
                      'font-medium text-gray-900 dark:text-gray-100',
                      cellPadding[size],
                      column.align === 'center' && 'text-center',
                      column.align === 'right' && 'text-right',
                      column.align !== 'center' && column.align !== 'right' && 'text-left'
                    )}
                    style={{ width: column.width }}
                  >
                    <div className={cn(
                      'flex items-center gap-2',
                      column.align === 'center' && 'justify-center',
                      column.align === 'right' && 'justify-end'
                    )}>
                      <span className={sizeClasses[size]}>{column.title}</span>
                      {column.sortable && (
                        <button
                          onClick={() => handleSort(column.key)}
                          className="flex flex-col hover:text-purple-600 transition-colors"
                        >
                          <ChevronUp
                            className={cn(
                              'h-3 w-3',
                              sortColumn === column.key && sortOrder === 'asc'
                                ? 'text-purple-600'
                                : 'text-gray-400'
                            )}
                          />
                          <ChevronDown
                            className={cn(
                              'h-3 w-3 -mt-1',
                              sortColumn === column.key && sortOrder === 'desc'
                                ? 'text-purple-600'
                                : 'text-gray-400'
                            )}
                          />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + (rowSelection ? 1 : 0)} className="text-center py-8">
                  <div className="flex items-center justify-center gap-2">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-4 h-4 border-2 border-purple-200 border-t-purple-600 rounded-full"
                    />
                    <span className="text-gray-500 dark:text-gray-400">加载中...</span>
                  </div>
                </td>
              </tr>
            ) : sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (rowSelection ? 1 : 0)} className="text-center py-8 text-gray-500 dark:text-gray-400">
                  暂无数据
                </td>
              </tr>
            ) : (
              sortedData.map((record, index) => {
                const key = getRowKey(record, index)
                const rowProps = onRow?.(record, index)
                const { className: rowClassName, ...restRowProps } = (rowProps ?? {}) as HTMLMotionProps<'tr'>
                const isSelected = rowSelection?.selectedRowKeys.includes(key) || false

                return (
                  <motion.tr
                    key={key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.02 }}
                    className={cn(
                      'border-b border-gray-200/30 dark:border-gray-700/30 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors',
                      isSelected && 'bg-purple-50/50 dark:bg-purple-900/20',
                      rowClassName
                    )}
                    {...restRowProps}
                  >
                    {rowSelection && (
                      <td className={cn(cellPadding[size], 'w-12')} style={{ width: '48px' }}>
                        <input
                          type="checkbox"
                          className="custom-checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              rowSelection.onChange(
                                [...rowSelection.selectedRowKeys, key],
                                [...data.filter((_, i) => rowSelection.selectedRowKeys.includes(getRowKey(data[i], i))), record]
                              )
                            } else {
                              rowSelection.onChange(
                                rowSelection.selectedRowKeys.filter(k => k !== key),
                                data.filter((_, i) => {
                                  const rowKeyValue = getRowKey(data[i], i)
                                  return rowSelection.selectedRowKeys.includes(rowKeyValue) && rowKeyValue !== key
                                })
                              )
                            }
                          }}
                        />
                      </td>
                    )}
                    {columns.map((column, colIndex) => {
                      const recordData = record as Record<string, unknown>
                      const rawValue = recordData[column.key]
                      const renderedValue = column.render
                        ? column.render(rawValue, record, index)
                        : renderCellValue(rawValue)

                      return (
                        <td
                          key={colIndex}
                          className={cn(
                            cellPadding[size],
                            sizeClasses[size],
                            column.align === 'center' && 'text-center',
                            column.align === 'right' && 'text-right'
                          )}
                        >
                          {renderedValue}
                        </td>
                      )
                    })}
                  </motion.tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200/50 dark:border-gray-700/50 bg-gray-50/30 dark:bg-gray-800/30">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            显示第 {(pagination.current - 1) * pagination.pageSize + 1} - {Math.min(pagination.current * pagination.pageSize, pagination.total)} 条，共 {pagination.total} 条
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => pagination.onChange(pagination.current - 1, pagination.pageSize)}
              disabled={pagination.current <= 1}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              上一页
            </button>
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {pagination.current} / {Math.ceil(pagination.total / pagination.pageSize)}
            </span>
            <button
              onClick={() => pagination.onChange(pagination.current + 1, pagination.pageSize)}
              disabled={pagination.current >= Math.ceil(pagination.total / pagination.pageSize)}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function renderCellValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return '-'
  }

  if (React.isValidElement(value)) {
    return value
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return '[Object]'
    }
  }

  if (typeof value === 'boolean') {
    return value ? '是' : '否'
  }

  return String(value)
}
