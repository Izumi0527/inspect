import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  FileText,
  TrendingUp,
  BarChart3,
  Settings,
  AlertTriangle
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardContent
} from '@/components/atoms'
import { AppLayout } from '@/components/layout'
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
}

export const ReportsView: React.FC = () => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const isMockFallbackEnabled =
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_REPORTS_ENABLE_MOCK === '1'

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

  const handleTabChange = (nextTab: TabType) => {
    setActiveTab(nextTab)

    const nextParams = new URLSearchParams(searchParams?.toString())
    nextParams.set('tab', nextTab)
    router.replace(`${pathname}?${nextParams.toString()}`)
  }

  useEffect(() => {
    if (tabFromUrl) {
      setActiveTab(tabFromUrl)
    }
  }, [tabFromUrl])

  const tabs: TabConfig[] = [
    {
      key: 'inspection',
      label: '巡检报告',
      icon: FileText
    },
    {
      key: 'trends',
      label: '趋势分析',
      icon: TrendingUp
    },
    {
      key: 'statistics',
      label: '统计报表',
      icon: BarChart3
    },
    {
      key: 'custom',
      label: '自定义报表',
      icon: Settings
    }
  ]

  const renderTabContent = () => {
    switch (activeTab) {
      case 'inspection':
        return (
          <InspectionReports
            searchText={searchText}
            onSearchTextChange={setSearchText}
          />
        )
      case 'trends':
        return (
          <TrendAnalysis
            searchText={searchText}
            onSearchTextChange={setSearchText}
          />
        )
      case 'statistics':
        return (
          <StatisticsReports
            searchText={searchText}
            onSearchTextChange={setSearchText}
          />
        )
      case 'custom':
        return (
          <CustomReports
            searchText={searchText}
            onSearchTextChange={setSearchText}
          />
        )
      default:
        return null
    }
  }

  return (
    <AppLayout title="报表分析">
      <div className="flex flex-col gap-4 h-full">
        {/* Mock 回退提示：避免验收时误判“已对接后端” */}
        {isMockFallbackEnabled && (
          <Card className="border-yellow-300/60 bg-yellow-50 dark:bg-yellow-900/20">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 mt-0.5 text-yellow-700 dark:text-yellow-300" />
              <div className="space-y-1">
                <div className="text-sm font-medium text-yellow-900 dark:text-yellow-200">
                  当前处于 Mock 回退模式（NEXT_PUBLIC_REPORTS_ENABLE_MOCK=1）
                </div>
                <div className="text-xs text-yellow-900/80 dark:text-yellow-200/80">
                  非生产环境下接口失败会回退示例/空数据，可能掩盖后端未联调问题。验收“真对接”时请关闭该开关，并以浏览器 Network/后端日志为准。
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 标签导航 */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="pb-0">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.key
                
                return (
                  <motion.button
                    key={tab.key}
                    onClick={() => handleTabChange(tab.key)}
                    className={`
                      relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                      transition-all duration-200
                      ${isActive
                        ? 'bg-primary/10 text-primary shadow-sm dark:bg-primary/12'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                      }
                    `}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                    {isActive && (
                      <motion.div
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                        layoutId="activeTabIndicator"
                      />
                    )}
                  </motion.button>
                )
              })}
            </div>
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
