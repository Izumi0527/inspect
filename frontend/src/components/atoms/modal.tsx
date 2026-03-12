import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'

const Modal = DialogPrimitive.Root

const ModalTrigger = DialogPrimitive.Trigger

const ModalPortal = DialogPrimitive.Portal

const ModalClose = DialogPrimitive.Close

const ModalOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
))
ModalOverlay.displayName = DialogPrimitive.Overlay.displayName

const ModalContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    hideDescription?: boolean
  }
>(({ className, children, hideDescription = false, ...props }, ref) => (
  <ModalPortal>
    <ModalOverlay />
    <DialogPrimitive.Content
      ref={ref}
      aria-describedby={hideDescription ? undefined : 'modal-description'}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-border/30 bg-card/95 backdrop-blur-xl p-6 shadow-2xl duration-200',
        // 长内容在窄屏/低高度屏幕上需要可滚动，避免弹窗溢出导致关闭按钮不可达
        'max-h-[calc(100vh-2rem)] overflow-y-auto',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
        'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
        'rounded-2xl',
        className
      )}
      {...props}
    >
      {children}
      {/* 隐藏的描述元素，用于满足无障碍要求 */}
      {!hideDescription && (
        <DialogPrimitive.Description id="modal-description" className="sr-only">
          对话框内容
        </DialogPrimitive.Description>
      )}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-lg opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">关闭</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </ModalPortal>
))
ModalContent.displayName = DialogPrimitive.Content.displayName

const ModalHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col space-y-1.5 text-center sm:text-left',
      className
    )}
    {...props}
  />
)
ModalHeader.displayName = 'ModalHeader'

const ModalFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      className
    )}
    {...props}
  />
)
ModalFooter.displayName = 'ModalFooter'

const ModalTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight text-foreground',
      className
    )}
    {...props}
  />
))
ModalTitle.displayName = DialogPrimitive.Title.displayName

const ModalDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
ModalDescription.displayName = DialogPrimitive.Description.displayName

// 确认对话框组件
interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive'
  /** 外部控制确认按钮禁用状态（例如：表单未满足条件） */
  confirmDisabled?: boolean
  /** 外部控制取消/关闭禁用状态 */
  cancelDisabled?: boolean
  /** 是否在确认成功后自动关闭（默认 true） */
  autoClose?: boolean
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'default',
  confirmDisabled = false,
  cancelDisabled = false,
  autoClose = true
}) => {
  const [confirming, setConfirming] = React.useState(false)

  const handleRequestClose = React.useCallback(() => {
    if (confirming || cancelDisabled) return
    onClose()
  }, [cancelDisabled, confirming, onClose])

  const handleConfirm = React.useCallback(async () => {
    if (confirming || confirmDisabled) return

    setConfirming(true)
    try {
      await onConfirm()
      if (autoClose) {
        onClose()
      }
    } catch (error) {
      // 保留弹窗以便用户重试
      console.error('确认操作失败:', error)
    } finally {
      setConfirming(false)
    }
  }, [autoClose, confirmDisabled, confirming, onClose, onConfirm])

  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleRequestClose()
      }}
    >
      <ModalContent className="sm:max-w-[425px]">
        <ModalHeader>
          <ModalTitle className="flex items-center gap-2">
            {variant === 'destructive' && (
              <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
                <X className="w-3 h-3 text-red-600 dark:text-red-400" />
              </div>
            )}
            {title}
          </ModalTitle>
          {description && (
            <ModalDescription>{description}</ModalDescription>
          )}
        </ModalHeader>
        <ModalFooter>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleRequestClose}
            disabled={confirming || cancelDisabled}
            className={cn(
              'px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:ring-offset-2 transition-colors',
              (confirming || cancelDisabled) && 'opacity-50 cursor-not-allowed'
            )}
          >
            {cancelText}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleConfirm}
            disabled={confirming || confirmDisabled}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ml-2',
              variant === 'destructive'
                ? 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-400'
                : 'bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-ring/40',
              (confirming || confirmDisabled) && 'opacity-70 cursor-not-allowed'
            )}
          >
            {confirmText}
          </motion.button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

// 通知模态框
interface NotificationModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  message: string
  type?: 'success' | 'warning' | 'error' | 'info'
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  type = 'info'
}) => {
  const typeStyles = {
    success: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200',
    warning: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200',
    error: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200',
    info: 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200'
  }

  return (
    <Modal open={isOpen} onOpenChange={onClose}>
      <ModalContent className="sm:max-w-[425px]">
        <ModalHeader>
          <ModalTitle className="flex items-center gap-2">
            <div className={cn('w-6 h-6 rounded-full flex items-center justify-center', typeStyles[type])}>
              <div className="w-2 h-2 bg-current rounded-full" />
            </div>
            {title}
          </ModalTitle>
          <ModalDescription>{message}</ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:ring-offset-2 transition-colors"
          >
            知道了
          </motion.button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

// 简单模态框包装器 - 提供 onClose 接口
interface SimpleModalProps {
  open: boolean
  onClose: () => void
  title?: string
  /** 无障碍标题，当不显示标题但需要为屏幕阅读器提供标题时使用 */
  ariaLabel?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl'
  children: React.ReactNode
}

export const SimpleModal: React.FC<SimpleModalProps> = ({
  open,
  onClose,
  title,
  ariaLabel,
  size = 'md',
  children
}) => {
  const sizeClasses = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-xl',
    '2xl': 'sm:max-w-2xl',
    '3xl': 'sm:max-w-3xl',
    '4xl': 'sm:max-w-4xl',
    '5xl': 'sm:max-w-5xl'
  }

  return (
    <Modal open={open} onOpenChange={onClose}>
      <ModalContent className={sizeClasses[size]} hideDescription>
        {/* 显示标题 */}
        {title && (
          <ModalHeader>
            <ModalTitle>{title}</ModalTitle>
          </ModalHeader>
        )}
        {/* 隐藏的无障碍标题，当没有显示标题时使用 */}
        {!title && (
          <ModalTitle className="sr-only">
            {ariaLabel || '对话框'}
          </ModalTitle>
        )}
        {children}
      </ModalContent>
    </Modal>
  )
}

export {
  Modal,
  ModalPortal,
  ModalOverlay,
  ModalClose,
  ModalTrigger,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalTitle,
  ModalDescription,
}
