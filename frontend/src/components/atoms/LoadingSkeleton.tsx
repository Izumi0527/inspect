import React from 'react'

interface LoadingSkeletonProps {
  rows?: number
  className?: string
}

/**
 * LoadingSkeleton 组件
 * 用于在数据加载时显示占位骨架屏
 */
export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  rows = 3,
  className = ''
}) => {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="animate-pulse">
          <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-muted rounded w-1/2"></div>
        </div>
      ))}
    </div>
  )
}

interface CardSkeletonProps {
  count?: number
  className?: string
}

/**
 * CardSkeleton 组件
 * 用于卡片布局的骨架屏
 */
export const CardSkeleton: React.FC<CardSkeletonProps> = ({
  count = 4,
  className = ''
}) => {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-4 gap-6 ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="bg-card rounded-lg border border-border/50 shadow-sm p-6 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="h-3 bg-muted rounded w-2/3 mb-3"></div>
              <div className="h-8 bg-muted rounded w-1/2 mb-3"></div>
              <div className="h-3 bg-muted rounded w-1/3"></div>
            </div>
            <div className="w-12 h-12 bg-muted rounded-lg"></div>
          </div>
        </div>
      ))}
    </div>
  )
}

interface TableSkeletonProps {
  rows?: number
  columns?: number
  className?: string
}

/**
 * TableSkeleton 组件
 * 用于表格布局的骨架屏
 */
export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 5,
  columns = 6,
  className = ''
}) => {
  return (
    <div className={`bg-card rounded-lg border border-border/50 shadow-sm ${className}`}>
      <div className="p-6">
        {/* Table Header */}
        <div className="flex gap-4 pb-4 border-b border-border/50">
          {Array.from({ length: columns }).map((_, index) => (
            <div key={`header-${index}`} className="flex-1 h-4 bg-muted rounded animate-pulse"></div>
          ))}
        </div>

        {/* Table Rows */}
        <div className="space-y-4 mt-4">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <div key={`row-${rowIndex}`} className="flex gap-4">
              {Array.from({ length: columns }).map((_, colIndex) => (
                <div key={`cell-${rowIndex}-${colIndex}`} className="flex-1 h-4 bg-muted rounded animate-pulse"></div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface ChartSkeletonProps {
  height?: number
  className?: string
}

/**
 * ChartSkeleton 组件
 * 用于图表的骨架屏
 */
export const ChartSkeleton: React.FC<ChartSkeletonProps> = ({
  height = 300,
  className = ''
}) => {
  return (
    <div className={`bg-card rounded-lg border border-border/50 shadow-sm p-6 ${className}`}>
      <div className="h-4 bg-muted rounded w-1/3 mb-4 animate-pulse"></div>
      <div
        className="bg-muted/60 rounded animate-pulse"
        style={{ height: `${height}px` }}
      ></div>
    </div>
  )
}
