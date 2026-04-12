'use client'

import { SectionHeader } from '@/features/settings/components/shared/SectionHeader'
import { ConfigItem } from '@/features/settings/components/shared/ConfigItem'
import { ConfigInput } from '@/features/settings/components/shared/ConfigInput'
import { ConfigSelect } from '@/features/settings/components/shared/ConfigSelect'
import type { ReportConfig } from '@/features/settings/types/general.types'

interface Props {
  data: ReportConfig
  onChange: (field: keyof ReportConfig, value: any) => void
}

const formatOptions = [
  { value: 'excel', label: 'Excel (xlsx)' },
  { value: 'pdf', label: 'PDF' },
  { value: 'csv', label: 'CSV' },
]

export function ReportConfigSection({ data, onChange }: Props) {
  return (
    <section
      aria-label="报表配置"
      className="rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      <SectionHeader
        title="报表配置"
        icon="FileText"
      />

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ConfigItem
          label="默认导出格式"
          description="报表导出时的默认文件格式"
          required
        >
          <ConfigSelect
            value={data.defaultFormat}
            options={formatOptions}
            onChange={(value) => onChange('defaultFormat', value as 'excel' | 'pdf' | 'csv')}
          />
        </ConfigItem>

        <ConfigItem
          label="最大导出记录数"
          description="单次导出允许的最大数量 (1-100000)"
          required
        >
          <ConfigInput
            type="number"
            value={data.maxExportRecords}
            onChange={(value) => onChange('maxExportRecords', parseInt(value, 10))}
            min={1}
            max={100000}
            className="w-full"
          />
        </ConfigItem>
      </div>
    </section>
  )
}
