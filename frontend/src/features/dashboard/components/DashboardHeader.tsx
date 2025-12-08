import React from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Button, Input } from '@/components/atoms'
import { ThemeToggle } from '@/components/molecules'
import { useDeviceSearch } from '../hooks/useDashboard'
import { NotificationCenter } from './NotificationCenter'
import { UserMenu } from './UserMenu'

interface DashboardHeaderProps {
  title?: string
  subtitle?: string
  alertCount?: number
  onSearch?: (query: string) => void
  showSearch?: boolean              // 是否显示搜索框（默认 true）
  actions?: React.ReactNode         // 自定义操作区域 slot
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  title = '控制台总览',
  subtitle,
  alertCount = 0,
  showSearch = true,
  actions
}) => {
  const router = useRouter()
  const { query, results, searching, showResults, setQuery, clearSearch } = useDeviceSearch()

  return (
    <header className="bg-white dark:bg-card shadow-sm border-b dark:border-border">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-foreground">{title}</h1>
            {subtitle && (
              <p className="text-sm text-gray-600 dark:text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-4">
            {/* 自定义操作区域 */}
            {actions}

            {/* 搜索框 - 条件渲染 */}
            {showSearch && (
              <div className="relative">
                <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <Input
                  type="text"
                  placeholder="搜索设备..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-10 pr-12 py-2 w-56"
                />
                {query && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    onClick={() => {
                      clearSearch()
                      setQuery('')
                    }}
                  >
                    清除
                  </Button>
                )}

                {/* 搜索结果下拉 */}
                {showResults && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-card border border-gray-200 dark:border-border rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                    {searching ? (
                      <div className="p-4 text-center text-gray-500 dark:text-muted-foreground">搜索中...</div>
                    ) : results.length > 0 ? (
                      <div className="py-2">
                        {results.map((device) => (
                          <div
                            key={device.id}
                            className="px-4 py-2 hover:bg-gray-50 dark:hover:bg-accent/10 cursor-pointer flex items-center justify-between"
                          >
                            <div>
                              <div className="font-medium text-gray-900 dark:text-foreground">{device.name}</div>
                              <div className="text-sm text-gray-600 dark:text-muted-foreground">{device.ip}</div>
                            </div>
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              device.status === 'online' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                              device.status === 'warning' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                              'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                            }`}>
                              {device.status === 'online' ? '在线' :
                               device.status === 'warning' ? '告警' : '离线'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-center text-gray-500 dark:text-muted-foreground">没有找到匹配的设备</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 主题切换 */}
            <ThemeToggle />

            {/* 通知中心 */}
            <NotificationCenter
              alertCount={alertCount}
              onViewAll={() => router.push('/alerts')}
            />

            {/* 用户菜单 */}
            <UserMenu />
          </div>
        </div>
      </div>
    </header>
  )
}