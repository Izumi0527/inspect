import React from 'react'
import { WorkspaceFrame } from '../WorkspaceFrame'
import type { ResourceWorkspaceProps } from '../types'

/** 资源列表工作区：工具栏 → 状态行 → 结果区（唯一滚动者）→ 页脚。 */
export function ResourceWorkspace({ mode = 'viewport', ...props }: ResourceWorkspaceProps) {
  return <WorkspaceFrame {...props} kind="resource" mode={mode} />
}
