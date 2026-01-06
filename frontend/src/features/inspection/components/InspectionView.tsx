import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Calendar, 
  FileText, 
  History, 
  BarChart3,
  Search,
  Filter,
  RefreshCw
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  Card,
  CardHeader,
  CardContent,
  Button,
  Input
} from '@/components/atoms'
import { AppLayout } from '@/components/layout'
import { useInspectionStats } from '../hooks/useInspection'
import { InspectionStrategies } from './InspectionStrategies'
import { InspectionTemplates } from './InspectionTemplates'
import { InspectionExecutions } from './InspectionExecutions'
import { InspectionAnalytics } from './InspectionAnalytics'

type TabType = 'strategies' | 'templates' | 'executions' | 'analytics'

interface TabConfig {
  key: TabType
  label: string
  icon: LucideIcon
}

export const InspectionView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('strategies')
  const [searchText, setSearchText] = useState('')
  
  const { data: stats, isLoading: statsLoading } = useInspectionStats()

  const tabs: TabConfig[] = [
    {
      key: 'strategies',
      label: '巡检策略',
      icon: Calendar
    },
    {
      key: 'templates',
      label: '巡检模板',
      icon: FileText
    },
    {
      key: 'executions',
      label: '执行历史',
      icon: History
    },
    {
      key: 'analytics',
      label: '统计分析',
      icon: BarChart3
    }
  ]

  const renderTabContent = () => {
    switch (activeTab) {
      case 'strategies':
        return <InspectionStrategies searchText={searchText} />
      case 'templates':
        return <InspectionTemplates searchText={searchText} />
      case 'executions':
        return <InspectionExecutions searchText={searchText} />
      case 'analytics':
        return <InspectionAnalytics />
      default:
        return null
    }
  }

  return (
    <AppLayout title="巡检管理">
      <div className="flex flex-col space-y-4 min-h-[calc(100vh-112px)] pb-4">
        {/* 快速统计卡片 */}
        {!statsLoading && stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.totalStrategies}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">总策略数</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{stats.activeStrategies}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">活跃策略</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-purple-600">{stats.todayExecutions}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">今日执行</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-orange-600">{stats.avgScore.toFixed(1)}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">平均评分</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 标签导航 */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="pb-0">
          <div className="flex flex-col sm:flex-row gap-3 justify-between">
            {/* 标签按钮 */}
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.key

                return (
                  <motion.button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`
                      relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                      transition-all duration-200
                      ${isActive
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }
                    `}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                    {isActive && (
                      <motion.div
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full"
                        layoutId="activeTabIndicator"
                      />
                    )}
                  </motion.button>
                )
              })}
            </div>

            {/* 搜索和操作按钮 */}
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <Input
                  placeholder="搜索..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pl-10 w-48"
                />
              </div>
              <Button variant="outline" size="sm">
                <Filter className="w-4 h-4 mr-2" />
                筛选
              </Button>
              <Button variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 mr-2" />
                刷新
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col overflow-hidden pt-4">
          {/* 标签内容区域 */}
          <div className="flex-1 overflow-y-auto">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderTabContent()}
            </motion.div>
          </div>
        </CardContent>
      </Card>
      </div>
    </AppLayout>
  )
}