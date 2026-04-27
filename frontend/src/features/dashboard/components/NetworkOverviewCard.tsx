import React from 'react'
import { Network } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/atoms'
import { cn } from '@/utils/cn'
import { NetworkOverviewItem } from '../types'
import {
  HiOutlineServer,
  HiOutlineGlobeAlt,
  HiOutlineShieldCheck,
  HiOutlineWifi,
  HiOutlineCpuChip,
  HiOutlineCircleStack,
} from 'react-icons/hi2'
import {
  TbRouter,
  TbNetwork,
  TbDeviceDesktop,
  TbCloudNetwork,
} from 'react-icons/tb'

interface NetworkOverviewCardProps {
  overview: NetworkOverviewItem[]
  loading?: boolean
}

const iconMap = {
  Server: HiOutlineServer,
  Globe: HiOutlineGlobeAlt,
  Shield: HiOutlineShieldCheck,
  Wifi: HiOutlineWifi,
  Chip: HiOutlineCpuChip,
  Stack: HiOutlineCircleStack,
  Router: TbRouter,
  Network: TbNetwork,
  Desktop: TbDeviceDesktop,
  Cloud: TbCloudNetwork,
}

type DeviceVisualMeta = {
  icon: keyof typeof iconMap
  surfaceClassName: string
  iconClassName: string
  titleHoverClassName: string
}

const deviceVisualMetaMap: Record<string, DeviceVisualMeta> = {
  Network: {
    icon: 'Network',
    surfaceClassName: 'bg-blue-50 dark:bg-blue-950/30',
    iconClassName: 'text-blue-600 dark:text-blue-400',
    titleHoverClassName: 'group-hover:text-blue-600 dark:group-hover:text-blue-400',
  },
  Router: {
    icon: 'Router',
    surfaceClassName: 'bg-sky-50 dark:bg-sky-950/30',
    iconClassName: 'text-sky-600 dark:text-sky-400',
    titleHoverClassName: 'group-hover:text-sky-600 dark:group-hover:text-sky-400',
  },
  Wifi: {
    icon: 'Wifi',
    surfaceClassName: 'bg-cyan-50 dark:bg-cyan-950/30',
    iconClassName: 'text-cyan-600 dark:text-cyan-400',
    titleHoverClassName: 'group-hover:text-cyan-600 dark:group-hover:text-cyan-400',
  },
  Shield: {
    icon: 'Shield',
    surfaceClassName: 'bg-red-50 dark:bg-red-950/30',
    iconClassName: 'text-red-600 dark:text-red-400',
    titleHoverClassName: 'group-hover:text-red-600 dark:group-hover:text-red-400',
  },
  Cloud: {
    icon: 'Cloud',
    surfaceClassName: 'bg-sky-50 dark:bg-sky-950/30',
    iconClassName: 'text-sky-600 dark:text-sky-400',
    titleHoverClassName: 'group-hover:text-sky-600 dark:group-hover:text-sky-400',
  },
  Server: {
    icon: 'Server',
    surfaceClassName: 'bg-green-50 dark:bg-green-950/30',
    iconClassName: 'text-green-600 dark:text-green-400',
    titleHoverClassName: 'group-hover:text-green-600 dark:group-hover:text-green-400',
  },
  Desktop: {
    icon: 'Desktop',
    surfaceClassName: 'bg-indigo-50 dark:bg-indigo-950/30',
    iconClassName: 'text-indigo-600 dark:text-indigo-400',
    titleHoverClassName: 'group-hover:text-indigo-600 dark:group-hover:text-indigo-400',
  },
  Globe: {
    icon: 'Globe',
    surfaceClassName: 'bg-teal-50 dark:bg-teal-950/30',
    iconClassName: 'text-teal-600 dark:text-teal-400',
    titleHoverClassName: 'group-hover:text-teal-600 dark:group-hover:text-teal-400',
  },
  Chip: {
    icon: 'Chip',
    surfaceClassName: 'bg-muted/40 dark:bg-gray-950/30',
    iconClassName: 'text-muted-foreground',
    titleHoverClassName: 'group-hover:text-foreground',
  },
  Stack: {
    icon: 'Stack',
    surfaceClassName: 'bg-gray-50 dark:bg-gray-900/40',
    iconClassName: 'text-slate-600 dark:text-slate-300',
    titleHoverClassName: 'group-hover:text-slate-700 dark:group-hover:text-slate-200',
  },
}

const getDeviceVisualMeta = (item: NetworkOverviewItem): DeviceVisualMeta => {
  const directMatch = deviceVisualMetaMap[item.iconName]
  if (directMatch) {
    return directMatch
  }

  const lowerTitle = item.title.toLowerCase()
  if (lowerTitle.includes('router') || lowerTitle.includes('路由')) {
    return deviceVisualMetaMap.Router
  }
  if (lowerTitle.includes('wifi') || lowerTitle.includes('无线') || lowerTitle.includes('ap')) {
    return deviceVisualMetaMap.Wifi
  }
  if (lowerTitle.includes('firewall') || lowerTitle.includes('防火墙') || lowerTitle.includes('安全')) {
    return deviceVisualMetaMap.Shield
  }
  if (lowerTitle.includes('cloud') || lowerTitle.includes('云')) {
    return deviceVisualMetaMap.Cloud
  }
  if (lowerTitle.includes('server') || lowerTitle.includes('服务器')) {
    return deviceVisualMetaMap.Server
  }
  if (lowerTitle.includes('switch') || lowerTitle.includes('交换机')) {
    return deviceVisualMetaMap.Network
  }

  return deviceVisualMetaMap.Chip
}

const getNetworkStatusMeta = (status: NetworkOverviewItem['status']) => {
  switch (status) {
    case 'healthy':
      return {
        label: '健康',
        className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
        gradientClassName: 'from-emerald-500 to-teal-600',
        description: '运行稳定，暂无异常波动',
      }
    case 'warning':
      return {
        label: '告警',
        className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
        gradientClassName: 'from-amber-500 to-orange-600',
        description: '存在风险信号，建议尽快排查',
      }
    case 'critical':
      return {
        label: '严重',
        className: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
        gradientClassName: 'from-rose-500 to-pink-600',
        description: '需要立即处理当前链路异常',
      }
    case 'normal':
      return {
        label: '正常',
        className: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
        gradientClassName: 'from-sky-500 to-blue-600',
        description: '当前运行平稳，保持持续观察',
      }
    default:
      return {
        label: '未知',
        className: 'bg-gray-100 text-gray-700 dark:bg-gray-900/60 dark:text-gray-300',
        gradientClassName: 'from-gray-500 to-slate-600',
        description: '等待设备继续上报最新状态',
      }
  }
}

const resolveCardDescription = (
  item: NetworkOverviewItem,
  statusMeta: ReturnType<typeof getNetworkStatusMeta>
) => {
  const description = item.description.trim()
  const duplicatedCountLabel = `${item.count} 台设备`
  if (!description || description === duplicatedCountLabel) {
    return statusMeta.description
  }
  return description
}

export const NetworkOverviewCard: React.FC<NetworkOverviewCardProps> = ({
  overview,
  loading = false,
}) => {
  if (loading) {
    return (
      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5 text-blue-600" />
            网络概览
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="animate-pulse">
                  <div className="flex flex-col items-center rounded-2xl bg-gray-100 p-6 dark:bg-gray-800">
                    <div className="mb-4 h-20 w-20 rounded-2xl bg-gray-200 dark:bg-gray-700" />
                    <div className="mb-2 h-5 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="flex flex-1 flex-col overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="h-5 w-5 text-blue-600" />
          网络概览
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {overview.length > 0 ? (
            <div
              className="grid grid-cols-1 gap-6 md:grid-cols-3"
              role="list"
              aria-label="网络概览设备类型列表"
            >
              {overview.map((item) => {
                const visualMeta = getDeviceVisualMeta(item)
                const statusMeta = getNetworkStatusMeta(item.status)
                const IconComponent = iconMap[visualMeta.icon]
                const accentGradientClassName = item.gradient.trim() || statusMeta.gradientClassName
                const description = resolveCardDescription(item, statusMeta)

                return (
                  <article
                    key={`${item.title}-${item.status}`}
                    className="group relative"
                    role="listitem"
                    aria-label={`${item.title}，${statusMeta.label}，${item.count} 台设备`}
                  >
                    <div
                      className={cn(
                        'relative overflow-hidden rounded-2xl border border-border p-6 transition-all duration-300 ease-out hover:scale-[1.02] hover:border-transparent hover:shadow-xl',
                        visualMeta.surfaceClassName
                      )}
                    >
                      <div
                        className={cn(
                          'absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-300 group-hover:opacity-10',
                          accentGradientClassName
                        )}
                      />

                      <div className="relative flex flex-col items-center text-center">
                        <div
                          className={cn(
                            'mb-3 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium tracking-wide',
                            statusMeta.className
                          )}
                        >
                          {statusMeta.label}
                        </div>

                        <div className="relative mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-card shadow-lg transition-all duration-300 group-hover:rotate-3 group-hover:scale-110 group-hover:shadow-2xl">
                          <div
                            className={cn(
                              'absolute inset-0 rounded-2xl bg-gradient-to-br opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-20',
                              accentGradientClassName
                            )}
                          />

                          <IconComponent
                            className={cn(
                              'relative z-10 h-10 w-10 transition-transform duration-300 group-hover:scale-110',
                              visualMeta.iconClassName
                            )}
                          />
                        </div>

                        <h3
                          className={cn(
                            'mb-2 text-base font-semibold text-foreground transition-colors duration-300',
                            visualMeta.titleHoverClassName
                          )}
                        >
                          {item.title}
                        </h3>

                        <p className="text-sm text-muted-foreground">
                          {description}
                        </p>

                        <div
                          className={cn(
                            'mt-3 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium transition-all duration-300 group-hover:scale-105',
                            visualMeta.iconClassName
                          )}
                        >
                          {item.count} 台设备
                        </div>
                      </div>

                      <div
                        className={cn(
                          'absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-10',
                          accentGradientClassName
                        )}
                      />
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
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
          )}
        </div>
      </CardContent>
    </Card>
  )
}
