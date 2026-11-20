'use client'

import { useState } from 'react'
import { FlaskConical, Play } from 'lucide-react'
import { Button } from '@/components/atoms'
import { useMonitoringDevices } from '../../hooks/useMonitoringDevices'
import { useTestMonitoringItemMutation } from '../../hooks/useMonitoringConfig'
import type { CustomCollectResult, MonitorItemInput } from '../../types/zabbix-monitoring.types'

interface ItemTestBenchProps {
  buildItemInput: () => MonitorItemInput | null
}

const STEP_LABELS: Record<string, string> = {
  multiplier: '单位倍率换算',
  change_per_sec: '每秒速率换算',
  regex: '文本正则提取',
  valuemap: '状态中文翻译',
}

export function ItemTestBench({ buildItemInput }: ItemTestBenchProps) {
  const { data: devices = [] } = useMonitoringDevices()
  const testMutation = useTestMonitoringItemMutation()
  const [deviceId, setDeviceId] = useState<string>('')
  const [result, setResult] = useState<CustomCollectResult | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const handleRunTest = async () => {
    const targetId = Number(deviceId)
    if (!Number.isInteger(targetId) || targetId <= 0) {
      setLocalError('请先选择一台目标测试设备')
      return
    }
    const item = buildItemInput()
    if (!item) {
      setLocalError('请先完善上方采集配置后再执行测试')
      return
    }
    setLocalError(null)
    try {
      const res = await testMutation.mutateAsync({ device_id: targetId, item })
      setResult(res)
    } catch (err) {
      setResult(null)
      setLocalError(err instanceof Error ? err.message : '在线测试执行失败')
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-2/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <FlaskConical className="h-4 w-4 text-primary" />
          <span>在线测试台</span>
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <select
            aria-label="选择测试设备"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="h-8 min-w-44 rounded-md border border-input bg-card px-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option value="">选择测试设备...</option>
            {devices.map((dev) => (
              <option key={dev.id} value={dev.id}>
                {dev.name} ({dev.ipAddress})
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            loading={testMutation.isPending}
            onClick={() => void handleRunTest()}
          >
            <Play className="h-3.5 w-3.5" />
            执行测试
          </Button>
        </div>
      </div>

      {localError && <p className="text-xs text-danger">{localError}</p>}

      {result && (
        <div className="space-y-2 rounded-md border border-border bg-card p-2.5 text-xs">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <span className="text-muted-foreground">设备原始值：</span>
              <span className="font-mono font-medium text-foreground tabular-nums">
                {result.raw_value || '—'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">最终显示值：</span>
              <span className="font-semibold text-primary tabular-nums">
                {result.display_text || result.final_value}
              </span>
            </div>
            <div className="text-right text-muted-foreground tabular-nums">
              耗时 {result.duration_ms} ms
            </div>
          </div>

          {result.steps.length > 0 && (
            <div className="space-y-1 border-t border-border pt-2">
              <p className="font-medium text-muted-foreground">分步换算中间值：</p>
              {result.steps.map((step) => (
                <div
                  key={step.step_index}
                  className="flex flex-wrap items-center justify-between gap-2 rounded bg-surface-2 px-2 py-1 tabular-nums"
                >
                  <span className="text-foreground">
                    第 {step.step_index + 1} 步 · {STEP_LABELS[step.type] ?? step.type}
                  </span>
                  {step.error ? (
                    <span className="text-danger">{step.error}</span>
                  ) : (
                    <span className="font-mono text-muted-foreground">
                      {step.input} → <strong className="text-foreground">{step.output}</strong>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
