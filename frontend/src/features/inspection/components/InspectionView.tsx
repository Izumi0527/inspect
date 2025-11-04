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
  description: string
}

export const InspectionView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('strategies')
  const [searchText, setSearchText] = useState('')
  
  const { data: stats, isLoading: statsLoading } = useInspectionStats()

  const tabs: TabConfig[] = [
    {
      key: 'strategies',
      label: '巡检策略',
      icon: Calendar,
      description: '配置和管理巡检策略'
    },
    {
      key: 'templates',
      label: '巡检模板',
      icon: FileText,
      description: '管理巡检项目模板'
    },
    {
      key: 'executions',
      label: '执行历史',
      icon: History,
      description: '查看巡检执行记录'
    },
    {
      key: 'analytics',
      label: '统计分析',
      icon: BarChart3,
      description: '巡检数据分析报告'
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
    <AppLayout title="巡检管理" fullWidth={true}>
      <div className="space-y-4">
        {/* 快速统计卡片 */}
        {!statsLoading && stats && (
          <div className="flex gap-4">
            <Card className="min-w-[120px]">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.totalStrategies}</div>
                <div className="text-sm text-gray-600">总策略数</div>
              </CardContent>
            </Card>
            <Card className="min-w-[120px]">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{stats.activeStrategies}</div>
                <div className="text-sm text-gray-600">活跃策略</div>
              </CardContent>
            </Card>
            <Card className="min-w-[120px]">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-purple-600">{stats.todayExecutions}</div>
                <div className="text-sm text-gray-600">今日执行</div>
              </CardContent>
            </Card>
            <Card className="min-w-[120px]">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-orange-600">{stats.avgScore.toFixed(1)}</div>
                <div className="text-sm text-gray-600">平均评分</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 标签导航 */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
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
                        ? 'bg-blue-50 text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
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
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
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

          {/* 当前标签描述 */}
          <div className="pt-2">
            <p className="text-sm text-gray-600">
              {tabs.find(tab => tab.key === activeTab)?.description}
            </p>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          {/* 标签内容区域 */}
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