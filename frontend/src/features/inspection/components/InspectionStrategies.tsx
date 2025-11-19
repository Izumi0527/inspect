import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Plus,
  Play,
  Pause,
  Edit,
  Trash2,
  Clock,
  Users,
  CheckCircle,
  AlertCircle
} from 'lucide-react'
import {
  Card,
  CardContent,
  Button,
  Badge,
  Table,
  Column
} from '@/components/atoms'
import { 
  useInspectionStrategies, 
  useToggleStrategy, 
  useDeleteStrategy,
  useTriggerExecution 
} from '../hooks/useInspection'
import { InspectionStrategy } from '../types'
import { StrategyModal } from './StrategyModal'

interface Props {
  searchText: string
}

export const InspectionStrategies: React.FC<Props> = ({ searchText }) => {
  const [selectedStrategy, setSelectedStrategy] = useState<InspectionStrategy | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  
  const { data: strategiesData, isLoading } = useInspectionStrategies()
  const toggleStrategy = useToggleStrategy()
  const deleteStrategy = useDeleteStrategy()
  const triggerExecution = useTriggerExecution()

  const strategies: InspectionStrategy[] = strategiesData?.items || []

  // 过滤策略列表
  const filteredStrategies = strategies.filter(strategy => 
    strategy.name.toLowerCase().includes(searchText.toLowerCase()) ||
    strategy.description.toLowerCase().includes(searchText.toLowerCase())
  )

  const handleCreateStrategy = () => {
    setSelectedStrategy(null)
    setIsModalOpen(true)
  }

  const handleEditStrategy = (strategy: InspectionStrategy) => {
    setSelectedStrategy(strategy)
    setIsModalOpen(true)
  }

  const handleToggleStrategy = async (strategy: InspectionStrategy) => {
    try {
      await toggleStrategy.mutateAsync({
        id: strategy.id,
        enabled: !strategy.enabled
      })
    } catch (error) {
      console.error('Toggle strategy failed:', error)
    }
  }

  const handleDeleteStrategy = async (id: string) => {
    try {
      await deleteStrategy.mutateAsync(id)
    } catch (error) {
      console.error('Delete strategy failed:', error)
    }
  }

  const handleTriggerExecution = async (strategyId: string) => {
    try {
      await triggerExecution.mutateAsync(strategyId)
    } catch (error) {
      console.error('Trigger execution failed:', error)
    }
  }

  const getStrategyStatusBadge = (strategy: InspectionStrategy) => {
    if (strategy.enabled) {
      return <Badge variant="success">启用</Badge>
    }
    return <Badge variant="secondary">禁用</Badge>
  }

  const getStrategyTypeBadge = (type: string) => {
    if (type === 'scheduled') {
      return <Badge variant="info">定时巡检</Badge>
    }
    return <Badge variant="outline">手动巡检</Badge>
  }

  const columns: Column<InspectionStrategy>[] = [
    {
      key: 'name',
      title: '策略名称',
      render: (_, strategy) => (
        <div className="flex flex-col">
          <span className="font-medium text-gray-900 dark:text-gray-100">{strategy.name}</span>
          <span className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{strategy.description}</span>
        </div>
      )
    },
    {
      key: 'type',
      title: '类型',
      render: (_, strategy) => (
        <div className="flex flex-col gap-1">
          {getStrategyTypeBadge(strategy.type)}
          {strategy.type === 'scheduled' && strategy.cron && (
            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <Clock className="w-3 h-3" />
              {strategy.cron}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'devices',
      title: '设备数量',
      render: (_, strategy) => (
        <div className="flex items-center gap-1">
          <Users className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          <span className="font-medium">{strategy.devices.length}</span>
        </div>
      )
    },
    {
      key: 'status',
      title: '状态',
      render: (_, strategy) => getStrategyStatusBadge(strategy)
    },
    {
      key: 'nextRunTime',
      title: '下次执行',
      render: (_, strategy) => (
        <div className="text-sm">
          {strategy.nextRunTime ? (
            <div className="flex flex-col">
              <span>{new Date(strategy.nextRunTime).toLocaleDateString()}</span>
              <span className="text-gray-500 dark:text-gray-400">
                {new Date(strategy.nextRunTime).toLocaleTimeString()}
              </span>
            </div>
          ) : (
            <span className="text-gray-400 dark:text-gray-500">-</span>
          )}
        </div>
      )
    },
    {
      key: 'actions',
      title: '操作',
      render: (_, strategy) => (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleTriggerExecution(strategy.id)}
            disabled={!strategy.enabled || triggerExecution.isPending}
            title="手动执行"
          >
            <Play className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleToggleStrategy(strategy)}
            disabled={toggleStrategy.isPending}
            title={strategy.enabled ? '禁用' : '启用'}
          >
            {strategy.enabled ? (
              <Pause className="w-4 h-4" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleEditStrategy(strategy)}
            title="编辑"
          >
            <Edit className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleDeleteStrategy(strategy.id)}
            title="删除"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      )
    }
  ]

  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* 加载骨架屏 */}
        {[...Array(5)].map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/6"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/6"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold dark:text-gray-100">巡检策略管理</h3>
          <Badge variant="secondary">{filteredStrategies.length} 项</Badge>
        </div>
        <Button onClick={handleCreateStrategy} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          创建策略
        </Button>
      </div>

      {/* 策略列表 */}
      {filteredStrategies.length > 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Table
            data={filteredStrategies}
            columns={columns}
            className="bg-white dark:bg-gray-900 rounded-lg shadow-sm"
          />
        </motion.div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <AlertCircle className="w-12 h-12 text-gray-400 dark:text-gray-500" />
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">暂无巡检策略</h3>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                  {searchText ? '没有找到匹配的策略' : '开始创建您的第一个巡检策略'}
                </p>
              </div>
              {!searchText && (
                <Button onClick={handleCreateStrategy} className="mt-2">
                  <Plus className="w-4 h-4 mr-2" />
                  创建策略
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 策略编辑/创建弹窗 */}
      {isModalOpen && (
        <StrategyModal
          strategy={selectedStrategy}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false)
            setSelectedStrategy(null)
          }}
        />
      )}

    </div>
  )
}