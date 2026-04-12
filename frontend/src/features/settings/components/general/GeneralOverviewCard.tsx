'use client'

import React from 'react'
import { Clock3, FileText, Globe2, LayoutTemplate, ScanSearch, Settings2 } from 'lucide-react'
import { CompactStatCard } from '@/components/shared'

interface GeneralOverviewCardProps {
  applicationName: string
  timezone: string
  maxConcurrentTasks: number
  defaultTimeout: number
  defaultFormat: 'excel' | 'pdf' | 'csv'
  theme: 'light' | 'dark' | 'auto'
  language: 'zh-CN' | 'en-US'
}

const formatLabelMap: Record<GeneralOverviewCardProps['defaultFormat'], string> = {
  excel: 'Excel',
  pdf: 'PDF',
  csv: 'CSV',
}

const themeLabelMap: Record<GeneralOverviewCardProps['theme'], string> = {
  light: '浅色',
  dark: '深色',
  auto: '跟随系统',
}

const languageLabelMap: Record<GeneralOverviewCardProps['language'], string> = {
  'zh-CN': '简体中文',
  'en-US': 'English',
}

export const GeneralOverviewCard: React.FC<GeneralOverviewCardProps> = ({
  applicationName,
  timezone,
  maxConcurrentTasks,
  defaultTimeout,
  defaultFormat,
  theme,
  language,
}) => {
  return (
    <section
      aria-label="通用配置概览"
      className="rounded-xl border border-border bg-card/70 p-5 shadow-sm"
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-foreground">通用配置</h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              当前页面用于定义系统基础行为与默认值。建议先检查摘要信息，再按模块调整系统身份、巡检策略、报表输出和界面偏好。
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background/80 px-4 py-3 xl:min-w-[300px]">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              当前应用名称
            </p>
            <p className="mt-2 text-lg font-semibold text-foreground">{applicationName}</p>
            <p className="mt-2 text-xs text-muted-foreground">当前时区：{timezone}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CompactStatCard
            title="当前时区"
            value={timezone}
            icon={Globe2}
            iconClassName="text-blue-600 dark:text-blue-400"
            className="bg-background/80"
          />
          <CompactStatCard
            title="默认并发任务数"
            value={maxConcurrentTasks}
            icon={ScanSearch}
            iconClassName="text-green-600 dark:text-green-400"
            className="bg-background/80"
          />
          <CompactStatCard
            title="默认超时时间"
            value={`${defaultTimeout}s`}
            icon={Clock3}
            iconClassName="text-amber-600 dark:text-amber-400"
            className="bg-background/80"
          />
          <CompactStatCard
            title="默认导出格式"
            value={formatLabelMap[defaultFormat]}
            icon={FileText}
            iconClassName="text-purple-600 dark:text-purple-400"
            className="bg-background/80"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-background/80 px-4 py-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">当前主题 / 语言</span>
            <span className="ml-2">{themeLabelMap[theme]} / {languageLabelMap[language]}</span>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/80 px-4 py-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">默认行为说明</span>
            <span className="ml-2">以下设置共同决定系统的默认执行策略与展示方式。</span>
          </div>
        </div>
      </div>
    </section>
  )
}
