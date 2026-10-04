import React from 'react'
import { WorkspaceFrame } from '../WorkspaceFrame'
import { hasWorkspaceContent } from '../slots'
import type { ConfigurationWorkspaceProps } from '../types'

/** 配置工作区：范围与整页动作条 → 配置分区 → 独立危险区。 */
export function ConfigurationWorkspace({ scope, actions, danger, children, ...props }: ConfigurationWorkspaceProps) {
  const hasHeader = hasWorkspaceContent(scope) || hasWorkspaceContent(actions)
  return (
    <WorkspaceFrame {...props} kind="configuration" toolbar={hasHeader ? (
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
        {hasWorkspaceContent(scope) && <div data-workspace-slot="scope" className="min-w-0">{scope}</div>}
        {hasWorkspaceContent(actions) && <div data-workspace-slot="actions" className="ml-auto flex min-w-0 flex-wrap gap-2">{actions}</div>}
      </div>
    ) : undefined}>
      <div className="flex min-w-0 flex-col gap-4">
        {children}
        {hasWorkspaceContent(danger) && <div data-workspace-slot="danger" className="border-t border-border pt-4">{danger}</div>}
      </div>
    </WorkspaceFrame>
  )
}
