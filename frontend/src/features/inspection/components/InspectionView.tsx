import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Calendar, 
  FileText, 
  History, 
  BarChart3,
  Activity,
  Star
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CompactStatCard } from '@/components/shared'
import {
  Card,
  CardHeader,
  CardContent
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
        return <InspectionStrategies />
      case 'templates':
        return <InspectionTemplates />
      case 'executions':
        return <InspectionExecutions />
      case 'analytics':
        return <InspectionAnalytics />
      default:
        return null
    }
  }

  return (
    <AppLayout title="巡检管理">
      <div className="flex flex-col gap-4 h-full">
        {/* 快速统计卡片 */}
        {!statsLoading && stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <CompactStatCard
              title="总策略数"
              value={stats.totalStrategies}
              icon={FileText}
              iconClassName="text-blue-600 dark:text-blue-400"
              valueClassName="text-blue-600 dark:text-blue-400"
            />
            <CompactStatCard
              title="活跃策略"
              value={stats.activeStrategies}
              icon={Activity}
              iconClassName="text-green-600 dark:text-green-400"
              valueClassName="text-green-600 dark:text-green-400"
            />
            <CompactStatCard
              title="今日执行"
              value={stats.todayExecutions}
              icon={History}
              iconClassName="text-purple-600 dark:text-purple-400"
              valueClassName="text-purple-600 dark:text-purple-400"
            />
            <CompactStatCard
              title="平均评分"
              value={stats.avgScore.toFixed(1)}
              icon={Star}
              iconClassName="text-orange-600 dark:text-orange-400"
              valueClassName="text-orange-600 dark:text-orange-400"
            />
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
                        : 'text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:bg-muted/40'
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
          </div>
        </CardHeader>

        <CardContent className="flex flex-col overflow-hidden pt-4">
          {/* 标签内容区域 */}
          <div className="overflow-y-auto">
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
