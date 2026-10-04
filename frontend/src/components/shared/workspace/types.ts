import type { ReactNode } from 'react'

export type WorkspaceMode = 'flow' | 'viewport'
export type WorkspaceKind = 'resource' | 'analysis' | 'configuration'

export interface WorkspaceBaseProps {
  label: string
  children: ReactNode
  className?: string
  /** 结果区内边距；表格类页面传 "p-0" 以获得全出血行 */
  contentClassName?: string
  mode?: WorkspaceMode
}

export interface ResourceWorkspaceProps extends WorkspaceBaseProps {
  summary?: ReactNode
  toolbar?: ReactNode
  status?: ReactNode
  selection?: ReactNode
  footer?: ReactNode
}

export interface WorkspaceFrameProps extends ResourceWorkspaceProps {
  kind: WorkspaceKind
}

export interface AnalysisWorkspaceProps extends WorkspaceBaseProps {
  toolbar?: ReactNode
  range?: ReactNode
  status?: ReactNode
  metrics?: ReactNode
}

export interface ConfigurationWorkspaceProps extends WorkspaceBaseProps {
  scope?: ReactNode
  actions?: ReactNode
  status?: ReactNode
  danger?: ReactNode
}
