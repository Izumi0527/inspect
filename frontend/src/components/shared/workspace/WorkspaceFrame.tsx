import React from 'react'
import { cn } from '@/utils/cn'
import { hasWorkspaceContent } from './slots'
import type { WorkspaceFrameProps } from './types'

/**
 * 工作区框架：只组织工作区语义与滚动，不持有业务数据或操作状态。
 *
 * 面板为不透明表面 + 发丝刻线（无模糊、无装饰阴影）；
 * viewport 模式下桌面高屏固定工具栏/页脚、仅结果区滚动（单一滚动所有者）。
 */
export function WorkspaceFrame({
  label, kind, mode = 'flow', summary, toolbar, status, selection, footer, children, className, contentClassName,
}: WorkspaceFrameProps) {
  const viewport = mode === 'viewport'
  return (
    <section
      aria-label={label}
      data-workspace={kind}
      data-workspace-mode={mode}
      className={cn(
        'flex min-w-0 flex-col gap-4',
        viewport && '[@media(min-width:1024px)_and_(min-height:800px)]:h-full [@media(min-width:1024px)_and_(min-height:800px)]:min-h-0',
        className,
      )}
    >
      {hasWorkspaceContent(summary) && <div data-workspace-slot="summary" className="min-w-0 shrink-0">{summary}</div>}
      <div className={cn(
        'flex min-w-0 flex-col rounded-lg border border-border bg-card text-card-foreground',
        viewport && '[@media(min-width:1024px)_and_(min-height:800px)]:min-h-0 [@media(min-width:1024px)_and_(min-height:800px)]:flex-1 [@media(min-width:1024px)_and_(min-height:800px)]:overflow-hidden',
      )}>
        {hasWorkspaceContent(toolbar) && <div data-workspace-slot="toolbar" className="min-w-0 shrink-0 border-b border-border p-3">{toolbar}</div>}
        {hasWorkspaceContent(status) && <div data-workspace-slot="status" className="min-w-0 shrink-0 border-b border-border px-3 py-2">{status}</div>}
        {hasWorkspaceContent(selection) && <div data-workspace-slot="selection" className="min-w-0 shrink-0 border-b border-border px-3 py-2">{selection}</div>}
        <div data-workspace-slot="content" className={cn(
          'min-w-0',
          contentClassName ?? 'p-3',
          viewport && '[@media(min-width:1024px)_and_(min-height:800px)]:min-h-0 [@media(min-width:1024px)_and_(min-height:800px)]:flex-1 [@media(min-width:1024px)_and_(min-height:800px)]:overflow-auto',
        )}>{children}</div>
        {hasWorkspaceContent(footer) && <div data-workspace-slot="footer" className="min-w-0 shrink-0 border-t border-border">{footer}</div>}
      </div>
    </section>
  )
}
