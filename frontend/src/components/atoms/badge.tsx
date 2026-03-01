import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/utils/cn'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/90',
        primary: 'border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/90',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/90',
        danger: 'border-transparent bg-red-600 text-white shadow hover:bg-red-700',
        outline: 'text-foreground border-border bg-card/80 backdrop-blur-lg hover:bg-card',
        success: 'border-transparent bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 backdrop-blur-lg',
        warning: 'border-transparent bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 backdrop-blur-lg',
        error: 'border-transparent bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 backdrop-blur-lg',
        info: 'border-transparent bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 backdrop-blur-lg',
        glass: 'border-border/30 bg-card/20 backdrop-blur-lg text-muted-foreground hover:bg-card/30',
      },
      size: {
        default: 'h-6 px-3 text-xs',
        sm: 'h-5 px-2 text-xs',
        lg: 'h-8 px-4 text-sm',
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
  return <Comp className={cn(badgeVariants({ variant, size }), className)} {...props} />
}

export { Badge, badgeVariants }