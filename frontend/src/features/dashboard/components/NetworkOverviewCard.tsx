import React from 'react'
import { Network } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/atoms'
import { NetworkOverviewItem } from '../types'
import { 
  HiOutlineServer,
  HiOutlineGlobeAlt,
  HiOutlineShieldCheck,
  HiOutlineWifi,
  HiOutlineCpuChip,
  HiOutlineCircleStack
} from 'react-icons/hi2'
import { 
  TbRouter,
  TbNetwork,
  TbDeviceDesktop,
  TbCloudNetwork
} from 'react-icons/tb'

interface NetworkOverviewCardProps {
  overview: NetworkOverviewItem[]
  loading?: boolean
}

// 扩展的图标映射 - 使用 react-icons 的现代图标
const iconMap = {
  // Heroicons v2 - 现代扁平风格
  Server: HiOutlineServer,
  Globe: HiOutlineGlobeAlt,
  Shield: HiOutlineShieldCheck,
  Wifi: HiOutlineWifi,
  Chip: HiOutlineCpuChip,
  Stack: HiOutlineCircleStack,
  // Tabler Icons - 简洁线条风格
  Router: TbRouter,
  Network: TbNetwork,
  Desktop: TbDeviceDesktop,
  Cloud: TbCloudNetwork,
}

// 根据设备类型获取更合适的图标和颜色
const getDeviceStyle = (title: string): { 
  icon: keyof typeof iconMap
  gradient: string
  bgColor: string
  iconColor: string
} => {
  const lowerTitle = title.toLowerCase()
  
  // 交换机类型
  if (lowerTitle.includes('switch') || lowerTitle.includes('交换机')) {
    return {
      icon: 'Network',
      gradient: 'from-blue-500 via-blue-600 to-indigo-600',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30',
      iconColor: 'text-blue-600 dark:text-blue-400'
    }
  }
  
  // 路由器类型
  if (lowerTitle.includes('router') || lowerTitle.includes('路由')) {
    return {
      icon: 'Router',
      gradient: 'from-purple-500 via-purple-600 to-pink-600',
      bgColor: 'bg-purple-50 dark:bg-purple-950/30',
      iconColor: 'text-purple-600 dark:text-purple-400'
    }
  }
  
  // 无线设备
  if (lowerTitle.includes('wifi') || lowerTitle.includes('无线') || lowerTitle.includes('ap')) {
    return {
      icon: 'Wifi',
      gradient: 'from-cyan-500 via-cyan-600 to-teal-600',
      bgColor: 'bg-cyan-50 dark:bg-cyan-950/30',
      iconColor: 'text-cyan-600 dark:text-cyan-400'
    }
  }
  
  // 安全设备
  if (lowerTitle.includes('firewall') || lowerTitle.includes('防火墙') || lowerTitle.includes('安全')) {
    return {
      icon: 'Shield',
      gradient: 'from-red-500 via-red-600 to-rose-600',
      bgColor: 'bg-red-50 dark:bg-red-950/30',
      iconColor: 'text-red-600 dark:text-red-400'
    }
  }
  
  // 服务器
  if (lowerTitle.includes('server') || lowerTitle.includes('服务器')) {
    return {
      icon: 'Server',
      gradient: 'from-green-500 via-green-600 to-emerald-600',
      bgColor: 'bg-green-50 dark:bg-green-950/30',
      iconColor: 'text-green-600 dark:text-green-400'
    }
  }
  
  // 云服务
  if (lowerTitle.includes('cloud') || lowerTitle.includes('云')) {
    return {
      icon: 'Cloud',
      gradient: 'from-sky-500 via-sky-600 to-blue-600',
      bgColor: 'bg-sky-50 dark:bg-sky-950/30',
      iconColor: 'text-sky-600 dark:text-sky-400'
    }
  }
  
  // 默认 - 芯片图标
  return {
    icon: 'Chip',
    gradient: 'from-gray-500 via-gray-600 to-slate-600',
    bgColor: 'bg-muted/40 dark:bg-gray-950/30',
    iconColor: 'text-muted-foreground'
  }
}

export const NetworkOverviewCard: React.FC<NetworkOverviewCardProps> = ({
  overview,
  loading = false
}) => {
  if (loading) {
    return (
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="w-5 h-5 text-blue-600" />
            网络概览
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="animate-pulse">
                  <div className="flex flex-col items-center p-6 rounded-2xl bg-gray-100 dark:bg-gray-800">
                    <div className="w-20 h-20 bg-gray-200 dark:bg-gray-700 rounded-2xl mb-4"></div>
                    <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
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
    <Card className="flex-1 flex flex-col overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="w-5 h-5 text-blue-600" />
          网络概览
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {overview.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {overview.map((item, index) => {
                const style = getDeviceStyle(item.title)
                const IconComponent = iconMap[style.icon]

                return (
                  <div 
                    key={index} 
                    className="group relative"
                  >
                    {/* 卡片容器 */}
                    <div className={`
                      relative overflow-hidden rounded-2xl p-6
                      ${style.bgColor}
                      border border-border
                      transition-all duration-300 ease-out
                      hover:shadow-xl hover:scale-[1.02]
                      hover:border-transparent
                      cursor-pointer
                    `}>
                      {/* 渐变背景效果 */}
                      <div className={`
                        absolute inset-0 bg-gradient-to-br ${style.gradient}
                        opacity-0 group-hover:opacity-10
                        transition-opacity duration-300
                      `} />
                      
                      {/* 内容 */}
                      <div className="relative flex flex-col items-center text-center">
                        {/* 图标容器 */}
                        <div className={`
                          relative mb-4
                          w-20 h-20 rounded-2xl
                          flex items-center justify-center
                          bg-card
                          shadow-lg
                          transition-all duration-300
                          group-hover:shadow-2xl
                          group-hover:scale-110
                          group-hover:rotate-3
                        `}>
                          {/* 图标光晕效果 */}
                          <div className={`
                            absolute inset-0 rounded-2xl
                            bg-gradient-to-br ${style.gradient}
                            opacity-0 group-hover:opacity-20
                            blur-xl transition-opacity duration-300
                          `} />
                          
                          {/* 图标 */}
                          {IconComponent && (
                            <IconComponent 
                              className={`
                                relative z-10 w-10 h-10
                                ${style.iconColor}
                                transition-transform duration-300
                                group-hover:scale-110
                              `}
                            />
                          )}
                        </div>

                        {/* 标题 */}
                        <h3 className={`
                          font-semibold text-base mb-2
                          text-foreground
                          transition-colors duration-300
                          group-hover:${style.iconColor}
                        `}>
                          {item.title}
                        </h3>

                        {/* 描述 */}
                        <p className="text-sm text-muted-foreground">
                          {item.description}
                        </p>

                        {/* 设备数量徽章 */}
                        <div className={`
                          mt-3 px-3 py-1 rounded-full
                          bg-card
                          border border-border
                          text-xs font-medium
                          ${style.iconColor}
                          transition-all duration-300
                          group-hover:scale-105
                        `}>
                          {item.count} 台设备
                        </div>
                      </div>

                      {/* 装饰性元素 */}
                      <div className={`
                        absolute -top-10 -right-10 w-32 h-32
                        rounded-full bg-gradient-to-br ${style.gradient}
                        opacity-0 group-hover:opacity-10
                        blur-3xl transition-opacity duration-500
                      `} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center py-12">
                <div className="relative inline-block mb-6">
                  <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full" />
                  <Network className="relative w-16 h-16 text-gray-300 dark:text-gray-700" />
                </div>
                <p className="text-gray-500 dark:text-muted-foreground text-lg font-medium mb-2">
                  暂无网络概览数据
                </p>
                <p className="text-gray-400 dark:text-muted-foreground/70 text-sm">
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
