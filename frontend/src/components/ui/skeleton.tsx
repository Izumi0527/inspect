/**
 * Skeleton 组件统一导出
 *
 * 本文件作为 skeleton 组件的统一导出接口，
 * 实际组件实现位于 @/components/atoms/skeleton
 *
 * 这种设计允许：
 * 1. 兼容不同的导入路径（ui/ 和 atoms/）
 * 2. 统一的组件导出接口
 * 3. 更好的代码组织和可维护性
 *
 * @example
 * ```tsx
 * // 两种导入方式都支持：
 * import { Skeleton } from '@/components/ui/skeleton'
 * import { Skeleton } from '@/components/atoms/skeleton'
 * ```
 *
 * @see {@link @/components/atoms/skeleton} 查看组件实现细节
 */

export {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonList,
  SkeletonTable,
} from '@/components/atoms/skeleton'
