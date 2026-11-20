'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge, Input } from '@/components/atoms'
import type { LLDPreviewResult } from '../../types/zabbix-monitoring.types'

interface AutoDiscoveryExpertDrawerProps {
  open: boolean
  readOnly: boolean
  includeRegex: string
  excludeRegex: string
  sampleText: string
  preview: LLDPreviewResult | null
  previewError: string | null
  onToggle: () => void
  onChangeInclude: (val: string) => void
  onChangeExclude: (val: string) => void
  onChangeSamples: (val: string) => void
}

export function AutoDiscoveryExpertDrawer({
  open,
  readOnly,
  includeRegex,
  excludeRegex,
  sampleText,
  preview,
  previewError,
  onToggle,
  onChangeInclude,
  onChangeExclude,
  onChangeSamples,
}: AutoDiscoveryExpertDrawerProps) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs font-medium text-foreground hover:bg-accent/50"
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          高级规则（专家模式）
        </span>
        <span className="text-[11px] text-muted-foreground">自定义正则匹配与实时样本预览</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="lld-include-regex"
                className="mb-1 block text-xs font-medium text-foreground"
              >
                仅保留匹配名称（正则，≤256 字符）
              </label>
              <Input
                id="lld-include-regex"
                disabled={readOnly}
                maxLength={256}
                value={includeRegex}
                onChange={(e) => onChangeInclude(e.target.value)}
                placeholder="例如：^(Gigabit|XGigabit|Eth-Trunk)"
                className="font-mono text-xs"
              />
            </div>
            <div>
              <label
                htmlFor="lld-exclude-regex"
                className="mb-1 block text-xs font-medium text-foreground"
              >
                额外排除名称（正则，≤256 字符）
              </label>
              <Input
                id="lld-exclude-regex"
                disabled={readOnly}
                maxLength={256}
                value={excludeRegex}
                onChange={(e) => onChangeExclude(e.target.value)}
                placeholder="例如：Unused|Test"
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div>
            <label htmlFor="lld-samples" className="mb-1 block text-xs font-medium text-foreground">
              测试样本端口列表（每行一个）
            </label>
            <textarea
              id="lld-samples"
              rows={3}
              value={sampleText}
              onChange={(e) => onChangeSamples(e.target.value)}
              className="w-full rounded-md border border-input bg-card p-2 font-mono text-xs text-foreground focus:border-primary focus:outline-none"
            />
          </div>

          {previewError && <p className="text-xs text-danger">{previewError}</p>}

          {preview && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-border bg-card p-2.5">
                <p className="mb-1.5 text-xs font-medium text-success-soft-foreground tabular-nums">
                  命中监测对象（{preview.matched.length}）
                </p>
                <div className="flex flex-wrap gap-1">
                  {preview.matched.map((item) => (
                    <Badge key={item} variant="success" size="sm" className="font-mono">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-border bg-card p-2.5">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground tabular-nums">
                  已自动排除（{preview.excluded.length}）
                </p>
                <div className="flex flex-wrap gap-1">
                  {preview.excluded.map((item) => (
                    <Badge key={item} variant="neutral" size="sm" className="font-mono">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
