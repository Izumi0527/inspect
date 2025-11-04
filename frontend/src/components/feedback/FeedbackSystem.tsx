'use client'

import React, { createContext, useContext, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, AlertCircle, Info, Loader2, X } from 'lucide-react'

// 通知类型
export type NotificationType = 'success' | 'error' | 'warning' | 'info' | 'loading'

// 通知接口
export interface Notification {
  id: string
  type: NotificationType
  title: string
  message?: string
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
  persistent?: boolean
}

// 通知上下文
interface NotificationContextType {
  notifications: Notification[]
  addNotification: (notification: Omit<Notification, 'id'>) => string
  removeNotification: (id: string) => void
  clearAll: () => void
  
  // 便捷方法
  success: (title: string, message?: string, options?: Partial<Notification>) => string
  error: (title: string, message?: string, options?: Partial<Notification>) => string
  warning: (title: string, message?: string, options?: Partial<Notification>) => string
  info: (title: string, message?: string, options?: Partial<Notification>) => string
  loading: (title: string, message?: string, options?: Partial<Notification>) => string
}

const NotificationContext = createContext<NotificationContextType | null>(null)

// 生成唯一ID
const generateId = () => Math.random().toString(36).substr(2, 9)

// 通知Provider
export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([])

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id))
  }, [])

  const addNotification = useCallback((notification: Omit<Notification, 'id'>) => {
    const id = generateId()
    const newNotification: Notification = {
      id,
      duration: 5000,
      ...notification
    }

    setNotifications(prev => [newNotification, ...prev])

    // 自动移除（除非是持久化通知或loading类型）
    if (!newNotification.persistent && newNotification.type !== 'loading' && newNotification.duration) {
      setTimeout(() => {
        removeNotification(id)
      }, newNotification.duration)
    }

    return id
  }, [removeNotification])

  const clearAll = useCallback(() => {
    setNotifications([])
  }, [])

  // 便捷方法
  const success = useCallback((title: string, message?: string, options?: Partial<Notification>) => {
    return addNotification({ type: 'success', title, message, ...options })
  }, [addNotification])

  const error = useCallback((title: string, message?: string, options?: Partial<Notification>) => {
    return addNotification({ 
      type: 'error', 
      title, 
      message, 
      duration: 8000, 
      persistent: false,
      ...options 
    })
  }, [addNotification])

  const warning = useCallback((title: string, message?: string, options?: Partial<Notification>) => {
    return addNotification({ type: 'warning', title, message, ...options })
  }, [addNotification])

  const info = useCallback((title: string, message?: string, options?: Partial<Notification>) => {
    return addNotification({ type: 'info', title, message, ...options })
  }, [addNotification])

  const loading = useCallback((title: string, message?: string, options?: Partial<Notification>) => {
    return addNotification({ 
      type: 'loading', 
      title, 
      message, 
      persistent: true, 
      duration: undefined,
      ...options 
    })
  }, [addNotification])

  const value: NotificationContextType = {
    notifications,
    addNotification,
    removeNotification,
    clearAll,
    success,
    error,
    warning,
    info,
    loading
  }

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationContainer />
    </NotificationContext.Provider>
  )
}

// 通知容器组件
const NotificationContainer: React.FC = () => {
  const context = useContext(NotificationContext)
  if (!context) return null

  const { notifications, removeNotification } = context

  return (
    <div className="fixed top-4 right-4 z-50 w-80 space-y-2">
      <AnimatePresence mode="popLayout">
        {notifications.map(notification => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onRemove={removeNotification}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}

// 通知项组件
const NotificationItem: React.FC<{
  notification: Notification
  onRemove: (id: string) => void
}> = ({ notification, onRemove }) => {
  const getIcon = () => {
    switch (notification.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" data-testid="check-circle-icon" />
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" data-testid="x-circle-icon" />
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-500" data-testid="alert-circle-icon" />
      case 'info':
        return <Info className="w-5 h-5 text-blue-500" data-testid="info-icon" />
      case 'loading':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" data-testid="loading-icon" />
      default:
        return <Info className="w-5 h-5 text-gray-500" data-testid="info-icon" />
    }
  }

  const getBgColor = () => {
    switch (notification.type) {
      case 'success':
        return 'bg-green-50 border-green-200'
      case 'error':
        return 'bg-red-50 border-red-200'
      case 'warning':
        return 'bg-yellow-50 border-yellow-200'
      case 'info':
        return 'bg-blue-50 border-blue-200'
      case 'loading':
        return 'bg-blue-50 border-blue-200'
      default:
        return 'bg-white border-gray-200'
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 400, scale: 0.9 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`
        p-4 rounded-lg border shadow-lg backdrop-blur-sm
        ${getBgColor()}
      `}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {getIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 mb-1">
            {notification.title}
          </div>
          {notification.message && (
            <div className="text-sm text-gray-600">
              {notification.message}
            </div>
          )}
          
          {notification.action && (
            <button
              onClick={notification.action.onClick}
              className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              {notification.action.label}
            </button>
          )}
        </div>
        
        <button
          onClick={() => onRemove(notification.id)}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  )
}

// Hook for using notifications
export const useNotifications = () => {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider')
  }
  return context
}

// 操作反馈Hook
export const useOperationFeedback = () => {
  const notifications = useNotifications()

  const withFeedback = useCallback(async <T,>(
    operation: () => Promise<T>,
    options: {
      loadingMessage?: string
      successMessage?: string
      errorMessage?: string
      showSuccess?: boolean
    } = {}
  ): Promise<T> => {
    const {
      loadingMessage = '处理中...',
      successMessage = '操作成功',
      errorMessage = '操作失败',
      showSuccess = true
    } = options

    // 显示加载状态
    const loadingId = notifications.loading('处理中', loadingMessage)

    try {
      const result = await operation()
      
      // 移除加载提示
      notifications.removeNotification(loadingId)
      
      // 显示成功提示
      if (showSuccess) {
        notifications.success('操作成功', successMessage)
      }
      
      return result
    } catch (error) {
      // 移除加载提示
      notifications.removeNotification(loadingId)
      
      // 显示错误提示
      const errorMsg = error instanceof Error ? error.message : String(error)
      notifications.error('操作失败', errorMessage || errorMsg)
      
      throw error
    }
  }, [notifications])

  return { withFeedback }
}

// 确认对话框Hook
export const useConfirmDialog = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [config, setConfig] = useState<{
    title: string
    message: string
    confirmText: string
    cancelText: string
    onConfirm: () => void | Promise<void>
    variant: 'default' | 'destructive'
  } | null>(null)

  const confirm = useCallback((options: {
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    onConfirm: () => void | Promise<void>
    variant?: 'default' | 'destructive'
  }) => {
    return new Promise<boolean>((resolve) => {
      setConfig({
        confirmText: '确认',
        cancelText: '取消',
        variant: 'default',
        ...options,
        onConfirm: async () => {
          try {
            await options.onConfirm()
            resolve(true)
          } catch (error) {
            console.error('Confirm action failed:', error)
            resolve(false)
          }
          setIsOpen(false)
        }
      })
      setIsOpen(true)
    })
  }, [])

  const cancel = useCallback(() => {
    setIsOpen(false)
    setConfig(null)
  }, [])

  const ConfirmDialog = config ? (
    <motion.div
      className="fixed inset-0 z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* 背景遮罩 */}
      <div 
        className="absolute inset-0 bg-black/50"
        onClick={cancel}
      />
      
      {/* 对话框 */}
      <div className="relative z-10 flex items-center justify-center min-h-full p-4">
        <motion.div
          className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {config.title}
          </h3>
          
          <p className="text-gray-600 mb-6">
            {config.message}
          </p>
          
          <div className="flex justify-end gap-3">
            <button
              onClick={cancel}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              {config.cancelText}
            </button>
            
            <button
              onClick={config.onConfirm}
              className={`
                px-4 py-2 rounded-md font-medium transition-colors
                ${config.variant === 'destructive' 
                  ? 'bg-red-600 text-white hover:bg-red-700' 
                  : 'bg-blue-600 text-white hover:bg-blue-700'
                }
              `}
            >
              {config.confirmText}
            </button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  ) : null

  return {
    isOpen,
    confirm,
    cancel,
    ConfirmDialog: isOpen ? ConfirmDialog : null
  }
}