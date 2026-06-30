import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Calendar, 
  FileText, 
  History, 
  BarChart3,
  Activity,
  Star,
  AlertCircle
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CompactStatCard } from '@/components/shared'
import {
  Card,
  CardHeader,
  CardContent,
  Button
} from '@/components/atoms'
import { AppLayout } from '@/components/layout'
import { useInspectionStats } from '../hooks/useInspection'
import { InspectionStrategies } from './InspectionStrategies'
import { InspectionTemplates } from './InspectionTemplates'
import { InspectionExecutions } from './InspectionExecutions'
import { InspectionAnalytics } from './InspectionAnalytics'
import toast from 'react-hot-toast'
import { useWebSocketEvent, WebSocketEvents, wsManager } from '@/lib/websocket'

type TabType = 'strategies' | 'templates' | 'executions' | 'analytics'

interface TabConfig {
  key: TabType
  label: string
  icon: LucideIcon
}

export const InspectionView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('strategies')
  const [mountedTabs, setMountedTabs] = useState<Record<TabType, boolean>>({
    strategies: true,
    templates: false,
    executions: false,
    analytics: false,
  })
  
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useInspectionStats()

  // 顶层订阅巡检任务事件：InspectionView 采用 tab 懒挂载，"执行历史"(InspectionExecutions)
  // 仅在用户点开后才挂载；把完成提示放在始终在线的 View 顶层，保证触发巡检后即便停留在
  // 任意子 tab 也能收到"完成/失败"提示。订阅方法自带幂等保护，与 Executions 内订阅可共存。
  useEffect(() => {
    wsManager.subscribeToInspectionTasks()
    return () => {
      wsManager.unsubscribeFromInspectionTasks()
    }
  }, [])

  // 连接建立/重连时重新订阅，避免订阅丢失
  useWebSocketEvent(WebSocketEvents.CONNECT, () => {
    wsManager.subscribeToInspectionTasks()
  })

  // 巡检任务完成/失败时弹出提示（后端在 scan_progress 房间广播终态）
  useWebSocketEvent(WebSocketEvents.INSPECTION_COMPLETE, (payload) => {
    if (!payload || typeof payload !== 'object') return
    const data = payload as Record<string, unknown>
    const status = typeof data.status === 'string' ? data.status.toLowerCase() : ''
    if (status === 'completed' || status === 'success') {
      toast.success('巡检任务已完成')
    } else if (status === 'failed' || status === 'error') {
      toast.error('巡检任务执行失败')
    }
  })

  useEffect(() => {
    setMountedTabs((current) => (
      current[activeTab]
        ? current
        : { ...current, [activeTab]: true }
    ))
  }, [activeTab])

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

  const renderTabContent = (tab: TabType) => {
    switch (tab) {
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
        {!statsLoading && statsError && (
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3 text-red-600">
                  <AlertCircle className="w-5 h-5" />
                  <span>{statsError instanceof Error ? statsError.message : '统计加载失败'}</span>
                </div>
                <Button type="button" variant="outline" onClick={() => { void refetchStats() }}>
                  重试统计
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!statsLoading && !statsError && stats && (
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
              title="执行次数"
              value={stats.executionCount}
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

        <CardContent className="flex-1 min-h-0 flex flex-col overflow-hidden pt-4">
          {/* 标签内容区域：flex-1 min-h-0 确保高度由父容器约束，overflow-y-auto 在界内滚动 */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {(Object.keys(mountedTabs) as TabType[]).map((tab) => {
              if (!mountedTabs[tab]) {
                return null
              }

              const isActive = activeTab === tab

              return (
                <motion.div
                  key={tab}
                  hidden={!isActive}
                  aria-hidden={!isActive}
                  initial={isActive ? { opacity: 0, y: 20 } : undefined}
                  animate={isActive ? { opacity: 1, y: 0 } : undefined}
                  exit={isActive ? { opacity: 0, y: -20 } : undefined}
                  transition={isActive ? { duration: 0.2 } : undefined}
                >
                  {renderTabContent(tab)}
                </motion.div>
              )
            })}
          </div>
        </CardContent>
      </Card>
      </div>
    </AppLayout>
  )
}
