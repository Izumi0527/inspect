import React from 'react'
import { Search, Bell } from 'lucide-react'
import { Button, Input } from '@/components/atoms'
import { useDeviceSearch } from '../hooks/useDashboard'

interface DashboardHeaderProps {
  title?: string
  subtitle?: string
  alertCount?: number
  onSearch?: (query: string) => void
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  title = '控制台总览',
  subtitle = '欢迎回来，查看您的网络设备运行状态',
  alertCount = 0
}) => {
  const { query, results, searching, showResults, setQuery, clearSearch } = useDeviceSearch()

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            <p className="text-gray-600">{subtitle}</p>
          </div>
          <div className="flex items-center gap-4">
            {/* 搜索框 */}
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <Input
                type="text"
                placeholder="搜索设备..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10 pr-12 py-2 w-64"
              />
              {query && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
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
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                  {searching ? (
                    <div className="p-4 text-center text-gray-500">搜索中...</div>
                  ) : results.length > 0 ? (
                    <div className="py-2">
                      {results.map((device) => (
                        <div
                          key={device.id}
                          className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
                        >
                          <div>
                            <div className="font-medium text-gray-900">{device.name}</div>
                            <div className="text-sm text-gray-600">{device.ip}</div>
                          </div>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            device.status === 'online' ? 'bg-green-100 text-green-800' :
                            device.status === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {device.status === 'online' ? '在线' :
                             device.status === 'warning' ? '告警' : '离线'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-gray-500">没有找到匹配的设备</div>
                  )}
                </div>
              )}
            </div>

            {/* 通知按钮 */}
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5" />
              {alertCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {alertCount > 9 ? '9+' : alertCount}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}