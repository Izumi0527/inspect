'use client'

import { useEffect, useMemo, useState } from 'react'
import { Radar, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { Badge, Button } from '@/components/atoms'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  usePreviewLLDRuleMutation,
  useUpdateTemplateLLDRuleMutation,
} from '../../hooks/useMonitoringConfig'
import type {
  LLDPreviewResult,
  LLDPresetFlags,
  MonitorLLDRule,
  TemplateDetailResponse,
} from '../../types/zabbix-monitoring.types'
import { AutoDiscoveryExpertDrawer } from './AutoDiscoveryExpertDrawer'
import {
  DEFAULT_LLD_SAMPLES,
  KEEP_LOST_DAY_OPTIONS,
  LLD_ENTITY_TYPE_LABELS,
  parseLLDPresetFlags,
} from './templateConfigHelpers'

interface AutoDiscoveryPanelProps {
  template: TemplateDetailResponse
  canControl: boolean
}

export function AutoDiscoveryPanel({ template, canControl }: AutoDiscoveryPanelProps) {
  const rules = useMemo(() => template.lld_rules ?? [], [template.lld_rules])
  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(rules[0]?.id ?? null)
  const activeRule: MonitorLLDRule | null =
    rules.find((r) => r.id === selectedRuleId) ?? rules[0] ?? null

  const [presetFlags, setPresetFlags] = useState<LLDPresetFlags>(() =>
    parseLLDPresetFlags(activeRule)
  )
  const [keepLostDays, setKeepLostDays] = useState<number>(activeRule?.keep_lost_days ?? 7)
  const [enabled, setEnabled] = useState<boolean>(activeRule?.enabled ?? true)
  const [expertOpen, setExpertOpen] = useState(false)
  const [includeRegex, setIncludeRegex] = useState(activeRule?.include_regex ?? '')
  const [excludeRegex, setExcludeRegex] = useState(activeRule?.exclude_regex ?? '')
  const [sampleText, setSampleText] = useState(DEFAULT_LLD_SAMPLES.join('\n'))
  const [preview, setPreview] = useState<LLDPreviewResult | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const updateRule = useUpdateTemplateLLDRuleMutation(template.id)
  const previewMutation = usePreviewLLDRuleMutation(template.id)
  const readOnly = template.is_builtin || !canControl

  useEffect(() => {
    setSelectedRuleId(rules[0]?.id ?? null)
    // 仅在切换方案时重置默认选中规则
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id])

  useEffect(() => {
    if (!activeRule) return
    setPresetFlags(parseLLDPresetFlags(activeRule))
    setKeepLostDays(activeRule.keep_lost_days ?? 7)
    setEnabled(activeRule.enabled)
    setIncludeRegex(activeRule.include_regex ?? '')
    setExcludeRegex(activeRule.exclude_regex ?? '')
  }, [activeRule])

  useEffect(() => {
    if (!expertOpen || !activeRule) return
    const timer = window.setTimeout(() => {
      const samples = sampleText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
      void previewMutation
        .mutateAsync({
          preset_flags: presetFlags,
          include_regex: includeRegex,
          exclude_regex: excludeRegex,
          samples,
        })
        .then((res) => {
          setPreview(res)
          setPreviewError(null)
        })
        .catch((err) => {
          setPreviewError(err instanceof Error ? err.message : '规则预览失败')
        })
    }, 150)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expertOpen, activeRule?.id, presetFlags, includeRegex, excludeRegex, sampleText])

  const handleSave = async () => {
    if (!activeRule || readOnly) return
    try {
      await updateRule.mutateAsync({
        ruleId: activeRule.id,
        input: {
          rule_key: activeRule.rule_key,
          name: activeRule.name,
          entity_type: activeRule.entity_type,
          preset_flags: presetFlags,
          include_regex: includeRegex.trim(),
          exclude_regex: excludeRegex.trim(),
          keep_lost_days: keepLostDays,
          enabled,
        },
      })
      toast.success('端口与硬件自动识别配置已保存')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存自动识别配置失败')
    }
  }

  if (!activeRule) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
        当前方案暂无自动识别规则，系统将沿用基础端口发现策略。
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">{activeRule.name}</span>
          <Badge variant="info" size="sm">
            {LLD_ENTITY_TYPE_LABELS[activeRule.entity_type] ?? activeRule.entity_type}
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          {rules.length > 1 && (
            <Select
              value={String(activeRule.id)}
              onValueChange={(val) => setSelectedRuleId(Number(val))}
            >
              <SelectTrigger aria-label="选择自动识别规则" className="h-9 w-auto gap-2 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {rules.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-2 text-xs text-foreground">
            <span>启用自动识别</span>
            <Switch aria-label="启用自动识别" disabled={readOnly} checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
      </div>

      <div className="space-y-2.5 rounded-lg border border-border bg-card p-4">
        <p className="text-xs font-semibold text-foreground">常用业务识别预设</p>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
          <Checkbox
            disabled={readOnly}
            checked={presetFlags.ignore_virtual}
            onCheckedChange={(c) => setPresetFlags((p) => ({ ...p, ignore_virtual: Boolean(c) }))}
          />
          <div>
            <span className="font-medium">自动忽略虚拟/环回口</span>
            <p className="text-xs text-muted-foreground">自动过滤 LoopBack、Null、Vlanif 等逻辑接口，聚焦物理端口质量</p>
          </div>
        </label>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
          <Checkbox
            disabled={readOnly}
            checked={presetFlags.ignore_idle}
            onCheckedChange={(c) => setPresetFlags((p) => ({ ...p, ignore_idle: Boolean(c) }))}
          />
          <div>
            <span className="font-medium">排除长期关闭闲置端口</span>
            <p className="text-xs text-muted-foreground">管理状态为关闭且长期无流量的空闲接入端口不纳入常态告警</p>
          </div>
        </label>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
          <Checkbox
            disabled={readOnly}
            checked={presetFlags.highlight_uplink}
            onCheckedChange={(c) => setPresetFlags((p) => ({ ...p, highlight_uplink: Boolean(c) }))}
          />
          <div>
            <span className="font-medium">优先重点监测上联高速口与聚合口</span>
            <p className="text-xs text-muted-foreground">高亮标记万兆上联、光口与链路聚合口，优先展示利用率与错包变化</p>
          </div>
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <div>
            <label htmlFor="keep-lost-days" className="text-xs font-medium text-foreground">
              拔线历史保留天数
            </label>
            <p className="text-[11px] text-muted-foreground">端口下线或光模块拔出后保留历史曲线的天数，到期自动清理</p>
          </div>
          <Select
            disabled={readOnly}
            value={String(keepLostDays)}
            onValueChange={(val) => setKeepLostDays(Number(val))}
          >
            <SelectTrigger
              id="keep-lost-days"
              aria-label="拔线历史保留天数"
              disabled={readOnly}
              className="h-9 w-auto gap-2 text-sm tabular-nums"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KEEP_LOST_DAY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <AutoDiscoveryExpertDrawer
        open={expertOpen}
        readOnly={readOnly}
        includeRegex={includeRegex}
        excludeRegex={excludeRegex}
        sampleText={sampleText}
        preview={preview}
        previewError={previewError}
        onToggle={() => setExpertOpen((prev) => !prev)}
        onChangeInclude={setIncludeRegex}
        onChangeExclude={setExcludeRegex}
        onChangeSamples={setSampleText}
      />

      {!readOnly && (
        <div className="flex justify-end">
          <Button type="button" loading={updateRule.isPending} onClick={() => void handleSave()}>
            <Save className="h-3.5 w-3.5" />
            保存识别规则
          </Button>
        </div>
      )}
    </div>
  )
}
