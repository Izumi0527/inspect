import * as React from 'react'
import { Trash2 } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/atoms/button'
import { cn } from '@/utils/cn'

export interface DeleteIconButtonProps extends Omit<ButtonProps, 'children'> {
  /** 鼠标悬停提示文案，默认 "删除" */
  title?: string
  /** 无障碍标签，默认使用 title */
  'aria-label'?: string
  /** 图标自定义类名 */
  iconClassName?: string
  /** 点击时是否自动阻止事件冒泡（适合列表项整行可点击场景），默认 false */
  stopPropagation?: boolean
}

/**
 * 统一行内【删除】图标按钮组件
 * 统一采用巡检策略/巡检模板中的 ghost 按钮 + 红色垃圾桶图标（Trash2 w-4 h-4 text-red-500）样式
 */
export const DeleteIconButton = React.forwardRef<HTMLButtonElement, DeleteIconButtonProps>(
  (
    {
      title = '删除',
      'aria-label': ariaLabel,
      variant = 'ghost',
      size = 'sm',
      className,
      iconClassName,
      stopPropagation = false,
      onClick,
      ...props
    },
    ref
  ) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (stopPropagation) {
        e.stopPropagation()
      }
      onClick?.(e)
    }

    return (
      <Button
        ref={ref}
        type="button"
        size={size}
        variant={variant}
        title={title}
        aria-label={ariaLabel ?? title}
        className={cn(className)}
        onClick={handleClick}
        {...props}
      >
        <Trash2 className={cn('w-4 h-4 text-red-500', iconClassName)} />
      </Button>
    )
  }
)

DeleteIconButton.displayName = 'DeleteIconButton'
