import React, { useState, useCallback, useMemo } from 'react'
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination'
import { formatDateYMD, formatTimeHM } from '@/utils/formatters'
import { getDeviceTypeLabel } from '@/utils/deviceTypes'
import { cn } from '@/utils/cn'
import {
  Plus,
  Play,
  Edit,
  Server,
  FileText,
  CalendarClock,
  Hand,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import {
  Card,
  CardContent,
  Button,
  Badge,
  Table,
  Column,
  ConfirmModal,
} from '@/components/atoms'
import { Switch } from '@/components/atoms/switch'
import { CompactPageToolbar } from '@/components/shared'
import { DeleteIconButton } from '@/components/shared/DeleteIconButton'
import { FloatingBatchActionBar } from '@/components/shared/FloatingBatchActionBar'
import { BatchDeleteConfirmModal } from '@/components/shared/BatchDeleteConfirmModal'
import { useBatchSelection } from '@/hooks'
import {
  useInspectionStrategies,
  useInspectionTemplates,
  useToggleStrategy,
  useDeleteStrategy,
  useBatchDeleteStrategies,
  useTriggerExecution,
} from '../hooks/useInspection'
import { InspectionStrategy, InspectionTemplate } from '../types'
import {
  describeCronExpression,
  formatRelativeFutureTime,
} from '../utils/strategySchedule'
import {
  StrategyFilterSegments,
  StrategyTypeFilter,
  StrategyEnabledFilter,
} from './StrategyFilterSegments'
import { StrategyModal } from './StrategyModal'

const useSafeInspectionTemplates =
  typeof useInspectionTemplates === 'function'
    ? useInspectionTemplates
    : () => undefined

const useSafeBatchDeleteStrategies =
  typeof useBatchDeleteStrategies === 'function'
    ? useBatchDeleteStrategies
    : () => undefined

export const InspectionStrategies: React.FC = () => {
  const [selectedStrategy, setSelectedStrategy] = useState<InspectionStrategy | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [strategyToDelete, setStrategyToDelete] = useState<InspectionStrategy | null>(null)
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [typeFilter, setTypeFilter] = useState<StrategyTypeFilter>('all')
  const [enabledFilter, setEnabledFilter] = useState<StrategyEnabledFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const { data: strategiesData, isLoading, error, refetch } = useInspectionStrategies({
    page,
    pageSize,
    type: typeFilter === 'all' ? undefined : typeFilter,
    enabled:
      enabledFilter === 'all'
        ? undefined
        : enabledFilter === 'enabled',
  })

  const templatesQuery = useSafeInspectionTemplates({ pageSize: 200 })

  const templateMap = useMemo(() => {
    const map = new Map<number, InspectionTemplate>()
    const list = templatesQuery?.data?.templates ?? []
    for (const template of list) {
      const numericId = Number(template.id)
      if (Number.isFinite(numericId) && numericId > 0) {
        map.set(numericId, template)
      }
    }
    return map
  }, [templatesQuery?.data?.templates])

  const toggleStrategy = useToggleStrategy()
  const deleteStrategy = useDeleteStrategy()
  const batchDeleteStrategies = useSafeBatchDeleteStrategies()
  const triggerExecution = useTriggerExecution()
  const isBatchDeleting = Boolean(batchDeleteStrategies?.isPending)

  const strategies: InspectionStrategy[] = useMemo(
    () => strategiesData?.items || [],
    [strategiesData?.items]
  )
  const totalItems = strategiesData?.total || 0

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const filteredStrategies = useMemo(() => {
    if (!normalizedSearch) return strategies
    return strategies.filter((strategy) => {
      const templateIds = Array.isArray(strategy.templates) ? strategy.templates : []
      const templateNames = templateIds
        .map((id) => templateMap.get(id)?.name ?? '')
        .join(' ')
        .toLowerCase()
      return (
        strategy.name.toLowerCase().includes(normalizedSearch) ||
        (strategy.description ?? '').toLowerCase().includes(normalizedSearch) ||
        templateNames.includes(normalizedSearch)
      )
    })
  }, [strategies, normalizedSearch, templateMap])

  const isSearching = normalizedSearch.length > 0
  const hasActiveFilter =
    typeFilter !== 'all' || enabledFilter !== 'all' || isSearching

  const batchSelection = useBatchSelection<InspectionStrategy>({
    items: filteredStrategies,
    totalCount: isSearching ? filteredStrategies.length : totalItems,
    getId: (s) => s.id,
    filterDeps: [typeFilter, enabledFilter, normalizedSearch],
    pageDeps: [page, pageSize],
  })

  const handleCreateStrategy = () => {
    setSelectedStrategy(null)
    setIsModalOpen(true)
  }

  const handleTypeFilterChange = (nextFilter: StrategyTypeFilter) => {
    setPage(1)
    setTypeFilter(nextFilter)
  }

  const handleEnabledFilterChange = (nextFilter: StrategyEnabledFilter) => {
    setPage(1)
    setEnabledFilter(nextFilter)
  }

  const handleResetFilters = () => {
    setPage(1)
    setTypeFilter('all')
    setEnabledFilter('all')
    setSearchQuery('')
  }

  const handleEditStrategy = (strategy: InspectionStrategy) => {
    setSelectedStrategy(strategy)
    setIsModalOpen(true)
  }

  const handleToggleStrategy = async (strategy: InspectionStrategy) => {
    try {
      await toggleStrategy.mutateAsync({
        id: strategy.id,
        enabled: !strategy.enabled,
      })
    } catch (toggleError) {
      console.error('Toggle strategy failed:', toggleError)
    }
  }

  const handleDeleteStrategy = (strategy: InspectionStrategy) => {
    setStrategyToDelete(strategy)
  }

  const handleConfirmDeleteStrategy = async () => {
    if (!strategyToDelete) return
    await deleteStrategy.mutateAsync(strategyToDelete.id)
  }

  const handleConfirmBatchDelete = useCallback(async () => {
    try {
      if (batchSelection.selectionMode === 'all_filtered') {
        await batchDeleteStrategies?.mutateAsync({
          selectAllFiltered: true,
          excludeIds: batchSelection.excludedIds,
          type: typeFilter === 'all' ? undefined : typeFilter,
          enabled: enabledFilter === 'all' ? undefined : enabledFilter === 'enabled',
        })
      } else {
        await batchDeleteStrategies?.mutateAsync({
          selectAllFiltered: false,
          ids: batchSelection.selectedIds,
        })
      }
      setShowBatchDeleteConfirm(false)
      batchSelection.clearSelection()

      if (
        page > 1 &&
        (batchSelection.selectionMode === 'all_filtered' ||
          batchSelection.selectedIds.length >= filteredStrategies.length)
      ) {
        setPage(page - 1)
      }
      refetch()
    } catch (batchError) {
      console.error('Batch delete strategies failed:', batchError)
    }
  }, [
    batchSelection,
    batchDeleteStrategies,
    typeFilter,
    enabledFilter,
    page,
    filteredStrategies.length,
    refetch,
  ])

  const handleTriggerExecution = async (strategyId: string) => {
    try {
      await triggerExecution.mutateAsync(strategyId)
    } catch (triggerError) {
      console.error('Trigger execution failed:', triggerError)
    }
  }

  const columns: Column<InspectionStrategy>[] = [
    {
      key: 'name',
      title: '策略名称',
      width: '26%',
      render: (_, strategy) => {
        const deviceCount = Array.isArray(strategy.devices) ? strategy.devices.length : 0
        const templateCount = Array.isArray(strategy.templates) ? strategy.templates.length : 0
        const missingParts: string[] = []
        if (templateCount === 0) missingParts.push('巡检模板')
        if (deviceCount === 0) missingParts.push('目标设备')
        const isIncomplete = missingParts.length > 0

        return (
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium text-foreground truncate">{strategy.name}</span>
              {isIncomplete && (
                <Badge
                  variant="warning"
                  size="sm"
                  className="gap-1 shrink-0"
                  title={`缺少${missingParts.join('和')}，无法执行`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  待完善
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground line-clamp-1">
              {strategy.description?.trim() ? strategy.description : '暂无描述'}
            </span>
          </div>
        )
      },
    },
    {
      key: 'templates',
      title: '巡检模板',
      width: '19%',
      render: (_, strategy) => {
        const templateIds = Array.isArray(strategy.templates) ? strategy.templates : []
        const primaryTemplateId = templateIds[0]
        if (!primaryTemplateId) {
          return <span className="text-xs font-medium text-warning">未配置模板</span>
        }
        const template = templateMap.get(primaryTemplateId)
        if (!template) {
          return (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span className="tabular-nums">模板 #{primaryTemplateId}</span>
            </div>
          )
        }
        const typeSummary =
          template.deviceTypes.length > 0
            ? template.deviceTypes.map(getDeviceTypeLabel).join('、')
            : '通用设备'
        return (
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-foreground truncate" title={template.name}>
                {template.name}
              </span>
            </div>
            <span className="text-xs text-muted-foreground truncate">{typeSummary}</span>
          </div>
        )
      },
    },
    {
      key: 'devices',
      title: '目标设备',
      width: '11%',
      render: (_, strategy) => {
        const count = Array.isArray(strategy.devices) ? strategy.devices.length : 0
        if (count === 0) {
          return (
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-warning whitespace-nowrap">
              <Server className="w-3.5 h-3.5 shrink-0" />
              <span className="tabular-nums">0 台 · 未配置</span>
            </div>
          )
        }
        return (
          <div className="inline-flex items-center gap-1.5 text-sm text-foreground whitespace-nowrap">
            <Server className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="font-medium tabular-nums">{count} 台</span>
          </div>
        )
      },
    },
    {
      key: 'type',
      title: '触发与计划',
      width: '17%',
      render: (_, strategy) => {
        if (strategy.type === 'scheduled') {
          const scheduleText = describeCronExpression(strategy.cron)
          return (
            <div className="flex flex-col items-start gap-1">
              <Badge variant="info" size="sm" className="gap-1">
                <CalendarClock className="w-3 h-3" />
                定时巡检
              </Badge>
              <span
                className="text-xs text-muted-foreground"
                title={strategy.cron ? `调度表达式: ${strategy.cron}` : undefined}
              >
                {scheduleText}
              </span>
            </div>
          )
        }

        return (
          <div className="flex flex-col items-start gap-1">
            <Badge variant="neutral" size="sm" className="gap-1">
              <Hand className="w-3 h-3" />
              手动巡检
            </Badge>
            <span className="text-xs text-muted-foreground">按需手动触发</span>
          </div>
        )
      },
    },
    {
      key: 'nextRunTime',
      title: '下次执行',
      width: '13%',
      render: (_, strategy) => {
        if (strategy.type === 'scheduled' && !strategy.enabled) {
          return <span className="text-xs text-muted-foreground">已暂停调度</span>
        }
        if (!strategy.nextRunTime) {
          return <span className="text-sm text-muted-foreground">-</span>
        }
        const relative = formatRelativeFutureTime(strategy.nextRunTime)
        return (
          <div className="flex flex-col gap-0.5 text-sm">
            <span className="font-medium tabular-nums text-foreground whitespace-nowrap">
              {formatDateYMD(strategy.nextRunTime)} {formatTimeHM(strategy.nextRunTime)}
            </span>
            {relative && (
              <span className="text-xs text-muted-foreground">{relative}</span>
            )}
          </div>
        )
      },
    },
    {
      key: 'status',
      title: '状态',
      width: '9%',
      render: (_, strategy) => (
        <div className="inline-flex items-center gap-2 whitespace-nowrap">
          <Switch
            checked={strategy.enabled}
            onCheckedChange={() => {
              void handleToggleStrategy(strategy)
            }}
            disabled={toggleStrategy.isPending}
            aria-label={strategy.enabled ? `禁用策略 ${strategy.name}` : `启用策略 ${strategy.name}`}
            className="h-5 w-9 [&>span]:h-4 [&>span]:w-4 [&>span]:data-[state=checked]:translate-x-4"
          />
          <span
            className={cn(
              'text-xs font-medium',
              strategy.enabled ? 'text-success' : 'text-muted-foreground'
            )}
          >
            {strategy.enabled ? '启用' : '禁用'}
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      align: 'right',
      width: '15%',
      render: (_, strategy) => {
        const deviceCount = Array.isArray(strategy.devices) ? strategy.devices.length : 0
        const templateCount = Array.isArray(strategy.templates) ? strategy.templates.length : 0
        const disabledReasons: string[] = []
        if (!strategy.enabled) disabledReasons.push('策略已禁用')
        if (templateCount === 0) disabledReasons.push('未配置巡检模板')
        if (deviceCount === 0) disabledReasons.push('未配置目标设备')
        const runDisabled = disabledReasons.length > 0 || triggerExecution.isPending
        const runTitle =
          disabledReasons.length > 0 ? `不可执行：${disabledReasons.join('、')}` : '手动执行'

        return (
          <div className="inline-flex items-center justify-end gap-1 whitespace-nowrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleTriggerExecution(strategy.id)}
              disabled={runDisabled}
              title={runTitle}
              aria-label="手动执行"
              className="gap-1 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>执行</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleEditStrategy(strategy)}
              title="编辑"
              aria-label="编辑"
              className="cursor-pointer"
            >
              <Edit className="w-4 h-4" />
            </Button>
            <DeleteIconButton
              onClick={() => handleDeleteStrategy(strategy)}
              title="删除"
              className="cursor-pointer"
            />
          </div>
        )
      },
    },
  ]

  if (isLoading) {
    return (
      <div className="flex flex-1 min-h-0 flex-col gap-4">
        <div className="h-9 w-full rounded-lg bg-muted/60 animate-pulse" />
        <div className="flex-1 rounded-lg border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-muted/60 px-4 py-2.5 flex items-center gap-4">
            <div className="h-3.5 w-24 rounded bg-muted animate-pulse" />
            <div className="h-3.5 w-20 rounded bg-muted animate-pulse" />
            <div className="h-3.5 w-16 rounded bg-muted animate-pulse" />
            <div className="h-3.5 w-20 rounded bg-muted animate-pulse" />
          </div>
          <div className="divide-y divide-border">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="px-4 py-3.5 flex items-center gap-4 animate-pulse">
                <div className="h-4 bg-muted rounded w-1/4" />
                <div className="h-4 bg-muted rounded w-1/6" />
                <div className="h-4 bg-muted rounded w-1/12" />
                <div className="h-4 bg-muted rounded w-1/6" />
                <div className="h-4 bg-muted rounded w-1/6 ml-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger-soft-foreground">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground">加载失败</h3>
              <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
            </div>
            <Button onClick={() => refetch()} className="cursor-pointer">
              重试
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const isFilteredEmpty = filteredStrategies.length === 0 && hasActiveFilter

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3">
      <CompactPageToolbar
        layout="between"
        testIdPrefix="inspection-strategies-toolbar"
        search={{
          value: searchQuery,
          placeholder: '搜索当前页策略名称、描述或模板...',
          ariaLabel: '搜索巡检策略',
          onChange: setSearchQuery,
        }}
        filters={(
          <div className="flex flex-wrap items-center gap-2">
            <StrategyFilterSegments
              typeFilter={typeFilter}
              enabledFilter={enabledFilter}
              onTypeChange={handleTypeFilterChange}
              onEnabledChange={handleEnabledFilterChange}
            />
            {hasActiveFilter && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleResetFilters}
                className="gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                重置筛选
              </Button>
            )}
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

      {/* 策略列表容器：弹性撑满可视高度，使分页栏稳固收底 */}
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
        <Table
          data={filteredStrategies}
          columns={columns}
          rowKey="id"
          rowSelection={batchSelection.rowSelection}
          onRow={(strategy) => ({
            className: strategy.enabled ? undefined : 'opacity-75',
          })}
          className="flex flex-1 min-h-0 flex-col border-0"
          emptyContent={(
            <div className="px-6 py-12 text-center">
              <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    {isFilteredEmpty ? '未找到匹配的巡检策略' : '暂无巡检策略'}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isFilteredEmpty
                      ? '请调整筛选条件或清空关键词后重试'
                      : '将巡检模板、目标设备与执行周期组合为策略，即可自动化巡检'}
                  </p>
                </div>
                {isFilteredEmpty ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleResetFilters}
                    className="mt-1 gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    清空筛选
                  </Button>
                ) : (
                  <Button onClick={handleCreateStrategy} className="mt-1 gap-1.5 cursor-pointer">
                    <Plus className="w-4 h-4" />
                    创建策略
                  </Button>
                )}
              </div>
            </div>
          )}
          pagination={
            isSearching
              ? {
                  current: 1,
                  pageSize: Math.max(filteredStrategies.length, pageSize),
                  total: filteredStrategies.length,
                  onChange: () => {},
                }
              : {
                  current: page,
                  pageSize,
                  total: totalItems,
                  onChange: (nextPage) => setPage(nextPage),
                  onPageSizeChange: (nextPageSize) => {
                    setPage(1)
                    setPageSize(nextPageSize)
                  },
                }
          }
        />
      </div>

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

      {/* 底部悬浮批量操作栏 */}
      <FloatingBatchActionBar
        selectedCount={batchSelection.selectedCount}
        selectionMode={batchSelection.selectionMode}
        totalCount={isSearching ? filteredStrategies.length : totalItems}
        isAllCurrentPageSelected={batchSelection.isAllCurrentPageSelected}
        onSelectCurrentPage={batchSelection.selectCurrentPage}
        onSelectAllFiltered={isSearching ? undefined : batchSelection.selectAllFiltered}
        onInvertCurrentPage={batchSelection.invertCurrentPage}
        onClearSelection={batchSelection.clearSelection}
        onDelete={() => setShowBatchDeleteConfirm(true)}
        isDeleting={isBatchDeleting}
      />

      {/* 批量删除确认弹窗 */}
      <BatchDeleteConfirmModal
        isOpen={showBatchDeleteConfirm}
        onClose={() => setShowBatchDeleteConfirm(false)}
        onConfirm={handleConfirmBatchDelete}
        isDeleting={isBatchDeleting}
        count={batchSelection.selectedCount}
        isAllFiltered={batchSelection.selectionMode === 'all_filtered'}
        entityLabel="条巡检策略"
      />
    </div>
  )
}
