import React from 'react'
import { 
  Server, 
  Wifi, 
  Shield, 
  Monitor,
  HardDrive,
  CheckCircle,
  Power,
  AlertTriangle,
  Clock
} from 'lucide-react'
import { Badge } from '@/components/atoms'
import { DeviceStatus, DeviceType } from '../types'

interface DeviceIconProps {
  type: DeviceType
  className?: string
}

export const DeviceIcon: React.FC<DeviceIconProps> = ({ type, className = "h-5 w-5" }) => {
  const iconMap = {
    switch: <Server className={className} />,
    router: <Wifi className={className} />,
    firewall: <Shield className={className} />,
    server: <HardDrive className={className} />,
    wireless_ap: <Wifi className={className} />
  }
  
  return iconMap[type] || <Monitor className={className} />
}

interface StatusBadgeProps {
  status: DeviceStatus
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const statusConfig = {
    online: { label: '在线', variant: 'success' as const, icon: CheckCircle },
    offline: { label: '离线', variant: 'error' as const, icon: Power },
    warning: { label: '告警', variant: 'warning' as const, icon: AlertTriangle },
    maintenance: { label: '维护', variant: 'info' as const, icon: Clock },
    unknown: { label: '未知', variant: 'neutral' as const, icon: Clock }
  }
  
  const config = statusConfig[status]
  const IconComponent = config.icon
  
  return (
    <Badge
      variant={config.variant}
      size="sm"
      className="flex items-center gap-1 py-0.5 leading-none"
    >
      <IconComponent className="h-3 w-3" />
      <span className="leading-none">{config.label}</span>
    </Badge>
  )
}

