'use client'

import React from 'react'
import { Archive, Database, HardDrive, History, ShieldCheck } from 'lucide-react'
import { CompactStatCard } from '@/components/shared'
import type { BackupRecord } from '@/features/settings/types/backup.types'

interface BackupOverviewCardProps {
  totalCount: number
  diskUsage: {
    used: number
    total: number
    percentage: number
  }
  autoBackupEnabled: boolean
  retentionDays: number
  latestBackup?: BackupRecord
}

export const BackupOverviewCard: React.FC<BackupOverviewCardProps> = ({
  totalCount,
  diskUsage,
  autoBackupEnabled,
  retentionDays,
  latestBackup,
}) => {
  const latestBackupLabel = latestBackup
    ? `${latestBackup.status === 'success' ? '成功' : latestBackup.status === 'failed' ? '失败' : '进行中'}`
    : '暂无记录'

  return (
    <section aria-label="备份管理概览" className="rounded-xl border border-border bg-card/70 p-5 shadow-sm">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-foreground">备份管理</h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              当前页面用于管理备份策略、历史资产与恢复操作。建议先检查备份健康摘要，再调整策略或执行恢复、删除等运维动作。
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background/80 px-4 py-3 xl:min-w-[320px]">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">当前备份健康度</p>
            <p className="mt-2 text-lg font-semibold text-foreground">磁盘使用率 {diskUsage.percentage}%</p>
            <p className="mt-2 text-xs text-muted-foreground">自动备份：{autoBackupEnabled ? '已启用' : '未启用'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CompactStatCard title="备份总数" value={totalCount} icon={Archive} iconClassName="text-blue-600 dark:text-blue-400" className="bg-background/80" />
          <CompactStatCard title="磁盘使用率" value={`${diskUsage.percentage}%`} icon={HardDrive} iconClassName="text-amber-600 dark:text-amber-400" className="bg-background/80" />
          <CompactStatCard title="自动备份" value={autoBackupEnabled ? '已启用' : '未启用'} icon={ShieldCheck} iconClassName="text-green-600 dark:text-green-400" className="bg-background/80" />
          <CompactStatCard title="保留天数" value={`${retentionDays} 天`} icon={History} iconClassName="text-purple-600 dark:text-purple-400" className="bg-background/80" />
        </div>

        <div className="rounded-lg border border-border/60 bg-background/80 px-4 py-3 text-sm text-muted-foreground">
          <Database className="mr-2 inline h-4 w-4 text-foreground" />
          最近备份状态：<span className="font-medium text-foreground">{latestBackupLabel}</span>
        </div>
      </div>
    </section>
  )
}
