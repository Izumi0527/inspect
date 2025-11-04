'use client'

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ComponentType, forwardRef, ReactNode, createElement } from 'react'
import type { JSX } from 'react'  // 导入 JSX 命名空间

// 动画预设配置
export const animations = {
  // 页面级别动画
  pageTransition: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    transition: { duration: 0.3, ease: 'easeInOut' }
  },

  // 卡片动画
  cardHover: {
    whileHover: { 
      scale: 1.02, 
      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
      transition: { duration: 0.2 }
    },
    whileTap: { scale: 0.98 }
  },

  // 列表项动画
  listItem: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
    transition: { duration: 0.2 }
  },

  // 渐入动画
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.3 }
  },

  // 缩放弹入动画
  scaleIn: {
    initial: { opacity: 0, scale: 0.8 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.8 },
    transition: { duration: 0.3, ease: 'backOut' }
  },

  // 滑入动画
  slideUp: {
    initial: { opacity: 0, y: 50 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -50 },
    transition: { duration: 0.4, ease: 'easeOut' }
  },

  // 弹性动画
  bounceIn: {
    initial: { opacity: 0, scale: 0.3 },
    animate: { 
      opacity: 1, 
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 20
      }
    },
    exit: { opacity: 0, scale: 0.3 }
  }
}

// 通用动画组件
interface AnimatedContainerProps {
  children: ReactNode
  animation?: keyof typeof animations
  delay?: number
  className?: string
  as?: keyof JSX.IntrinsicElements
}

export const AnimatedContainer = forwardRef<HTMLDivElement, AnimatedContainerProps>(
  ({ children, animation = 'fadeIn', delay = 0, className, as = 'div', ...props }, ref) => {
    const shouldReduceMotion = useReducedMotion()

    const motionComponentKey = as as keyof typeof motion
    const MotionComponent = motion[motionComponentKey] as ComponentType<Record<string, unknown>>

    if (shouldReduceMotion) {
      return createElement(
        as,
        {
          ref,
          className,
          ...props
        },
        children
      )
    }

    const animationConfig = animations[animation]

    // 确保所有动画配置都有 transition 属性
    const safeTransition = 'transition' in animationConfig ? animationConfig.transition : {}

    const animationProps = {
      ...animationConfig,
      transition: {
        // 修复：安全访问 transition 属性
        ...safeTransition,
        delay
      }
    }

    return (
      <MotionComponent
        ref={ref}
        className={className}
        {...animationProps}
        {...props}
      >
        {children}
      </MotionComponent>
    )
  }
)

AnimatedContainer.displayName = 'AnimatedContainer'

// 列表动画容器
interface AnimatedListProps {
  children: ReactNode[]
  staggerDelay?: number
  className?: string
}

export const AnimatedList: React.FC<AnimatedListProps> = ({
  children,
  staggerDelay = 0.1,
  className
}) => {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div className={className}>
      {children.map((child, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.3,
            delay: index * staggerDelay,
            ease: 'easeOut'
          }}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  )
}

// 页面转场动画
interface PageTransitionProps {
  children: ReactNode
}

export const PageTransition: React.FC<PageTransitionProps> = ({ children }) => {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    return <>{children}</>
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  )
}

// 模态框动画
interface ModalTransitionProps {
  children: ReactNode
  isOpen: boolean
}

export const ModalTransition: React.FC<ModalTransitionProps> = ({ children, isOpen }) => {
  const shouldReduceMotion = useReducedMotion()

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            className="fixed inset-0 bg-black/50 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
          />
          
          {/* 模态框内容 */}
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.95 }}
            transition={{ 
              duration: shouldReduceMotion ? 0 : 0.2,
              ease: 'easeOut'
            }}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// 通知动画
export const NotificationTransition: React.FC<{
  children: ReactNode
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
}> = ({ children, position = 'top-right' }) => {
  const shouldReduceMotion = useReducedMotion()

  const getInitialPosition = () => {
    if (shouldReduceMotion) return {}
    
    switch (position) {
      case 'top-right':
        return { x: 400, y: -100 }
      case 'top-left':
        return { x: -400, y: -100 }
      case 'bottom-right':
        return { x: 400, y: 100 }
      case 'bottom-left':
        return { x: -400, y: 100 }
      default:
        return { x: 400, y: -100 }
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, ...getInitialPosition() }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, ...getInitialPosition() }}
      transition={{ 
        duration: shouldReduceMotion ? 0 : 0.3,
        ease: 'easeOut'
      }}
    >
      {children}
    </motion.div>
  )
}

// 按钮脉冲动画
export const PulseButton: React.FC<{
  children: ReactNode
  className?: string
  onClick?: () => void
}> = ({ children, className, onClick }) => {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    return (
      <button className={className} onClick={onClick}>
        {children}
      </button>
    )
  }

  return (
    <motion.button
      className={className}
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      animate={{
        boxShadow: [
          '0 0 0 0 rgba(59, 130, 246, 0.4)',
          '0 0 0 10px rgba(59, 130, 246, 0)',
          '0 0 0 0 rgba(59, 130, 246, 0)'
        ]
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        repeatType: 'loop'
      }}
    >
      {children}
    </motion.button>
  )
}

// 骨架屏动画增强
export const SkeletonPulse: React.FC<{
  className?: string
  children?: ReactNode
}> = ({ className = '', children }) => {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    return <div className={`bg-gray-200 ${className}`}>{children}</div>
  }

  return (
    <motion.div
      className={`bg-gray-200 ${className}`}
      animate={{
        opacity: [0.5, 1, 0.5]
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut'
      }}
    >
      {children}
    </motion.div>
  )
}
