'use client'

import { SectionHeader } from '@/features/settings/components/shared/SectionHeader'
import { ConfigItem } from '@/features/settings/components/shared/ConfigItem'
import { ConfigInput } from '@/features/settings/components/shared/ConfigInput'
import { ConfigSelect } from '@/features/settings/components/shared/ConfigSelect'
import type { UserPreferenceConfig } from '@/features/settings/types/general.types'

interface Props {
  data: UserPreferenceConfig
  onChange: <K extends keyof UserPreferenceConfig>(field: K, value: UserPreferenceConfig[K]) => void
}

const themeOptions = [
  { value: 'light', label: '浅色模式' },
  { value: 'dark', label: '暗色模式' },
  { value: 'auto', label: '跟随系统' },
]

const languageOptions = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' },
]

const timeFormatOptions = [
  { value: '12h', label: '12小时制 (AM/PM)' },
  { value: '24h', label: '24小时制' },
]

export function UserPreferenceSection({ data, onChange }: Props) {
  return (
    <section
      aria-label="个人偏好"
      className="rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      <SectionHeader
        title="个人偏好"
        icon="User"
      />

      <div className="mt-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ConfigItem label="主题" description="选择界面的主题外观" required>
            <ConfigSelect
              value={data.theme}
              options={themeOptions}
              onChange={(value) => onChange('theme', value as 'light' | 'dark' | 'auto')}
            />
          </ConfigItem>

          <ConfigItem label="语言" description="选择界面显示的语言" required>
            <ConfigSelect
              value={data.language}
              options={languageOptions}
              onChange={(value) => onChange('language', value as 'zh-CN' | 'en-US')}
            />
          </ConfigItem>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ConfigItem label="日期格式" description="自定义日期显示格式，如 YYYY-MM-DD" required>
            <ConfigInput
              value={data.dateFormat}
              onChange={(value) => onChange('dateFormat', value)}
              placeholder="YYYY-MM-DD"
              className="w-full"
            />
          </ConfigItem>

          <ConfigItem label="时间格式" description="选择时间显示格式" required>
            <ConfigSelect
              value={data.timeFormat}
              options={timeFormatOptions}
              onChange={(value) => onChange('timeFormat', value as '12h' | '24h')}
            />
          </ConfigItem>
        </div>
      </div>
    </section>
  )
}
