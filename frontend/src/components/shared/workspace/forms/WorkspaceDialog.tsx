import React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'

export interface WorkspaceDialogProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  ariaLabel?: string
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl'
  closeBlocked?: boolean
  className?: string
}

const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', '2xl': 'max-w-2xl', '3xl': 'max-w-3xl', '4xl': 'max-w-4xl', '5xl': 'max-w-5xl' }

/**
 * 统一弹窗外壳：复用 Radix 管理焦点、遮罩与嵌套 Portal；
 * 浮层 = 圆角 12 + 唯一阴影 shadow-overlay；关闭只响应 false 并尊重业务保存保护。
 */
export function WorkspaceDialog({ open, onClose, title, ariaLabel, description, children, footer, size = 'md', closeBlocked = false, className }: WorkspaceDialogProps) {
  const previousFocus = React.useRef<HTMLElement | null>(null)
  return <Dialog.Root open={open} onOpenChange={next => { if (!next && !closeBlocked) onClose() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <Dialog.Content
        {...(!description ? { "aria-describedby": undefined } : {})}
        onOpenAutoFocus={() => { previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null }}
        onCloseAutoFocus={event => { event.preventDefault(); if (previousFocus.current?.isConnected) previousFocus.current.focus() }}
        onEscapeKeyDown={event => { if (closeBlocked) event.preventDefault() }}
        onInteractOutside={event => { if (closeBlocked) event.preventDefault() }}
        className={cn('fixed left-1/2 top-1/2 z-50 flex w-[calc(100%_-_2rem)] max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-overlay', sizes[size], className)}>
        <div className={cn(title ? 'shrink-0 border-b border-border px-5 py-3 pr-14' : 'sr-only')}>
          <Dialog.Title className="text-sm font-semibold">{title ?? ariaLabel ?? '对话框'}</Dialog.Title>
          {description && <Dialog.Description className="mt-1 text-sm text-muted-foreground whitespace-pre-line">{description}</Dialog.Description>}
        </div>
        <div data-workspace-dialog-body className="min-h-0 overflow-y-auto p-4">{children}</div>
        {footer && <div data-workspace-dialog-footer className="shrink-0 border-t border-border p-4">{footer}</div>}
        <button type="button" aria-label="关闭对话框" disabled={closeBlocked} onClick={onClose} className="absolute right-3 top-3 rounded-sm p-1.5 text-muted-foreground hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50">
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
