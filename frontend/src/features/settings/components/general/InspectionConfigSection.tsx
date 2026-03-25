'use client'

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
    <div className="p-4">
      <SectionHeader
        title="巡检配置"
        description="设备巡检任务的相关配置"
        icon="Search"
      />

      <div className="mt-6 space-y-4">
        {/* 默认超时时间单独一行（独立意义）*/}
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

        {/* 最大并发任务数 + 失败重试次数 并排（都是限额类数值）*/}
        <div className="grid grid-cols-2 gap-4">
          <ConfigItem
            label="最大并发任务数"
            description="同时执行的任务上限 (1-50)"
            required
          >
            <ConfigInput
              type="number"
              value={data.maxConcurrentTasks}
              onChange={(value) => onChange('maxConcurrentTasks', parseInt(value, 10))}
              min={1}
              max={50}
              className="w-full"
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
              className="w-full"
            />
          </ConfigItem>
        </div>
      </div>
    </div>
  )
}
