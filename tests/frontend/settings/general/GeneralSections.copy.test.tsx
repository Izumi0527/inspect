import { render, screen } from '@testing-library/react'

import { BasicInfoSection } from '@/features/settings/components/general/BasicInfoSection'
import { GeneralOverviewCard } from '@/features/settings/components/general/GeneralOverviewCard'
import { InspectionConfigSection } from '@/features/settings/components/general/InspectionConfigSection'
import { ReportConfigSection } from '@/features/settings/components/general/ReportConfigSection'
import { UserPreferenceSection } from '@/features/settings/components/general/UserPreferenceSection'
import type {
  BasicInfoConfig,
  InspectionConfig,
  ReportConfig,
  UserPreferenceConfig,
} from '@/features/settings/types/general.types'

const basicInfo: BasicInfoConfig = {
  applicationName: '网络设备巡检系统',
  version: '1.0.1',
  timezone: 'Asia/Shanghai',
}

const inspectionConfig: InspectionConfig = {
  defaultTimeout: 30,
  maxConcurrentTasks: 10,
  retryAttempts: 3,
}

const reportConfig: ReportConfig = {
  defaultFormat: 'excel',
  maxExportRecords: 10000,
}

const userPreference: UserPreferenceConfig = {
  theme: 'auto',
  language: 'zh-CN',
  dateFormat: 'YYYY-MM-DD',
  timeFormat: '24h',
}

const removedExplanatoryCopies = [
  '当前页面用于定义系统基础行为与默认值',
  '建议先检查摘要信息',
  '默认行为说明',
  '以下设置共同决定系统的默认执行策略与展示方式',
  '维护系统身份信息，并作为当前页面整页配置的保存入口',
  '保存整页更改会同时提交当前页面中的基础信息、巡检配置、报表配置和个人偏好',
  '定义巡检任务的默认执行策略，直接影响系统任务调度与失败恢复行为',
  '建议先设置默认超时',
  '定义系统报表导出的默认输出策略与单次导出上限',
  '导出格式影响下游使用习惯',
  '定义系统界面与时间显示的默认偏好，帮助保持一致的展示体验',
  '该区块主要影响默认显示习惯',
]

const retainedFunctionalCopies = [
  '通用配置',
  '当前应用名称',
  '当前时区',
  '默认并发任务数',
  '默认超时时间',
  '默认导出格式',
  '当前主题 / 语言',
  '基础信息',
  '巡检配置',
  '报表配置',
  '个人偏好',
  '保存整页更改',
  '重置整页更改',
  '应用程序名称',
  '系统版本',
  '时区',
  '默认超时时间 (秒)',
  '最大并发任务数',
  '失败重试次数',
  '最大导出记录数',
  '主题',
  '语言',
  '日期格式',
  '时间格式',
]

describe('GeneralSettings 通用配置页说明文案', () => {
  it('不展示页面导览、区块用途和建议性说明文案', () => {
    render(
      <div>
        <GeneralOverviewCard
          applicationName={basicInfo.applicationName}
          timezone={basicInfo.timezone}
          maxConcurrentTasks={inspectionConfig.maxConcurrentTasks}
          defaultTimeout={inspectionConfig.defaultTimeout}
          defaultFormat={reportConfig.defaultFormat}
          theme={userPreference.theme}
          language={userPreference.language}
        />
        <BasicInfoSection
          data={basicInfo}
          onChange={jest.fn()}
          actions={{
            isDirty: true,
            isSaving: false,
            onSave: jest.fn(),
            onReset: jest.fn(),
          }}
        />
        <InspectionConfigSection data={inspectionConfig} onChange={jest.fn()} />
        <ReportConfigSection data={reportConfig} onChange={jest.fn()} />
        <UserPreferenceSection data={userPreference} onChange={jest.fn()} />
      </div>
    )

    for (const copy of removedExplanatoryCopies) {
      expect(screen.queryByText(copy, { exact: false })).not.toBeInTheDocument()
    }

    for (const copy of retainedFunctionalCopies) {
      expect(screen.getAllByText(copy, { exact: false }).length).toBeGreaterThan(0)
    }
  })
})
