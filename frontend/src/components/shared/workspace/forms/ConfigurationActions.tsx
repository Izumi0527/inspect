import React from 'react'
import { Button } from '@/components/atoms/button'
import { cn } from '@/utils/cn'

interface ConfigurationActionsProps {
  dirty: boolean
  saving: boolean
  onSave: () => void
  onReset: () => void
}

/**
 * 整页配置动作条：范围状态（已保存 / 未保存 / 正在保存）+ 重置 + 保存。
 * 深色可读的警示文字使用 on-soft 深色档（warning-soft-foreground）。
 */
export function ConfigurationActions({ dirty, saving, onSave, onReset }: ConfigurationActionsProps) {
  return <div role="group" aria-label="整页配置操作" className="flex flex-wrap items-center gap-2">
    <span role="status" className={cn('text-sm', dirty && !saving ? 'text-warning-soft-foreground' : 'text-muted-foreground')}>
      {saving ? '正在保存整页配置' : dirty ? '有未保存更改' : '配置已保存'}
    </span>
    <Button variant="outline" size="sm" onClick={onReset} disabled={!dirty || saving}>重置整页更改</Button>
    <Button size="sm" onClick={onSave} disabled={!dirty || saving}>{saving ? '保存中...' : '保存整页更改'}</Button>
  </div>
}
