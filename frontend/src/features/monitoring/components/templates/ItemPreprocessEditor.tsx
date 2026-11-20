'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Button, Input } from '@/components/atoms'
import type { PreprocessStep } from '../../types/zabbix-monitoring.types'
import { PREPROCESS_TYPE_OPTIONS } from './templateConfigHelpers'

export interface ValueMapEntry {
  key: string
  label: string
}

interface ItemPreprocessEditorProps {
  steps: PreprocessStep[]
  valueMapEntries: ValueMapEntry[]
  disabled?: boolean
  onChangeSteps: (steps: PreprocessStep[]) => void
  onChangeValueMap: (entries: ValueMapEntry[]) => void
}

function defaultParamsForType(type: string): Record<string, string> {
  if (type === 'multiplier') return { factor: '0.1' }
  if (type === 'change_per_sec') return { bits: 'auto' }
  if (type === 'regex') return { pattern: '([0-9]+\\.?[0-9]*)' }
  return {}
}

export function ItemPreprocessEditor({
  steps,
  valueMapEntries,
  disabled = false,
  onChangeSteps,
  onChangeValueMap,
}: ItemPreprocessEditorProps) {
  const hasValueMapStep = steps.some((s) => s.type === 'valuemap')

  const handleAddStep = () => {
    if (steps.length >= 8) return
    onChangeSteps([...steps, { type: 'multiplier', params: { factor: '0.1' } }])
  }

  const handleUpdateStep = (idx: number, next: PreprocessStep) => {
    onChangeSteps(steps.map((s, i) => (i === idx ? next : s)))
  }

  const handleRemoveStep = (idx: number) => {
    onChangeSteps(steps.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-2/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-foreground">数据换算与清洗（可选）</p>
          <p className="text-[11px] text-muted-foreground">
            将设备返回的原始计数或数字转换为直观速率、单位或中文状态（最多 8 步）
          </p>
        </div>
        {!disabled && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={steps.length >= 8}
            onClick={handleAddStep}
          >
            <Plus className="h-3.5 w-3.5" />
            添加换算步骤
          </Button>
        )}
      </div>

      {steps.length === 0 ? (
        <p className="text-xs text-muted-foreground">未配置换算步骤，将直接显示设备原始返回值。</p>
      ) : (
        <div className="space-y-2">
          {steps.map((step, idx) => (
            <div key={idx} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2">
              <span className="text-xs font-medium text-muted-foreground tabular-nums">#{idx + 1}</span>
              <select
                aria-label={`换算步骤 ${idx + 1} 类型`}
                disabled={disabled}
                value={step.type}
                onChange={(e) =>
                  handleUpdateStep(idx, {
                    type: e.target.value,
                    params: defaultParamsForType(e.target.value),
                  })
                }
                className="h-8 flex-1 min-w-52 rounded-md border border-input bg-card px-2 text-xs text-foreground"
              >
                {PREPROCESS_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {step.type === 'multiplier' && (
                <Input
                  aria-label={`换算步骤 ${idx + 1} 倍率`}
                  disabled={disabled}
                  value={step.params?.factor ?? ''}
                  onChange={(e) =>
                    handleUpdateStep(idx, { ...step, params: { factor: e.target.value } })
                  }
                  placeholder="倍率如 8 或 0.1"
                  className="h-8 w-32 text-xs tabular-nums"
                />
              )}

              {step.type === 'change_per_sec' && (
                <select
                  aria-label={`换算步骤 ${idx + 1} 计数器位数`}
                  disabled={disabled}
                  value={step.params?.bits ?? 'auto'}
                  onChange={(e) =>
                    handleUpdateStep(idx, { ...step, params: { bits: e.target.value } })
                  }
                  className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground"
                >
                  <option value="auto">自动识别翻转位宽</option>
                  <option value="32">32 位计数器</option>
                  <option value="64">64 位计数器</option>
                </select>
              )}

              {step.type === 'regex' && (
                <Input
                  aria-label={`换算步骤 ${idx + 1} 正则表达式`}
                  disabled={disabled}
                  maxLength={256}
                  value={step.params?.pattern ?? ''}
                  onChange={(e) =>
                    handleUpdateStep(idx, { ...step, params: { pattern: e.target.value } })
                  }
                  placeholder="提取正则（≤256字符）"
                  className="h-8 w-52 font-mono text-xs"
                />
              )}

              {!disabled && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`移除步骤 ${idx + 1}`}
                  onClick={() => handleRemoveStep(idx)}
                  className="h-7 w-7 text-muted-foreground hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {(hasValueMapStep || valueMapEntries.length > 0) && (
        <div className="space-y-2 border-t border-border pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">状态数字对照表</span>
            {!disabled && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onChangeValueMap([...valueMapEntries, { key: '', label: '' }])}
              >
                + 添加对照项
              </Button>
            )}
          </div>
          {valueMapEntries.map((entry, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                disabled={disabled}
                value={entry.key}
                onChange={(e) =>
                  onChangeValueMap(
                    valueMapEntries.map((item, i) => (i === idx ? { ...item, key: e.target.value } : item))
                  )
                }
                placeholder="原始值（如 1）"
                className="h-8 w-28 text-xs tabular-nums"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <Input
                disabled={disabled}
                value={entry.label}
                onChange={(e) =>
                  onChangeValueMap(
                    valueMapEntries.map((item, i) => (i === idx ? { ...item, label: e.target.value } : item))
                  )
                }
                placeholder="中文状态（如 正常）"
                className="h-8 flex-1 text-xs"
              />
              {!disabled && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => onChangeValueMap(valueMapEntries.filter((_, i) => i !== idx))}
                  className="h-7 w-7 text-muted-foreground hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
