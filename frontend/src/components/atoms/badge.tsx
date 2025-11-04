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
        outline: 'text-foreground border-gray-200 bg-white/80 backdrop-blur-lg hover:bg-white',
        success: 'border-transparent bg-green-100 text-green-800 backdrop-blur-lg',
        warning: 'border-transparent bg-yellow-100 text-yellow-800 backdrop-blur-lg',
        error: 'border-transparent bg-red-100 text-red-800 backdrop-blur-lg',
        info: 'border-transparent bg-blue-100 text-blue-800 backdrop-blur-lg',
        glass: 'border-white/20 bg-white/20 backdrop-blur-lg text-gray-700 hover:bg-white/30',
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