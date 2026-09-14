import React from 'react'
import { Network } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/atoms'
import { cn } from '@/utils/cn'
import { NetworkOverviewItem, NetworkTopology } from '../types'
import { NetworkTopologyGraph } from './topology/NetworkTopologyGraph'
import {
  getDeviceTypeLabel,
  getDeviceVisualMeta,
  getNetworkStatusMeta,
  iconMap,
} from './topology/deviceVisualMeta'

interface NetworkOverviewCardProps {
  overview: NetworkOverviewItem[]
  topology: NetworkTopology
  loading?: boolean
}

const CardShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Card className="flex flex-1 flex-col overflow-hidden">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Network className="h-5 w-5 text-blue-600" />
        网络概览
      </CardTitle>
    </CardHeader>
    <CardContent className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">{children}</div>
    </CardContent>
  </Card>
)

export const NetworkOverviewCard: React.FC<NetworkOverviewCardProps> = ({
  overview,
  topology,
  loading = false,
}) => {
  if (loading) {
    return (
      <CardShell>
        <div className="animate-pulse space-y-6">
          <div className="flex gap-3">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="h-8 w-28 rounded-full bg-gray-200 dark:bg-gray-700" />
            ))}
          </div>
          <div className="flex justify-center gap-12">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="h-24 w-24 rounded-2xl bg-gray-200 dark:bg-gray-700" />
            ))}
          </div>
        </div>
      </CardShell>
    )
  }

  const hasData = overview.length > 0 || topology.nodes.length > 0

  if (!hasData) {
    return (
      <CardShell>
        <div className="flex h-full items-center justify-center">
          <div className="py-12 text-center">
            <div className="relative mb-6 inline-block">
              <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-2xl" />
              <Network className="relative h-16 w-16 text-gray-300 dark:text-gray-700" />
            </div>
            <p className="mb-2 text-lg font-medium text-gray-500 dark:text-muted-foreground">
              暂无网络概览数据
            </p>
            <p className="text-sm text-gray-400 dark:text-muted-foreground/70">
              系统正在收集网络设备信息
            </p>
          </div>
        </div>
      </CardShell>
    )
  }

  return (
    <CardShell>
      <div className="flex flex-col gap-4">
        {overview.length > 0 && (
          <ul
            className="flex flex-wrap items-center gap-2"
            role="list"
            aria-label="网络概览设备类型图例"
          >
            {overview.map((item) => {
              const visualMeta = getDeviceVisualMeta(item)
              const statusMeta = getNetworkStatusMeta(item.status)
              const IconComponent = iconMap[visualMeta.icon]
              return (
                <li
                  key={`${item.title}-${item.status}`}
                  className={cn(
                    'group inline-flex items-center gap-2 rounded-full border border-border py-1 pl-1.5 pr-3 text-xs transition-all duration-300 hover:shadow-md',
                    visualMeta.surfaceClassName
                  )}
                  aria-label={`${getDeviceTypeLabel(item.title)}，${statusMeta.label}，${item.count} 台设备`}
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-card shadow-sm">
                    <IconComponent className={cn('h-4 w-4', visualMeta.iconClassName)} />
                  </span>
                  <span className="font-medium text-foreground">{getDeviceTypeLabel(item.title)}</span>
                  <span className={cn('font-semibold', visualMeta.iconClassName)}>{item.count} 台</span>
                  <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', statusMeta.className)}>
                    {statusMeta.label}
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        <NetworkTopologyGraph topology={topology} />
      </div>
    </CardShell>
  )
}
