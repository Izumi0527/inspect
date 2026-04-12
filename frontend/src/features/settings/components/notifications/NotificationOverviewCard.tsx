'use client'

import React from 'react'
import { BellRing, Mail, MessageSquare } from 'lucide-react'
import { CompactStatCard } from '@/components/shared'

interface NotificationOverviewCardProps {
  emailEnabled: boolean
  smsEnabled: boolean
}

const statusText = (enabled: boolean) => (enabled ? '已启用' : '未启用')

export const NotificationOverviewCard: React.FC<NotificationOverviewCardProps> = ({
  emailEnabled,
  smsEnabled,
}) => {
  const enabledCount = [emailEnabled, smsEnabled].filter(Boolean).length

  return (
    <section aria-label="通知中心概览" className="rounded-xl border border-border bg-card/70 p-5 shadow-sm">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">通知中心</h2>
          </div>
          <div className="rounded-xl border border-border bg-background/80 px-4 py-3 lg:min-w-[240px]">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">已启用渠道</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{enabledCount} / 2</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <CompactStatCard title="邮件通知" value={statusText(emailEnabled)} icon={Mail} iconClassName="text-blue-600 dark:text-blue-400" className="bg-background/80" />
          <CompactStatCard title="短信通知" value={statusText(smsEnabled)} icon={MessageSquare} iconClassName="text-green-600 dark:text-green-400" className="bg-background/80" />
          <CompactStatCard title="已启用渠道" value={`${enabledCount} 个`} icon={BellRing} iconClassName="text-amber-600 dark:text-amber-400" className="bg-background/80 sm:col-span-2 xl:col-span-1" />
        </div>
      </div>
    </section>
  )
}
