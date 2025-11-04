import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/utils/cn'

export interface LoadingProps {
  size?: 'sm' | 'md' | 'lg'
  variant?: 'spinner' | 'dots' | 'pulse'
  className?: string
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
}

const Spinner = ({ size = 'md', className }: { size: 'sm' | 'md' | 'lg'; className?: string }) => (
  <motion.div
    className={cn('border-2 border-gray-200 border-t-purple-500 rounded-full', sizeClasses[size], className)}
    animate={{ rotate: 360 }}
    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
  />
)

const Dots = ({ size = 'md', className }: { size: 'sm' | 'md' | 'lg'; className?: string }) => {
  const dotSize = size === 'sm' ? 'w-1 h-1' : size === 'md' ? 'w-2 h-2' : 'w-3 h-3'
  
  return (
    <div className={cn('flex space-x-1', className)}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className={cn('bg-purple-500 rounded-full', dotSize)}
          animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            delay: i * 0.2,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

const Pulse = ({ size = 'md', className }: { size: 'sm' | 'md' | 'lg'; className?: string }) => (
  <motion.div
    className={cn('bg-purple-500 rounded-full', sizeClasses[size], className)}
    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
  />
)

export const Loading: React.FC<LoadingProps> = ({
  size = 'md',
  variant = 'spinner',
  className
}) => {
  const components = {
    spinner: Spinner,
    dots: Dots,
    pulse: Pulse,
  }
  
  const Component = components[variant]
  
  return <Component size={size} className={className} />
}

// 全屏加载组件
export const LoadingOverlay: React.FC<{
  isLoading: boolean
  children: React.ReactNode
  message?: string
}> = ({ isLoading, children, message = '加载中...' }) => {
  return (
    <div className="relative">
      {children}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm"
          >
            <Loading size="lg" variant="spinner" />
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-4 text-sm text-gray-600"
            >
              {message}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// 页面加载组件
export const PageLoading: React.FC<{ message?: string }> = ({ message = '页面加载中...' }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <Loading size="lg" variant="spinner" />
      <p className="text-sm text-gray-600">{message}</p>
    </div>
  )
}