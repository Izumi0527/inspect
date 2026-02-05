'use client'

import { SectionHeader } from '@/features/settings/components/shared/SectionHeader'
import { ConfigItem } from '@/features/settings/components/shared/ConfigItem'
import { ConfigInput } from '@/features/settings/components/shared/ConfigInput'
import { ConfigSelect } from '@/features/settings/components/shared/ConfigSelect'
import type { BasicInfoConfig } from '@/features/settings/types/general.types'

interface Props {
  data: BasicInfoConfig
  onChange: (field: keyof BasicInfoConfig, value: any) => void
}

const timezones = [
  { value: 'Asia/Shanghai', label: '中国标准时间 (UTC+8)' },
  { value: 'America/New_York', label: '美国东部时间 (UTC-5)' },
  { value: 'Europe/London', label: '英国时间 (UTC+0)' },
  { value: 'Asia/Tokyo', label: '日本标准时间 (UTC+9)' },
  { value: 'Australia/Sydney', label: '澳大利亚东部时间 (UTC+10)' },
]

export function BasicInfoSection({ data, onChange }: Props) {
  return (
    <div className="p-4">
      <SectionHeader
        title="基础信息"
        description="系统的基本信息配置"
        icon="Info"
      />

      <div className="mt-6 space-y-4">
        <ConfigItem
          label="应用程序名称"
          description="显示在浏览器标题和导航栏的应用名称"
          required
        >
          <ConfigInput
            value={data.applicationName}
            onChange={(value) => onChange('applicationName', value)}
            placeholder="网络设备巡检系统"
          />
        </ConfigItem>

        <ConfigItem
          label="系统版本"
          description="当前系统的版本号"
          readonly
        >
          <ConfigInput value={data.version} disabled />
        </ConfigItem>

        <ConfigItem
          label="时区"
          description="系统使用的时区，影响日志时间和任务调度"
          required
        >
          <ConfigSelect
            value={data.timezone}
            options={timezones}
            onChange={(value) => onChange('timezone', value)}
          />
        </ConfigItem>
      </div>
    </div>
  )
}
