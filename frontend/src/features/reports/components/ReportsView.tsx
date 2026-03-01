import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useSearchParams } from 'next/navigation'
import {
  FileText,
  TrendingUp,
  BarChart3,
  Settings,
  Search
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardContent,
  Input
} from '@/components/atoms'
import { AppLayout } from '@/components/layout'
import { useReportStats } from '../hooks/useReports'
import { InspectionReports } from './InspectionReports'
import { TrendAnalysis } from './TrendAnalysis'
import { StatisticsReports } from './StatisticsReports'
import { CustomReports } from './CustomReports'

type TabType = 'inspection' | 'trends' | 'statistics' | 'custom'

type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>

interface TabConfig {
  key: TabType
  label: string
  icon: IconComponent
  description: string
}

export const ReportsView: React.FC = () => {
  const searchParams = useSearchParams()

  const tabFromUrl = useMemo((): TabType | null => {
    const raw = String(searchParams?.get('tab') || '').toLowerCase().trim()
    if (!raw) return null
    if (raw === 'trend') return 'trends'
    if (raw === 'inspection' || raw === 'trends' || raw === 'statistics' || raw === 'custom') {
      return raw as TabType
    }
    return null
  }, [searchParams])

  const [activeTab, setActiveTab] = useState<TabType>(tabFromUrl || 'inspection')
  const [searchText, setSearchText] = useState('')
  
  const { data: stats, isLoading: statsLoading } = useReportStats()

  useEffect(() => {
    if (tabFromUrl) {
      setActiveTab(tabFromUrl)
    }
  }, [tabFromUrl])

  const tabs: TabConfig[] = [
    {
      key: 'inspection',
      label: '巡检报告',
      icon: FileText,
      description: '生成详细的巡检报告和分析'
    },
    {
      key: 'trends',
      label: '趋势分析',
      icon: TrendingUp,
      description: '设备性能趋势和预测分析'
    },
    {
      key: 'statistics',
      label: '统计报表',
      icon: BarChart3,
      description: '多维度数据统计和KPI分析'
    },
    {
      key: 'custom',
      label: '自定义报表',
      icon: Settings,
      description: '灵活的自定义报表生成器'
    }
  ]

  const renderTabContent = () => {
    switch (activeTab) {
      case 'inspection':
        return <InspectionReports searchText={searchText} />
      case 'trends':
        return <TrendAnalysis searchText={searchText} />
      case 'statistics':
        return <StatisticsReports searchText={searchText} />
      case 'custom':
        return <CustomReports searchText={searchText} />
      default:
        return null
    }
  }

  return (
    <AppLayout title="报表分析">
      <div className="flex flex-col gap-4 h-full">
        {/* 快速统计卡片 */}
        {!statsLoading && stats && (
          <div className="flex gap-3">
            <Card className="min-w-[120px]">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-500">{stats.totalReports}</div>
                <div className="text-sm text-muted-foreground">总报表数</div>
              </CardContent>
            </Card>
            <Card className="min-w-[120px]">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-600 dark:text-green-500">{stats.generatedToday}</div>
                <div className="text-sm text-muted-foreground">今日生成</div>
              </CardContent>
            </Card>
            <Card className="min-w-[120px]">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-500">{stats.scheduledReports}</div>
                <div className="text-sm text-muted-foreground">定时报表</div>
              </CardContent>
            </Card>
            <Card className="min-w-[120px]">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-500">{stats.mostUsedFormat.toUpperCase()}</div>
                <div className="text-sm text-muted-foreground">热门格式</div>
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
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:bg-muted/60'
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
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground/80" />
                <Input
                  placeholder="搜索报表..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pl-10 w-48"
                />
              </div>
            </div>
          </div>

          {/* 当前标签描述 */}
          <div className="pt-2">
            <p className="text-sm text-muted-foreground">
              {tabs.find(tab => tab.key === activeTab)?.description}
            </p>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col overflow-hidden pt-4">
          {/* 标签内容区域 */}
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-auto"
          >
            {renderTabContent()}
          </motion.div>
        </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}
