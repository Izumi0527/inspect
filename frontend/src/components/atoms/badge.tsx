import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/utils/cn'

/**
 * 徽标。
 *
 * 精密仪器方向：
 * - 基座 `whitespace-nowrap`：徽标绝不折行（P0 修复）
 * - 语义变体全部走令牌（soft 底 + on-soft 文字，浅深两套成对）；
 *   不再使用 backdrop-blur 与硬编码调色板。
 */
const badgeVariants = cva(
  'inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium transition-colors motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-ring/40',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        primary: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        danger: 'border-transparent bg-danger text-danger-foreground',
        outline: 'border-border bg-card text-muted-foreground',
        success: 'border-transparent bg-success-soft text-success-soft-foreground',
        warning: 'border-transparent bg-warning-soft text-warning-soft-foreground',
        error: 'border-transparent bg-danger-soft text-danger-soft-foreground',
        info: 'border-transparent bg-info-soft text-info-soft-foreground',
        neutral: 'border-transparent bg-unknown-soft text-unknown-soft-foreground',
      },
      size: {
        default: 'h-5 px-2',
        sm: 'h-5 px-1.5 text-[11px]',
        lg: 'h-6 px-2.5 text-[13px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  asChild?: boolean
}

function Badge({ className, variant, size, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : 'div'
  return <Comp data-slot="badge" className={cn(badgeVariants({ variant, size }), className)} {...props} />
}

export { Badge, badgeVariants }
