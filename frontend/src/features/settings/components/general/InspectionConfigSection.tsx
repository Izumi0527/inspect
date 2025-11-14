'use client'

import { Card } from '@/components/ui/card'
import { SectionHeader } from '@/features/settings/components/shared/SectionHeader'
import { ConfigItem } from '@/features/settings/components/shared/ConfigItem'
import { ConfigInput } from '@/features/settings/components/shared/ConfigInput'
import type { InspectionConfig } from '@/features/settings/types/general.types'

interface Props {
  data: InspectionConfig
  onChange: (field: keyof InspectionConfig, value: any) => void
}

export function InspectionConfigSection({ data, onChange }: Props) {
  return (
    <Card className="p-6">
      <SectionHeader
        title="巡检配置"
        description="设备巡检任务的相关配置"
        icon="Search"
      />

      <div className="mt-6 space-y-4">
        <ConfigItem
          label="最大并发任务数"
          description="同时执行的巡检任务最大数量 (1-50)"
          required
        >
          <ConfigInput
            type="number"
            value={data.maxConcurrentTasks}
            onChange={(value) => onChange('maxConcurrentTasks', parseInt(value, 10))}
            min={1}
            max={50}
          />
        </ConfigItem>

        <ConfigItem
          label="默认超时时间 (秒)"
          description="巡检任务的默认超时时间 (5-300秒)"
          required
        >
          <ConfigInput
            type="number"
            value={data.defaultTimeout}
            onChange={(value) => onChange('defaultTimeout', parseInt(value, 10))}
            min={5}
            max={300}
          />
        </ConfigItem>

        <ConfigItem
          label="失败重试次数"
          description="巡检失败后的自动重试次数 (0-10次)"
          required
        >
          <ConfigInput
            type="number"
            value={data.retryAttempts}
            onChange={(value) => onChange('retryAttempts', parseInt(value, 10))}
            min={0}
            max={10}
          />
        </ConfigItem>
      </div>
    </Card>
  )
}
