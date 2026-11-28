/**
 * 巡检模板管理组件 - 标准化巡检资产库视图
 * 整合左右均衡工具栏、来源与排序内嵌分段器、协议构成摘要与吸底分页
 */

import { DEFAULT_PAGE_SIZE } from '@/constants/pagination'
import React, { useState, useCallback, useEffect, useRef } from 'react'
import { formatDateYMD } from '@/utils/formatters'
import { cn } from '@/utils/cn'
import toast from 'react-hot-toast'
import {
  Plus,
  Edit,
  Copy,
  Eye,
  FileText,
  Shield,
  Monitor,
  Settings,
  AlertCircle,
  Download,
  Upload,
  RefreshCw,
  Zap,
  Network,
  Router,
  Server,
  X,
} from 'lucide-react'
import {
  Card,
  CardContent,
  Button,
  Badge,
  Table,
  Column,
  Pagination,
} from '@/components/atoms'
import { ConfirmModal } from '@/components/atoms/modal'
import { CompactPageToolbar } from '@/components/shared'
import { DeleteIconButton } from '@/components/shared/DeleteIconButton'
import { FloatingBatchActionBar } from '@/components/shared/FloatingBatchActionBar'
import { BatchDeleteConfirmModal } from '@/components/shared/BatchDeleteConfirmModal'
import { useBatchSelection } from '@/hooks'

import {
  useInspectionTemplates,
  useInspectionTemplateStats,
  useCloneTemplate,
  useDeleteTemplate,
  useBatchDeleteTemplates,
} from '../hooks/useInspection'
import { fetchInspectionTemplate } from '../api/inspection.api'
import { buildTemplateXlsx } from '../utils/templateExcel'
import {
  getCategoryMeta,
  summarizeCheckItems,
} from '../utils/templatePresentation'
import { getDeviceTypeLabel } from '@/utils/deviceTypes'
import type { InspectionTemplate } from '../types'

import { VendorFilter } from './VendorFilter'
import { DeviceTypeFilter } from './DeviceTypeFilter'
import { CategoryFilter } from './CategoryFilter'
import {
  TemplateSortSegments,
  TemplateSortField,
  TemplateSortOrder,
} from './TemplateSortSegments'
import { TemplateDetailModal } from './TemplateDetailModal'
import { TemplateImportModal } from './TemplateImportModal'
import { CreateTemplateWizard } from './CreateTemplateWizard'
import { QuickTemplateCreate } from './QuickTemplateCreate'

interface TemplateFilters {
  vendor?: string
  deviceType?: string
  category?: string
  search?: string
}

interface PaginationState {
  page: number
  page_size: number
  sort?: string
  order?: 'asc' | 'desc'
}

type SourceFacet = 'all' | 'builtin' | 'custom'

const useSafeBatchDeleteTemplates =
  typeof useBatchDeleteTemplates === 'function'
    ? useBatchDeleteTemplates
    : () => undefined

const getDeviceTypeIcon = (deviceType?: string) => {
  switch (deviceType) {
    case 'switch':
      return <Network className="w-3.5 h-3.5 shrink-0" />
    case 'router':
      return <Router className="w-3.5 h-3.5 shrink-0" />
    case 'firewall':
      return <Shield className="w-3.5 h-3.5 shrink-0" />
    case 'server':
      return <Server className="w-3.5 h-3.5 shrink-0" />
    default:
      return <Monitor className="w-3.5 h-3.5 shrink-0" />
  }
}

const getTemplateLeadingIcon = (template: InspectionTemplate) => {
  const primaryDeviceType = template.deviceTypes?.[0]
  if (primaryDeviceType) {
    return getDeviceTypeIcon(primaryDeviceType)
  }
  switch (template.category) {
    case 'network':
      return <Monitor className="w-3.5 h-3.5 shrink-0" />
    case 'system':
      return <Settings className="w-3.5 h-3.5 shrink-0" />
    case 'security':
      return <Shield className="w-3.5 h-3.5 shrink-0" />
    default:
      return <FileText className="w-3.5 h-3.5 shrink-0" />
  }
}

export const InspectionTemplates: React.FC = () => {
  const [filters, setFilters] = useState<TemplateFilters>({})
  const [sourceFacet, setSourceFacet] = useState<SourceFacet>('all')
  const [searchText, setSearchText] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // 搜索防抖（350ms）
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (searchText === debouncedSearch) return
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
    }
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchText)
      setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }))
    }, 350)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchText, debouncedSearch])

  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    page_size: DEFAULT_PAGE_SIZE,
    sort: 'updatedAt',
    order: 'desc',
  })
  const [sortField, setSortField] = useState<TemplateSortField>('updatedAt')
  const [sortOrder, setSortOrder] = useState<TemplateSortOrder>('desc')

  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<InspectionTemplate | null>(null)
  const [viewingTemplate, setViewingTemplate] = useState<InspectionTemplate | null>(null)
  const [deleteConfirmTemplate, setDeleteConfirmTemplate] = useState<InspectionTemplate | null>(null)
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)

  const sortFieldMap: Record<TemplateSortField, string> = {
    name: 'name',
    category: 'category',
    updatedAt: 'updated_at',
  }

  const { data: templatesData, isLoading, refetch, error } = useInspectionTemplates({
    page: pagination.page,
    pageSize: pagination.page_size,
    category: filters.category || undefined,
    deviceTypes: filters.deviceType ? [filters.deviceType] : undefined,
    search: debouncedSearch || undefined,
    vendor: filters.vendor || undefined,
    sort: sortFieldMap[sortField] || undefined,
    order: pagination.order || undefined,
    isBuiltIn: sourceFacet === 'all' ? undefined : sourceFacet === 'builtin',
  })

  const cloneTemplate = useCloneTemplate()
  const deleteTemplateMutation = useDeleteTemplate()
  const batchDeleteTemplates = useSafeBatchDeleteTemplates()
  const isBatchDeleting = Boolean(batchDeleteTemplates?.isPending)

  const handleExportTemplate = async (template: InspectionTemplate) => {
    let url: string | null = null
    try {
      const fullTemplate = await fetchInspectionTemplate(Number(template.id))
      if (!fullTemplate) return
      const blob = await buildTemplateXlsx(fullTemplate)
      url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${fullTemplate.name}-${Date.now()}.xlsx`
      a.click()
    } catch (exportError) {
      console.error('Export template failed:', exportError)
      toast.error('导出失败：' + (exportError instanceof Error ? exportError.message : '未知错误'))
    } finally {
      if (url) window.URL.revokeObjectURL(url)
    }
  }

  const templates: InspectionTemplate[] = templatesData?.templates || []
  const totalTemplates = templatesData?.total || 0
  const needsFullTemplateStats = totalTemplates > templates.length || sourceFacet !== 'all'

  const { data: templateStatsData } = useInspectionTemplateStats({
    total: totalTemplates,
    enabled: needsFullTemplateStats,
    category: filters.category || undefined,
    deviceTypes: filters.deviceType ? [filters.deviceType] : undefined,
    search: debouncedSearch || undefined,
    vendor: filters.vendor || undefined,
  })

  const builtInTemplatesCount = needsFullTemplateStats
    ? templateStatsData?.builtInTotal ?? templates.filter((t) => t.isBuiltIn).length
    : templates.filter((template) => template.isBuiltIn).length
  const customTemplatesCount = needsFullTemplateStats
    ? templateStatsData?.customTotal ?? templates.filter((t) => !t.isBuiltIn).length
    : templates.filter((template) => !template.isBuiltIn).length
  const allTemplatesCount =
    sourceFacet === 'all'
      ? totalTemplates
      : templateStatsData
        ? templateStatsData.builtInTotal + templateStatsData.customTotal
        : totalTemplates

  const totalPages = Math.ceil(totalTemplates / pagination.page_size)

  // 删除末页最后一条记录或筛选总数缩减后，夹紧越界页码
  useEffect(() => {
    if (!isLoading && totalPages > 0 && pagination.page > totalPages) {
      setPagination((prev) =>
        prev.page > totalPages ? { ...prev, page: totalPages } : prev
      )
    }
  }, [isLoading, totalPages, pagination.page])
  const batchSelection = useBatchSelection<InspectionTemplate>({
    items: templates,
    totalCount: customTemplatesCount + templates.filter((t) => t.isBuiltIn).length,
    getId: (t) => t.id,
    isSelectable: (t) => !t.isBuiltIn,
    getDisabledReason: (t) => (t.isBuiltIn ? '内置模板不可删除' : undefined),
    filterDeps: [
      filters.vendor,
      filters.deviceType,
      filters.category,
      debouncedSearch,
      sourceFacet,
    ],
    pageDeps: [pagination.page, pagination.page_size],
  })

  const handleConfirmBatchDelete = useCallback(async () => {
    try {
      if (batchSelection.selectionMode === 'all_filtered') {
        await batchDeleteTemplates?.mutateAsync({
          selectAllFiltered: true,
          excludeIds: batchSelection.excludedIds,
          vendor: filters.vendor || undefined,
          deviceType: filters.deviceType || undefined,
          category: filters.category || undefined,
          search: debouncedSearch || undefined,
        })
      } else {
        await batchDeleteTemplates?.mutateAsync({
          selectAllFiltered: false,
          ids: batchSelection.selectedIds,
        })
      }
      setShowBatchDeleteConfirm(false)
      batchSelection.clearSelection()

      if (
        pagination.page > 1 &&
        (batchSelection.selectionMode === 'all_filtered' ||
          batchSelection.selectedIds.length >= templates.length)
      ) {
        setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
      }
      refetch()
    } catch (batchError) {
      console.error('Batch delete templates failed:', batchError)
    }
  }, [
    batchSelection,
    batchDeleteTemplates,
    filters.vendor,
    filters.deviceType,
    filters.category,
    debouncedSearch,
    pagination.page,
    templates,
    refetch,
  ])

  const handleFilterChange = useCallback((key: keyof TemplateFilters, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
    }))
    setPagination((prev) => ({ ...prev, page: 1 }))
  }, [])

  const handleFacetChange = useCallback((nextFacet: SourceFacet) => {
    setSourceFacet((current) => {
      if (nextFacet === 'all') return 'all'
      return current === nextFacet ? 'all' : nextFacet
    })
    setPagination((prev) => ({ ...prev, page: 1 }))
  }, [])

  const handleSearch = useCallback((value: string) => {
    setSearchText(value)
  }, [])

  const handleSort = useCallback(
    (field: TemplateSortField) => {
      if (sortField === field) {
        const newOrder: TemplateSortOrder = sortOrder === 'asc' ? 'desc' : 'asc'
        setSortOrder(newOrder)
        setPagination((prev) => ({ ...prev, sort: field, order: newOrder }))
      } else {
        setSortField(field)
        setSortOrder('desc')
        setPagination((prev) => ({ ...prev, sort: field, order: 'desc' }))
      }
    },
    [sortField, sortOrder]
  )

  const handleCreateTemplate = () => {
    setEditingTemplate(null)
    setIsEditorOpen(true)
  }

  const handleEditTemplate = (template: InspectionTemplate) => {
    setEditingTemplate(template)
    setIsEditorOpen(true)
  }

  const handleViewTemplate = (template: InspectionTemplate) => {
    setViewingTemplate(template)
  }

  const handleCloneTemplate = async (template: InspectionTemplate) => {
    try {
      await cloneTemplate.mutateAsync({
        id: template.id,
        name: `${template.name} - 副本`,
      })
      refetch()
    } catch (cloneError) {
      console.error('Clone template failed:', cloneError)
    }
  }

  const handleDeleteTemplate = (template: InspectionTemplate) => {
    setDeleteConfirmTemplate(template)
  }

  const handleConfirmDelete = async () => {
    if (!deleteConfirmTemplate) return
    await deleteTemplateMutation.mutateAsync(String(deleteConfirmTemplate.id))
    setDeleteConfirmTemplate(null)
    refetch()
  }

  const handleExportTemplateClick = async (template: InspectionTemplate) => {
    await handleExportTemplate(template)
  }

  const handleEditorClose = () => {
    setIsEditorOpen(false)
    setEditingTemplate(null)
  }

  const handleEditorSuccess = () => {
    handleEditorClose()
    refetch()
  }

  const handleImportSuccess = () => {
    setIsImportModalOpen(false)
    refetch()
  }

  const handleClearFilters = () => {
    setFilters({})
    setSourceFacet('all')
    setSearchText('')
    setPagination((prev) => ({ ...prev, page: 1 }))
  }

  const hasActiveFilters = Boolean(
    filters.vendor ||
      filters.deviceType ||
      filters.category ||
      searchText ||
      sourceFacet !== 'all'
  )

  const activeFilters = [
    sourceFacet !== 'all'
      ? {
          id: 'sourceFacet',
          label: sourceFacet === 'builtin' ? '来源: 内置模板' : '来源: 自定义模板',
          onRemove: () => handleFacetChange('all'),
        }
      : null,
    searchText
      ? {
          id: 'search',
          label: `搜索: ${searchText}`,
          onRemove: () => setSearchText(''),
        }
      : null,
    filters.vendor
      ? {
          id: 'vendor',
          label: `厂商: ${filters.vendor}`,
          onRemove: () => handleFilterChange('vendor', ''),
        }
      : null,
    filters.deviceType
      ? {
          id: 'deviceType',
          label: `设备类型: ${getDeviceTypeLabel(filters.deviceType)}`,
          onRemove: () => handleFilterChange('deviceType', ''),
        }
      : null,
    filters.category
      ? {
          id: 'category',
          label: `分类: ${getCategoryMeta(filters.category).label}`,
          onRemove: () => handleFilterChange('category', ''),
        }
      : null,
  ].filter(Boolean) as Array<{
    id: string
    label: string
    onRemove: () => void
  }>

  const columns: Column<InspectionTemplate>[] = [
    {
      key: 'name',
      title: '模板名称',
      width: '34%',
      render: (_value, template) => (
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted-foreground">
            {getTemplateLeadingIcon(template)}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                type="button"
                onClick={() => handleViewTemplate(template)}
                className="truncate text-left font-medium text-foreground transition-colors hover:text-primary cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm"
                title={`查看「${template.name}」详情`}
              >
                {template.name}
              </button>
              {template.isBuiltIn ? (
                <Badge variant="success" size="sm" className="shrink-0">
                  内置
                </Badge>
              ) : (
                <Badge variant="neutral" size="sm" className="shrink-0">
                  自建
                </Badge>
              )}
              {!template.isActive && (
                <Badge variant="outline" size="sm" className="shrink-0">
                  已禁用
                </Badge>
              )}
            </div>
            <span className="line-clamp-1 text-xs text-muted-foreground">
              {template.description?.trim() ? template.description : '暂无描述'}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'deviceTypes',
      title: '适用设备',
      width: '13%',
      render: (_value, template) => {
        const deviceTypes = template.deviceTypes || []
        if (deviceTypes.length === 0) {
          return <span className="text-xs text-muted-foreground">未配置</span>
        }
        return (
          <div className="flex flex-wrap gap-1">
            {deviceTypes.slice(0, 2).map((type: string) => (
              <Badge key={type} variant="outline" size="sm" className="gap-1">
                {getDeviceTypeIcon(type)}
                <span>{getDeviceTypeLabel(type)}</span>
              </Badge>
            ))}
            {deviceTypes.length > 2 && (
              <Badge variant="outline" size="sm">
                +{deviceTypes.length - 2}
              </Badge>
            )}
          </div>
        )
      },
    },
    {
      key: 'category',
      title: '类别',
      width: '12%',
      render: (_value, template) => {
        const meta = getCategoryMeta(template.category)
        return (
          <Badge variant={meta.badgeVariant} size="sm">
            {meta.label}
          </Badge>
        )
      },
    },
    {
      key: 'checkItems',
      title: '检查项',
      width: '15%',
      render: (_value, template) => {
        const summary = summarizeCheckItems(template.checkItems)
        return (
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium tabular-nums text-foreground">
              {summary.total} 项
            </span>
            <span className="text-xs text-muted-foreground truncate" title={summary.breakdownText}>
              {summary.breakdownText}
            </span>
          </div>
        )
      },
    },
    {
      key: 'updatedAt',
      title: '更新时间',
      width: '11%',
      render: (_value, template) => (
        <span className="text-sm tabular-nums text-muted-foreground whitespace-nowrap">
          {template.updatedAt ? formatDateYMD(template.updatedAt) : '-'}
        </span>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      align: 'right',
      width: '15%',
      render: (_value, template) => (
        <div className="inline-flex items-center justify-end gap-0.5 whitespace-nowrap">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleViewTemplate(template)}
            title="查看详情"
            aria-label="查看详情"
            className="cursor-pointer"
          >
            <Eye className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleCloneTemplate(template)}
            disabled={cloneTemplate.isPending}
            title="复制模板"
            aria-label="复制模板"
            className="cursor-pointer"
          >
            <Copy className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleExportTemplateClick(template)}
            title="导出模板"
            aria-label="导出模板"
            className="cursor-pointer"
          >
            <Download className="w-4 h-4" />
          </Button>
          {!template.isBuiltIn && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleEditTemplate(template)}
                title="编辑"
                aria-label="编辑"
                className="cursor-pointer"
              >
                <Edit className="w-4 h-4" />
              </Button>
              <DeleteIconButton
                onClick={() => handleDeleteTemplate(template)}
                title="删除"
                className="cursor-pointer"
              />
            </>
          )}
        </div>
      ),
    },
  ]

  if (isLoading) {
    return (
      <div className="flex flex-1 min-h-0 flex-col gap-3">
        <div className="h-9 w-full rounded-lg bg-muted/60 animate-pulse" />
        <div className="flex-1 rounded-lg border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="px-4 py-3.5 flex items-center gap-4 animate-pulse">
                <div className="h-4 bg-muted rounded w-1/3" />
                <div className="h-4 bg-muted rounded w-1/6" />
                <div className="h-4 bg-muted rounded w-1/8" />
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
              <RefreshCw className="w-4 h-4 mr-2" />
              重试
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3">
      {/* 工具栏：左侧搜索与多维筛选，右侧次级工具与唯一主 CTA */}
      <CompactPageToolbar
        layout="between"
        testIdPrefix="inspection-templates-toolbar"
        search={{
          value: searchText,
          placeholder: '搜索模板名称或描述...',
          ariaLabel: '搜索模板',
          onChange: handleSearch,
        }}
        filters={(
          <div className="flex flex-wrap items-center gap-2">
            <VendorFilter
              value={filters.vendor || ''}
              onChange={(value) => handleFilterChange('vendor', value)}
            />
            <DeviceTypeFilter
              value={filters.deviceType || ''}
              onChange={(value) => handleFilterChange('deviceType', value)}
            />
            <CategoryFilter
              value={filters.category || ''}
              onChange={(value) => handleFilterChange('category', value)}
            />
            <div
              role="group"
              aria-label="按模板来源筛选"
              className="inline-flex h-9 items-center rounded-lg border border-border/70 bg-surface-2 p-[3px]"
            >
              {[
                { key: 'all' as const, label: '全部', count: allTemplatesCount },
                { key: 'builtin' as const, label: '内置', count: builtInTemplatesCount },
                { key: 'custom' as const, label: '自定义', count: customTemplatesCount },
              ].map((item) => {
                const isActive = sourceFacet === item.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => handleFacetChange(item.key)}
                    className={cn(
                      'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                      isActive
                        ? 'bg-card text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <span>{item.label}</span>
                    <span className="tabular-nums text-muted-foreground">{item.count}</span>
                  </button>
                )
              })}
            </div>
            <div className="inline-flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">排序</span>
              <TemplateSortSegments
                sortField={sortField}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
            </div>
          </div>
        )}
        secondaryActions={[
          {
            key: 'refresh-templates',
            label: '刷新',
            icon: <RefreshCw className="w-4 h-4" />,
            variant: 'outline',
            onClick: () => {
              void refetch()
            },
          },
          {
            key: 'import-template',
            label: '导入模板',
            icon: <Upload className="w-4 h-4" />,
            variant: 'outline',
            onClick: () => setIsImportModalOpen(true),
          },
          {
            key: 'quick-create-template',
            label: '快速创建',
            icon: <Zap className="w-4 h-4" />,
            variant: 'outline',
            onClick: () => setIsQuickCreateOpen(true),
          },
        ]}
        primaryActions={[
          {
            key: 'create-template',
            label: '创建模板',
            icon: <Plus className="w-4 h-4" />,
            onClick: handleCreateTemplate,
          },
        ]}
      />

      {/* 一体式主数据面板：按需顶栏（激活筛选芯片）+ 表格 + 吸底分页 */}
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2/40 px-4 py-2 shrink-0">
            {activeFilters.map((filter) => (
              <Badge key={filter.id} variant="outline" size="sm" asChild>
                <button
                  type="button"
                  onClick={filter.onRemove}
                  aria-label={`移除 ${filter.label} 筛选`}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <span>{filter.label}</span>
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <div className="flex flex-1 min-h-0 flex-col">
          {templates.length > 0 ? (
            <Table
              data={templates}
              columns={columns}
              rowKey="id"
              rowSelection={batchSelection.rowSelection}
              className="flex flex-1 min-h-0 flex-col border-0"
            />
          ) : (
            <div className="flex flex-1 min-h-0 items-center justify-center px-6 py-12 text-center">
              <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    {hasActiveFilters ? '没有找到符合条件的模板' : '暂无巡检模板'}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {hasActiveFilters
                      ? '尝试调整筛选条件或清空搜索关键词'
                      : '开始创建您的第一个巡检模板'}
                  </p>
                </div>
                {hasActiveFilters ? (
                  <Button
                    variant="outline"
                    onClick={handleClearFilters}
                    className="mt-1 cursor-pointer"
                  >
                    清除筛选条件
                  </Button>
                ) : (
                  <Button onClick={handleCreateTemplate} className="mt-1 cursor-pointer">
                    <Plus className="w-4 h-4 mr-2" />
                    创建模板
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 分页：复用全站统一的分页组件并收底固定 */}
        <div data-slot="table-footer" className="shrink-0 border-t border-border px-4">
          <Pagination
            currentPage={pagination.page}
            totalPages={totalPages}
            totalItems={totalTemplates}
            pageSize={pagination.page_size}
            onPageChange={(page) => setPagination((prev) => ({ ...prev, page }))}
            onPageSizeChange={(pageSize) =>
              setPagination((prev) => ({
                ...prev,
                page: 1,
                page_size: pageSize,
              }))
            }
          />
        </div>
      </div>

      {/* 单条删除确认对话框 */}
      <ConfirmModal
        isOpen={!!deleteConfirmTemplate}
        onClose={() => {
          if (!deleteTemplateMutation.isPending) {
            setDeleteConfirmTemplate(null)
          }
        }}
        onConfirm={handleConfirmDelete}
        title="确认删除模板"
        description={
          deleteConfirmTemplate
            ? `确定要删除巡检模板“${deleteConfirmTemplate.name}”吗？此操作无法撤销。`
            : undefined
        }
        confirmText={deleteTemplateMutation.isPending ? '删除中...' : '确认删除'}
        cancelText="取消"
        variant="destructive"
        confirmDisabled={deleteTemplateMutation.isPending}
        cancelDisabled={deleteTemplateMutation.isPending}
      />

      {/* 模板详情查看 Modal */}
      {viewingTemplate && (
        <TemplateDetailModal
          template={viewingTemplate}
          onClose={() => setViewingTemplate(null)}
          onEdit={() => {
            setEditingTemplate(viewingTemplate)
            setViewingTemplate(null)
            setIsEditorOpen(true)
          }}
        />
      )}

      {/* 模板导入 Modal */}
      {isImportModalOpen && (
        <TemplateImportModal
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={handleImportSuccess}
        />
      )}

      {/* 快速创建模板 Modal */}
      {isQuickCreateOpen && (
        <QuickTemplateCreate
          onClose={() => setIsQuickCreateOpen(false)}
          onSuccess={() => {
            setIsQuickCreateOpen(false)
            refetch()
          }}
          onAdvanced={() => {
            setIsQuickCreateOpen(false)
            setEditingTemplate(null)
            setIsEditorOpen(true)
          }}
        />
      )}

      {/* 创建/编辑模板 Wizard */}
      {isEditorOpen && (
        <CreateTemplateWizard
          template={editingTemplate}
          onClose={handleEditorClose}
          onSuccess={handleEditorSuccess}
        />
      )}

      {/* 底部悬浮批量操作栏 */}
      <FloatingBatchActionBar
        selectedCount={batchSelection.selectedCount}
        selectionMode={batchSelection.selectionMode}
        totalCount={customTemplatesCount}
        isAllCurrentPageSelected={batchSelection.isAllCurrentPageSelected}
        onSelectCurrentPage={batchSelection.selectCurrentPage}
        onSelectAllFiltered={batchSelection.selectAllFiltered}
        onInvertCurrentPage={batchSelection.invertCurrentPage}
        onClearSelection={batchSelection.clearSelection}
        onDelete={() => setShowBatchDeleteConfirm(true)}
        isDeleting={isBatchDeleting}
      />

      {/* 批量删除确认弹窗 */}
      <BatchDeleteConfirmModal
        isOpen={showBatchDeleteConfirm}
        onClose={() => {
          if (!isBatchDeleting) {
            setShowBatchDeleteConfirm(false)
          }
        }}
        onConfirm={handleConfirmBatchDelete}
        isDeleting={isBatchDeleting}
        count={batchSelection.selectedCount}
        isAllFiltered={batchSelection.selectionMode === 'all_filtered'}
        entityLabel="个自定义模板"
      />
    </div>
  )
}
