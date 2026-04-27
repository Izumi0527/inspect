'use client'

import React from 'react'
import { Clock3, FileText, Globe2, ScanSearch } from 'lucide-react'
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
  dark: '暗色',
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
          <div>
            <h2 className="text-2xl font-semibold text-foreground">通用配置</h2>
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
            iconClassName="text-sky-600 dark:text-sky-300"
            className="border-border/60 bg-background/80"
          />
          <CompactStatCard
            title="默认并发任务数"
            value={maxConcurrentTasks}
            icon={ScanSearch}
            iconClassName="text-emerald-600 dark:text-emerald-300"
            className="border-border/60 bg-background/80"
          />
          <CompactStatCard
            title="默认超时时间"
            value={`${defaultTimeout}s`}
            icon={Clock3}
            iconClassName="text-amber-600 dark:text-amber-300"
            className="border-border/60 bg-background/80"
          />
          <CompactStatCard
            title="默认导出格式"
            value={formatLabelMap[defaultFormat]}
            icon={FileText}
            iconClassName="text-slate-600 dark:text-slate-300"
            className="border-border/60 bg-background/80"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-background/80 px-4 py-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">当前主题 / 语言</span>
            <span className="ml-2">{themeLabelMap[theme]} / {languageLabelMap[language]}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
