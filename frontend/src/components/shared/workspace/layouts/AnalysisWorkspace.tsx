import React from 'react'
import { WorkspaceFrame } from '../WorkspaceFrame'
import { hasWorkspaceContent } from '../slots'
import type { AnalysisWorkspaceProps } from '../types'

/** 分析工作区：范围 → 指标 → 主内容（趋势/分布）→ 按需明细。 */
export function AnalysisWorkspace({ range, status, metrics, children, ...props }: AnalysisWorkspaceProps) {
  return (
    <WorkspaceFrame {...props} kind="analysis" status={hasWorkspaceContent(range) || hasWorkspaceContent(status) ? (
      <div className="flex min-w-0 flex-col gap-2">
        {hasWorkspaceContent(range) && <div data-workspace-slot="range" className="text-sm text-muted-foreground">{range}</div>}
        {status}
      </div>
    ) : undefined}>
      <div className="flex min-w-0 flex-col gap-4">
        {hasWorkspaceContent(metrics) && <div data-workspace-slot="metrics">{metrics}</div>}
        {children}
      </div>
    </WorkspaceFrame>
  )
}
