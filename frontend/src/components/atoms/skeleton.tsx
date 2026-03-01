import React from 'react'
import { cn } from '@/utils/cn'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * 是否使用圆形骨架屏（用于头像等）
   */
  circle?: boolean
  /**
   * 是否使用波浪动画效果
   */
  wave?: boolean
}

/**
 * Skeleton 骨架屏组件
 *
 * iOS 风格的加载占位符，提供流畅的动画效果
 *
 * @example
 * ```tsx
 * // 基础用法
 * <Skeleton className="h-12 w-full" />
 *
 * // 圆形骨架屏（头像）
 * <Skeleton circle className="h-12 w-12" />
 *
 * // 列表骨架屏
 * <div className="space-y-4">
 *   <Skeleton className="h-24 w-full" />
 *   <Skeleton className="h-24 w-full" />
 *   <Skeleton className="h-24 w-full" />
 * </div>
 * ```
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  circle = false,
  wave = true,
  ...props
}) => {
  return (
    <div
      className={cn(
        // 基础样式
        'bg-muted',
        // 圆角样式（iOS 风格）
        circle ? 'rounded-full' : 'rounded-xl',
        // 波浪动画效果
        wave && 'animate-pulse',
        // 自定义类名
        className
      )}
      {...props}
    />
  )
}

/**
 * SkeletonText 文本骨架屏组件
 *
 * 用于文本内容的骨架屏占位
 *
 * @example
 * ```tsx
 * <SkeletonText lines={3} />
 * ```
 */
interface SkeletonTextProps {
  /**
   * 文本行数
   */
  lines?: number
  /**
   * 每行高度（Tailwind 类名）
   */
  lineHeight?: string
  /**
   * 行间距（Tailwind 类名）
   */
  spacing?: string
}

export const SkeletonText: React.FC<SkeletonTextProps> = ({
  lines = 3,
  lineHeight = 'h-4',
  spacing = 'space-y-2'
}) => {
  return (
    <div className={cn('w-full', spacing)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn(
            lineHeight,
            // 最后一行宽度随机（更自然）
            index === lines - 1 ? 'w-3/4' : 'w-full'
          )}
        />
      ))}
    </div>
  )
}

/**
 * SkeletonCard 卡片骨架屏组件
 *
 * 用于卡片内容的骨架屏占位
 *
 * @example
 * ```tsx
 * <SkeletonCard />
 * ```
 */
interface SkeletonCardProps {
  /**
   * 是否显示头像
   */
  avatar?: boolean
  /**
   * 文本行数
   */
  lines?: number
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  avatar = false,
  lines = 3
}) => {
  return (
    <div className="bg-card rounded-xl p-6 shadow-sm border border-border/60">
      <div className="flex items-start space-x-4">
        {/* 头像骨架屏 */}
        {avatar && <Skeleton circle className="h-12 w-12 flex-shrink-0" />}

        {/* 内容骨架屏 */}
        <div className="flex-1 space-y-3">
          {/* 标题 */}
          <Skeleton className="h-5 w-3/4" />

          {/* 文本内容 */}
          <SkeletonText lines={lines} lineHeight="h-4" spacing="space-y-2" />
        </div>
      </div>
    </div>
  )
}

/**
 * SkeletonList 列表骨架屏组件
 *
 * 用于列表的骨架屏占位
 *
 * @example
 * ```tsx
 * <SkeletonList count={5} />
 * ```
 */
interface SkeletonListProps {
  /**
   * 列表项数量
   */
  count?: number
  /**
   * 每个列表项的高度（Tailwind 类名）
   */
  itemHeight?: string
  /**
   * 列表项间距（Tailwind 类名）
   */
  spacing?: string
}

export const SkeletonList: React.FC<SkeletonListProps> = ({
  count = 5,
  itemHeight = 'h-24',
  spacing = 'space-y-4'
}) => {
  return (
    <div className={cn('w-full', spacing)}>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className={cn('w-full', itemHeight)} />
      ))}
    </div>
  )
}

/**
 * SkeletonTable 表格骨架屏组件
 *
 * 用于表格的骨架屏占位
 *
 * @example
 * ```tsx
 * <SkeletonTable rows={5} columns={4} />
 * ```
 */
interface SkeletonTableProps {
  /**
   * 行数
   */
  rows?: number
  /**
   * 列数
   */
  columns?: number
}

export const SkeletonTable: React.FC<SkeletonTableProps> = ({
  rows = 5,
  columns = 4
}) => {
  return (
    <div className="w-full space-y-3">
      {/* 表头 */}
      <div className="flex space-x-4">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-8 flex-1" />
        ))}
      </div>

      {/* 表格行 */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex space-x-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-12 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}
