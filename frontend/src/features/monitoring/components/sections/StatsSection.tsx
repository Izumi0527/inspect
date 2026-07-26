'use client'

import Link from 'next/link'
import { Activity, Server, AlertTriangle, Cpu, HardDrive, Upload, Download, RefreshCw } from 'lucide-react'
import { Button } from '@/components/atoms'
import { CompactStatCard } from '@/components/shared'
import { SectionHeader, SectionFailureContent } from '../shared'
import type { MonitoringDataEnvelope, StatCardData } from '../../types'

interface StatsSectionProps {
  section: MonitoringDataEnvelope['sections']['stats'] | undefined
  statsV2?: StatCardData[]
  onRetry: () => void
}

const STATS_ICON_MAP = {
  total_devices: Server,
  active_alerts: AlertTriangle,
  avg_cpu: Cpu,
  avg_memory: HardDrive,
  peak_outbound: Upload,
  peak_inbound: Download,
} as const

const STATS_COLOR_MAP = {
  total_devices: 'text-blue-600 dark:text-blue-400',
  active_alerts: 'text-red-600 dark:text-red-400',
  avg_cpu: 'text-teal-600 dark:text-teal-400',
  avg_memory: 'text-orange-600 dark:text-orange-400',
  peak_outbound: 'text-blue-600 dark:text-blue-400',
  peak_inbound: 'text-cyan-600 dark:text-cyan-400',
} as const

export function StatsSection({ section, statsV2 = [], onRetry }: StatsSectionProps) {
  return (
    <section>
      <SectionHeader icon={Activity} title="关键指标" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {section?.ok === false ? (
          <div className="col-span-full rounded-xl border-2 border-dashed border-red-200 bg-red-50/60 p-8 text-center dark:border-red-800 dark:bg-red-900/10">
            <SectionFailureContent
              title="关键指标"
              message={section?.message ?? '统计指标加载失败'}
              onRetry={onRetry}
            />
          </div>
        ) : statsV2.length > 0 ? (
          statsV2.map((stat) => {
            const IconComponent = STATS_ICON_MAP[stat.id as keyof typeof STATS_ICON_MAP] || Server
            const iconClassName = STATS_COLOR_MAP[stat.id as keyof typeof STATS_COLOR_MAP] || 'text-blue-600 dark:text-blue-400'
            return (
              <CompactStatCard
                key={stat.id}
                title={stat.title}
                value={stat.value}
                change={stat.change}
                trend={stat.trend}
                icon={IconComponent}
                iconClassName={iconClassName}
              />
            )
          })
        ) : (
          <div className="col-span-full rounded-xl border-2 border-dashed border-border bg-muted/40 p-8 text-center dark:border-border dark:bg-muted/40">
            <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-yellow-500" />
            <h3 className="mb-2 text-base font-semibold text-foreground">
              暂无统计数据
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              尚未采集到关键指标数据。你可以先添加设备并启动采集，或稍后重试。
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/devices">去设备管理</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/settings">查看采集配置</Link>
              </Button>
              <Button variant="outline" onClick={onRetry}>
                <RefreshCw className="mr-2 h-4 w-4" />
                重新加载
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
