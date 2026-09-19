import type { IconType } from 'react-icons'
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

import type { NetworkOverviewItem, TopologyLLDPStatus, TopologyNodeStatus } from '../../types'

// 网络概览卡片与拓扑图共用的图标、配色与文案元数据。
// 拓扑节点与类型图例必须长得一样，否则用户无法把"图例里的交换机"和"图上的交换机"对上。

export const iconMap = {
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
} satisfies Record<string, IconType>

export type DeviceIconName = keyof typeof iconMap

export interface DeviceVisualMeta {
  icon: DeviceIconName
  surfaceClassName: string
  iconClassName: string
  titleHoverClassName: string
  // SVG 内无法使用 Tailwind 文本色类给描边着色，单独给一个 stroke 类
  strokeClassName: string
}

export const deviceVisualMetaMap: Record<DeviceIconName, DeviceVisualMeta> = {
  Network: {
    icon: 'Network',
    surfaceClassName: 'bg-blue-50 dark:bg-blue-950/30',
    iconClassName: 'text-blue-600 dark:text-blue-400',
    titleHoverClassName: 'group-hover:text-blue-600 dark:group-hover:text-blue-400',
    strokeClassName: 'stroke-blue-500/60',
  },
  Router: {
    icon: 'Router',
    surfaceClassName: 'bg-sky-50 dark:bg-sky-950/30',
    iconClassName: 'text-sky-600 dark:text-sky-400',
    titleHoverClassName: 'group-hover:text-sky-600 dark:group-hover:text-sky-400',
    strokeClassName: 'stroke-sky-500/60',
  },
  Wifi: {
    icon: 'Wifi',
    surfaceClassName: 'bg-cyan-50 dark:bg-cyan-950/30',
    iconClassName: 'text-cyan-600 dark:text-cyan-400',
    titleHoverClassName: 'group-hover:text-cyan-600 dark:group-hover:text-cyan-400',
    strokeClassName: 'stroke-cyan-500/60',
  },
  Shield: {
    icon: 'Shield',
    surfaceClassName: 'bg-red-50 dark:bg-red-950/30',
    iconClassName: 'text-red-600 dark:text-red-400',
    titleHoverClassName: 'group-hover:text-red-600 dark:group-hover:text-red-400',
    strokeClassName: 'stroke-red-500/60',
  },
  Cloud: {
    icon: 'Cloud',
    surfaceClassName: 'bg-sky-50 dark:bg-sky-950/30',
    iconClassName: 'text-sky-600 dark:text-sky-400',
    titleHoverClassName: 'group-hover:text-sky-600 dark:group-hover:text-sky-400',
    strokeClassName: 'stroke-sky-500/60',
  },
  Server: {
    icon: 'Server',
    surfaceClassName: 'bg-green-50 dark:bg-green-950/30',
    iconClassName: 'text-green-600 dark:text-green-400',
    titleHoverClassName: 'group-hover:text-green-600 dark:group-hover:text-green-400',
    strokeClassName: 'stroke-green-500/60',
  },
  Desktop: {
    icon: 'Desktop',
    surfaceClassName: 'bg-indigo-50 dark:bg-indigo-950/30',
    iconClassName: 'text-indigo-600 dark:text-indigo-400',
    titleHoverClassName: 'group-hover:text-indigo-600 dark:group-hover:text-indigo-400',
    strokeClassName: 'stroke-indigo-500/60',
  },
  Globe: {
    icon: 'Globe',
    surfaceClassName: 'bg-teal-50 dark:bg-teal-950/30',
    iconClassName: 'text-teal-600 dark:text-teal-400',
    titleHoverClassName: 'group-hover:text-teal-600 dark:group-hover:text-teal-400',
    strokeClassName: 'stroke-teal-500/60',
  },
  Chip: {
    icon: 'Chip',
    surfaceClassName: 'bg-muted/40 dark:bg-gray-950/30',
    iconClassName: 'text-muted-foreground',
    titleHoverClassName: 'group-hover:text-foreground',
    strokeClassName: 'stroke-muted-foreground/50',
  },
  Stack: {
    icon: 'Stack',
    surfaceClassName: 'bg-gray-50 dark:bg-gray-900/40',
    iconClassName: 'text-slate-600 dark:text-slate-300',
    titleHoverClassName: 'group-hover:text-slate-700 dark:group-hover:text-slate-200',
    strokeClassName: 'stroke-slate-500/60',
  },
}

// 设备类型（台账 device_type / SNMP 识别值）→ 中文文案
const deviceTypeLabels: Record<string, string> = {
  switch: '交换机',
  router: '路由器',
  firewall: '防火墙',
  ap: '无线 AP',
  wireless_ap: '无线 AP',
  server: '服务器',
}

export const getDeviceTypeLabel = (type: string): string => {
  const normalized = type.trim().toLowerCase()
  if (normalized === '') return '未分类'
  return deviceTypeLabels[normalized] ?? type
}

// 设备类型 → 视觉元数据；未知类型退回芯片图标
export const getDeviceVisualMetaByType = (type: string): DeviceVisualMeta => {
  switch (type.trim().toLowerCase()) {
    case 'switch':
      return deviceVisualMetaMap.Network
    case 'router':
      return deviceVisualMetaMap.Router
    case 'firewall':
      return deviceVisualMetaMap.Shield
    case 'ap':
    case 'wireless_ap':
      return deviceVisualMetaMap.Wifi
    case 'server':
      return deviceVisualMetaMap.Server
    default:
      return deviceVisualMetaMap.Chip
  }
}

// 分组项（后端按 device_type 分组的名称）→ 视觉元数据：先按已知类型，再按标题关键字兜底
export const getDeviceVisualMeta = (item: NetworkOverviewItem): DeviceVisualMeta => {
  const byType = getDeviceVisualMetaByType(item.title)
  if (byType !== deviceVisualMetaMap.Chip) {
    return byType
  }

  const directMatch = deviceVisualMetaMap[item.iconName as DeviceIconName]
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

export const getNetworkStatusMeta = (status: NetworkOverviewItem['status']) => {
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

// 拓扑节点状态 → 文案与描边/指示色
export const getTopologyNodeStatusMeta = (status: TopologyNodeStatus) => {
  switch (status) {
    case 'online':
      return { label: '在线', dotClassName: 'fill-emerald-500', badgeClassName: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' }
    case 'offline':
      return { label: '离线', dotClassName: 'fill-rose-500', badgeClassName: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' }
    case 'warning':
      return { label: '告警', dotClassName: 'fill-amber-500', badgeClassName: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' }
    default:
      return { label: '未知', dotClassName: 'fill-gray-400', badgeClassName: 'bg-gray-100 text-gray-700 dark:bg-gray-900/60 dark:text-gray-300' }
  }
}

// LLDP 采集判定的展示文案。华为 S 系列的缺省 SNMP 视图只含 internet(1.3.6.1)，LLDP-MIB(1.0.8802)
// 在视图外，这是生产环境「开了 LLDP 却没有链路」最常见的原因，所以把设备侧命令直接给到运维。
export const getTopologyLLDPStatusMeta = (status: TopologyLLDPStatus | undefined) => {
  switch (status) {
    case 'ok':
      return { label: '正常', badgeClassName: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' }
    case 'mib_unreachable':
      return { label: 'SNMP 视图未放行', badgeClassName: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' }
    case 'disabled':
      return { label: '设备未启用', badgeClassName: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' }
    default:
      return { label: '尚未采集', badgeClassName: 'bg-gray-100 text-gray-700 dark:bg-gray-900/60 dark:text-gray-300' }
  }
}

export const HUAWEI_LLDP_VIEW_COMMANDS = [
  'snmp-agent mib-view included iso-view iso',
  'snmp-agent community read <community> mib-view iso-view',
] as const

export const HUAWEI_LLDP_ENABLE_COMMAND = 'lldp enable'
