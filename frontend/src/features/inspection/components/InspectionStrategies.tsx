import React, { useState } from 'react'
import { formatDateYMD, formatTimeHM } from '@/utils/formatters'
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
  Column,
  Pagination,
  ConfirmModal
} from '@/components/atoms'
import { CompactPageToolbar } from '@/components/shared'
import { 
  useInspectionStrategies, 
  useToggleStrategy, 
  useDeleteStrategy,
  useTriggerExecution 
} from '../hooks/useInspection'
import { InspectionStrategy } from '../types'
import { StrategyModal } from './StrategyModal'

export const InspectionStrategies: React.FC = () => {
  const [selectedStrategy, setSelectedStrategy] = useState<InspectionStrategy | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [strategyToDelete, setStrategyToDelete] = useState<InspectionStrategy | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [typeFilter, setTypeFilter] = useState<'all' | 'manual' | 'scheduled'>('all')
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  
  const { data: strategiesData, isLoading, error, refetch } = useInspectionStrategies({
    page,
    pageSize,
    type: typeFilter === 'all' ? undefined : typeFilter,
    enabled:
      enabledFilter === 'all'
        ? undefined
        : enabledFilter === 'enabled',
  })
  const toggleStrategy = useToggleStrategy()
  const deleteStrategy = useDeleteStrategy()
  const triggerExecution = useTriggerExecution()

  const strategies: InspectionStrategy[] = strategiesData?.items || []
  const totalPages = strategiesData?.pages || 1
  const totalItems = strategiesData?.total || 0

  // 显示所有策略列表
  const filteredStrategies = strategies

  const handleCreateStrategy = () => {
    setSelectedStrategy(null)
    setIsModalOpen(true)
  }

  const handleTypeFilterChange = (nextFilter: 'all' | 'manual' | 'scheduled') => {
    setPage(1)
    setTypeFilter(nextFilter)
  }

  const handleEnabledFilterChange = (nextFilter: 'all' | 'enabled' | 'disabled') => {
    setPage(1)
    setEnabledFilter(nextFilter)
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

  const handleDeleteStrategy = (strategy: InspectionStrategy) => {
    setStrategyToDelete(strategy)
  }

  const handleConfirmDeleteStrategy = async () => {
    if (!strategyToDelete) return

    try {
      await deleteStrategy.mutateAsync(strategyToDelete.id)
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
          <span className="font-medium text-foreground">{strategy.name}</span>
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
              <span>{formatDateYMD(strategy.nextRunTime)}</span>
              <span className="text-gray-500 dark:text-gray-400">
                {formatTimeHM(strategy.nextRunTime)}
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
            onClick={() => handleDeleteStrategy(strategy)}
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

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <AlertCircle className="w-12 h-12 text-red-500" />
            <div>
              <h3 className="text-lg font-medium text-foreground">加载失败</h3>
              <p className="text-gray-500 dark:text-gray-400 mt-1">{error.message}</p>
            </div>
            <Button onClick={() => refetch()}>
              重试
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <CompactPageToolbar
        testIdPrefix="inspection-strategies-toolbar"
        filters={(
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={typeFilter === 'all' ? 'default' : 'outline'}
                onClick={() => handleTypeFilterChange('all')}
              >
                全部类型
              </Button>
              <Button
                type="button"
                variant={typeFilter === 'manual' ? 'default' : 'outline'}
                onClick={() => handleTypeFilterChange('manual')}
              >
                仅手动
              </Button>
              <Button
                type="button"
                variant={typeFilter === 'scheduled' ? 'default' : 'outline'}
                onClick={() => handleTypeFilterChange('scheduled')}
              >
                仅定时
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={enabledFilter === 'all' ? 'default' : 'outline'}
                onClick={() => handleEnabledFilterChange('all')}
              >
                全部状态
              </Button>
              <Button
                type="button"
                variant={enabledFilter === 'enabled' ? 'default' : 'outline'}
                onClick={() => handleEnabledFilterChange('enabled')}
              >
                仅启用
              </Button>
              <Button
                type="button"
                variant={enabledFilter === 'disabled' ? 'default' : 'outline'}
                onClick={() => handleEnabledFilterChange('disabled')}
              >
                仅禁用
              </Button>
            </div>
          </div>
        )}
        primaryActions={[
          {
            key: 'create-strategy',
            label: '创建策略',
            icon: <Plus className="w-4 h-4" />,
            onClick: handleCreateStrategy,
          },
        ]}
      />

      {/* 策略列表 */}
      {filteredStrategies.length > 0 ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <Table
              data={filteredStrategies}
              columns={columns}
              className="bg-card rounded-lg shadow-sm"
            />
          </motion.div>

          {totalPages > 1 && (
            <Card>
              <CardContent className="p-4">
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  pageSize={pageSize}
                  pageSizeOptions={[10, 20, 50, 100]}
                  onPageChange={setPage}
                  onPageSizeChange={(nextPageSize) => {
                    setPage(1)
                    setPageSize(nextPageSize)
                  }}
                  showPageSizeSelector={true}
                />
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <AlertCircle className="w-12 h-12 text-gray-400 dark:text-gray-500" />
              <div>
                <h3 className="text-lg font-medium text-foreground">暂无巡检策略</h3>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                  开始创建您的第一个巡检策略
                </p>
              </div>
              <Button onClick={handleCreateStrategy} className="mt-2">
                  <Plus className="w-4 h-4 mr-2" />
                  创建策略
                </Button>
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

      <ConfirmModal
        isOpen={!!strategyToDelete}
        onClose={() => {
          if (!deleteStrategy.isPending) {
            setStrategyToDelete(null)
          }
        }}
        onConfirm={handleConfirmDeleteStrategy}
        title="确认删除策略"
        description={
          strategyToDelete
            ? `确定要删除巡检策略“${strategyToDelete.name}”吗？删除后将无法恢复。`
            : undefined
        }
        confirmText={deleteStrategy.isPending ? '删除中...' : '确认删除'}
        cancelText="取消"
        variant="destructive"
        confirmDisabled={deleteStrategy.isPending}
        cancelDisabled={deleteStrategy.isPending}
      />

    </div>
  )
}
