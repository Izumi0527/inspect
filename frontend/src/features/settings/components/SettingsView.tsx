import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Settings,
  Users,
  Shield,
  FileText,
  Database,
  Bell,
  Monitor,
  Search,
  Filter,
  RefreshCw
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardContent,
  Button,
  Badge,
  Input
} from '@/components/atoms'
import { AppLayout } from '@/components/layout'
import { useSystemInfo, useSystemHealth } from '../hooks'
import { SystemConfiguration } from './SystemConfiguration'
import { UserManagement } from './UserManagement'
import { SecuritySettings } from './SecuritySettings'
import { AuditLogs } from './AuditLogs'
import { BackupRestore } from './BackupRestore'
import { NotificationSettings } from './NotificationSettings'
import { SystemMonitoring } from './SystemMonitoring'

type TabType =
  | 'general'
  | 'users'
  | 'security'
  | 'logs'
  | 'backup'
  | 'notifications'
  | 'monitoring'

type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>

interface TabConfig {
  key: TabType
  label: string
  icon: IconComponent
  description: string
  badge?: string
}

const TAB_CONFIGS: TabConfig[] = [
  {
    key: 'general',
    label: '常规设置',
    icon: Settings,
    description: '系统基本配置与核心参数管理'
  },
  {
    key: 'users',
    label: '用户管理',
    icon: Users,
    description: '维护用户账号、角色与权限分配'
  },
  {
    key: 'security',
    label: '安全设置',
    icon: Shield,
    description: '密码策略、访问控制与目录集成',
    badge: undefined
  },
  {
    key: 'logs',
    label: '审计日志',
    icon: FileText,
    description: '追踪操作轨迹并支持导出审计数据'
  },
  {
    key: 'backup',
    label: '备份恢复',
    icon: Database,
    description: '定期备份系统数据并执行恢复操作'
  },
  {
    key: 'notifications',
    label: '通知设置',
    icon: Bell,
    description: '配置告警渠道与消息推送策略'
  },
  {
    key: 'monitoring',
    label: '系统监控',
    icon: Monitor,
    description: '监控资源利用率与服务运行健康'
  }
]

export const SettingsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('general')
  const [searchText, setSearchText] = useState('')

  const { data: systemInfo } = useSystemInfo()
  const { data: systemHealth } = useSystemHealth()

  const tabs = TAB_CONFIGS.map(tab =>
    tab.key === 'security'
      ? {
          ...tab,
          badge: systemHealth?.overall === 'critical' ? '警告' : tab.badge
        }
      : tab.key === 'monitoring'
        ? {
            ...tab,
            badge: systemHealth?.overall === 'warning' ? '异常' : tab.badge
          }
        : tab
  )

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return <SystemConfiguration searchText={searchText} />
      case 'users':
        return <UserManagement searchText={searchText} />
      case 'security':
        return <SecuritySettings />
      case 'logs':
        return <AuditLogs searchText={searchText} />
      case 'backup':
        return <BackupRestore />
      case 'notifications':
        return <NotificationSettings />
      case 'monitoring':
        return <SystemMonitoring />
      default:
        return null
    }
  }

  const healthBadgeClass =
    systemHealth?.overall === 'healthy'
      ? 'text-green-600 dark:text-green-400'
      : systemHealth?.overall === 'warning'
        ? 'text-yellow-600 dark:text-yellow-400'
        : 'text-red-600 dark:text-red-400'

  const healthLabel =
    systemHealth?.overall === 'healthy'
      ? '正常'
      : systemHealth?.overall === 'warning'
        ? '警告'
        : systemHealth?.overall === 'critical'
          ? '异常'
          : '--'

  return (
    <AppLayout title="系统设置">
      <div className="space-y-6">
        {/* 系统状态卡片 */}
        {systemInfo && systemHealth && (
          <div className="flex gap-4 overflow-x-auto">
            <Card className="min-w-[160px]">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">系统版本</p>
                <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100">{systemInfo.version}</p>
              </CardContent>
            </Card>
            <Card className="min-w-[160px]">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">运行状态</p>
                <p className={`mt-2 text-lg font-semibold ${healthBadgeClass}`}>{healthLabel}</p>
              </CardContent>
            </Card>
            <Card className="min-w-[160px]">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">累计运行天数</p>
                <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {Math.floor(systemInfo.uptime / 86400)} 天
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 标签导航 */}
        <Card>
          <CardHeader className="pb-0">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {tabs.map(tab => {
                  const Icon = tab.icon
                  const isActive = tab.key === activeTab

                  return (
                    <motion.button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={`relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                        isActive
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400'
                      }`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                      {tab.badge && (
                        <Badge variant="danger" size="sm">
                          {tab.badge}
                        </Badge>
                      )}
                      {isActive && (
                        <motion.span
                          layoutId="settings-tab-indicator"
                          className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400"
                        />
                      )}
                    </motion.button>
                  )
                })}
              </div>

              <div className="flex gap-2">
                {['general', 'users', 'logs'].includes(activeTab) && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <Input
                      placeholder="搜索..."
                      value={searchText}
                      onChange={event => setSearchText(event.target.value)}
                      className="w-48 pl-10"
                    />
                  </div>
                )}
                <Button variant="outline" size="sm">
                  <Filter className="mr-2 h-4 w-4" />筛选
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSearchText('')}>
                  <RefreshCw className="mr-2 h-4 w-4" />刷新
                </Button>
              </div>
            </div>

            <div className="pt-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">{tabs.find(tab => tab.key === activeTab)?.description}</p>
            </div>
          </CardHeader>

          <CardContent className="pt-4">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderTabContent()}
            </motion.div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}
