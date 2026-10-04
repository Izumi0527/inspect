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
import { NavigationItem } from '../../types'
import { APP_VERSION } from '@/lib/app-version'

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
      className={`fixed inset-y-0 left-0 z-50 ${isOpen ? 'w-60' : 'w-14'} transform border-r border-border bg-card transition-all duration-200 motion-reduce:transition-none`}
    >
      <div className={`flex items-center border-b border-border ${isOpen ? 'justify-between p-4' : 'justify-center p-2'}`}>
        {isOpen && (
          <h1 className="truncate text-[15px] font-semibold text-foreground">
            {applicationName}
          </h1>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          aria-label={isOpen ? '收起侧边栏' : '展开侧边栏'}
          title={isOpen ? '收起侧边栏' : '展开侧边栏'}
          className="text-muted-foreground hover:bg-surface-3 hover:text-foreground"
        >
          <Menu className="w-5 h-5" />
        </Button>
      </div>

      <nav className="mt-3 flex flex-col gap-0.5 px-2">
        {visibleNavItems.map((item) => {
          const isActive = currentPath === item.href

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center rounded-sm py-2 text-sm transition-colors duration-100 motion-reduce:transition-none ${
                isOpen ? 'gap-3 px-2' : 'justify-center px-0'
              } ${
                isActive
                  ? 'bg-primary/10 font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-surface-3 hover:text-foreground'
              }`}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {isOpen && (
                <>
                  <span className="truncate">{item.name}</span>
                  {isActive && <ChevronRight className="ml-auto h-4 w-4 text-primary" />}
                </>
              )}
            </Link>
          )
        })}
      </nav>

      {isOpen && (
        <div className="absolute bottom-0 left-0 right-0 border-t border-border p-3 text-center">
          <p className="text-xs text-muted-foreground tabular-nums">v{APP_VERSION}</p>
        </div>
      )}
    </div>
  )
}
