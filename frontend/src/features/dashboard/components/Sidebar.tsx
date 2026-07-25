import React from 'react'
import Link from 'next/link'
import {
  Home,
  Monitor,
  BarChart3,
  Shield,
  Database,
  Settings,
  Menu,
  ChevronRight,
  Search,
  FileText
} from 'lucide-react'
import { Button } from '@/components/atoms'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'
import { useDisplayPreferences } from '@/hooks/useDatetimePreferencesSync'
import { NavigationItem } from '../types'

interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
  currentPath?: string
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggle,
  currentPath = '/dashboard'
}) => {
  // 侧边栏入口按“最小权限”控制显示，避免用户看到无权限入口后再被路由守卫拦截（提升体验）
  const canReadDevices = usePermission(Permission.DEVICES_READ)
  const canReadInspections = usePermission(Permission.INSPECTIONS_READ)
  const canReadMonitoring = usePermission(Permission.MONITORING_READ)
  const canReadAlerts = usePermission(Permission.ALERTS_READ)
  const canReadLogs = usePermission(Permission.SYSTEM_LOGS)
  const canReadReports = usePermission(Permission.REPORTS_READ)
  const canConfigSystem = usePermission(Permission.SYSTEM_CONFIG)

  // 标题读"通用配置-应用程序名称"（display-preferences，登录即可读），未加载时回退默认
  const { data: displayPrefs } = useDisplayPreferences()
  const applicationName = displayPrefs?.application_name?.trim() || '巡检系统'

  const navItems: NavigationItem[] = [
    { name: '总览', icon: Home, href: '/dashboard' },
    { name: '监控中心', icon: BarChart3, href: '/monitoring' },
    { name: '设备管理', icon: Monitor, href: '/devices' },
    { name: '巡检管理', icon: Search, href: '/inspection' },
    { name: '告警中心', icon: Shield, href: '/alerts' },
    { name: '日志中心', icon: FileText, href: '/logs' },
    { name: '报表分析', icon: Database, href: '/reports' },
    { name: '系统设置', icon: Settings, href: '/settings' },
  ]

  const navVisibilityByHref: Record<string, boolean> = {
    '/dashboard': true, // 仅需登录
    '/devices': canReadDevices,
    '/inspection': canReadInspections,
    '/monitoring': canReadMonitoring,
    '/alerts': canReadAlerts,
    '/logs': canReadLogs,
    '/reports': canReadReports,
    '/settings': canConfigSystem,
  }

  const visibleNavItems = navItems.filter((item) => navVisibilityByHref[item.href] ?? true)

  return (
    <div
      className={`fixed inset-y-0 left-0 z-50 ${isOpen ? 'w-64' : 'w-20'} transform border-r border-border/60 bg-card shadow-lg transition-all duration-300`}
    >
      <div className="flex items-center justify-between border-b border-border/60 p-4">
        {isOpen && (
          <h1 className="text-xl font-bold bg-gradient-to-r from-teal-600 to-cyan-500 bg-clip-text text-transparent">
            {applicationName}
          </h1>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          aria-label={isOpen ? '收起侧边栏' : '展开侧边栏'}
          title={isOpen ? '收起侧边栏' : '展开侧边栏'}
          className="text-foreground/80 hover:bg-muted/70 hover:text-foreground"
        >
          <Menu className="w-5 h-5" />
        </Button>
      </div>
      
      <nav className="mt-8">
        {visibleNavItems.map((item) => {
          const isActive = currentPath === item.href
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center px-4 py-3 transition-colors ${
                isActive
                  ? 'border-r-2 border-primary bg-primary/12 text-primary'
                  : 'text-foreground/88 hover:bg-muted/70 hover:text-foreground'
              }`}
            >
              <item.icon className="w-6 h-6 flex-shrink-0" />
              {isOpen && (
                <>
                  <span className="ml-3 text-sm font-medium">{item.name}</span>
                  {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
                </>
              )}
            </Link>
          )
        })}
      </nav>

      {isOpen && (
        <div className="absolute bottom-0 left-0 right-0 border-t border-border/60 p-4 text-center">
          <p className="text-xs text-foreground/50">v{process.env.NEXT_PUBLIC_APP_VERSION}</p>
        </div>
      )}
    </div>
  )
}
