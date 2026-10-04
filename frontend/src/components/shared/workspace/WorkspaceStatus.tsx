import React from 'react'
import { Button } from '@/components/atoms/button'

export type WorkspaceState =
  | { kind: 'ready' | 'refreshing' }
  | { kind: 'loading'; skeleton: React.ReactNode }
  | { kind: 'error'; message: string; hasContent: boolean; onRetry: () => void }
  | { kind: 'empty'; message: string; action?: React.ReactNode }
  | { kind: 'filtered-empty'; message: string; onClear: () => void }

export interface WorkspaceStatusProps { state: WorkspaceState; children?: React.ReactNode }

/** 状态由业务查询提供；后台刷新与带旧数据失败时保持结果子树挂载。 */
export function WorkspaceStatus({ state, children }: WorkspaceStatusProps) {
  const showContent = state.kind === 'ready' || state.kind === 'refreshing' || (state.kind === 'error' && state.hasContent)
  return (
    <div className="min-w-0 space-y-3" aria-busy={state.kind === 'loading' || state.kind === 'refreshing'}>
      {state.kind === 'loading' && <div role="status" aria-label="正在加载">{state.skeleton}</div>}
      {state.kind === 'refreshing' && <div role="status" className="text-sm text-muted-foreground">正在刷新，保留当前结果</div>}
      {state.kind === 'error' && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-foreground">
        <span>{state.message}</span><Button variant="outline" size="sm" onClick={state.onRetry}>重试</Button>
      </div>}
      {state.kind === 'empty' && <div role="status" className="py-8 text-center text-muted-foreground"><p>{state.message}</p>{state.action}</div>}
      {state.kind === 'filtered-empty' && <div role="status" className="py-8 text-center text-muted-foreground"><p>{state.message}</p><Button variant="outline" size="sm" onClick={state.onClear}>清空筛选</Button></div>}
      {showContent && <div key="results" data-workspace-results className="min-w-0">{children}</div>}
    </div>
  )
}
