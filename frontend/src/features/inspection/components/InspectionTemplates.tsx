/**
 * 巡检模板管理组件 - 集成优化版
 * 整合了新的筛选器、模板编辑器、导入导出等功能
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Edit,
  Copy,
  Trash2,
  Eye,
  FileText,
  Shield,
  Monitor,
  Settings,
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Upload,
  Search,
  Filter,
  X,
  RefreshCw,
  Zap
} from 'lucide-react'
import {
  Card,
  CardContent,
  Button,
  Badge,
  Table,
  Column,
  SimpleInput as Input
} from '@/components/atoms'
import type { BadgeProps } from '@/components/atoms'

// 导入新版 hooks 和类型（来自 inspection feature）
import {
  useInspectionTemplates,
  useCloneTemplate,
  useDeleteTemplate,
} from '../hooks/useInspection'
import {
  fetchInspectionTemplate,
} from '../api/inspection.api'
import type { InspectionTemplate } from '../types'

// 筛选和分页类型（本地定义，与新版 API 兼容）
interface TemplateFilters {
  vendor?: string
  deviceType?: string
  category?: string
  isBuiltIn?: boolean
  search?: string
}

interface Pagination {
  page: number
  page_size: number
  sort?: string
  order?: 'asc' | 'desc'
}

// 导入筛选器组件
import { VendorFilter } from './VendorFilter'
import { DeviceTypeFilter } from './DeviceTypeFilter'
import { CategoryFilter } from './CategoryFilter'

// 导入模态框组件
import { TemplateDetailModal } from './TemplateDetailModal'
import { TemplateImportModal } from './TemplateImportModal'

// 导入新的编辑器组件
import { CreateTemplateWizard } from './CreateTemplateWizard'
import { QuickTemplateCreate } from './QuickTemplateCreate'

// 类型定义
type SortField = 'name' | 'category' | 'createdAt' | 'updatedAt'
type SortOrder = 'asc' | 'desc'

export const InspectionTemplates: React.FC = () => {
  // 筛选状态
  const [filters, setFilters] = useState<TemplateFilters>({})
  const [searchText, setSearchText] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // 搜索防抖（350ms）
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
    }
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchText)
      setPagination(prev => prev.page === 1 ? prev : { ...prev, page: 1 })
    }, 350)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchText])

  // 分页和排序状态
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    page_size: 20,
    sort: 'updatedAt',
    order: 'desc'
  })
  const [sortField, setSortField] = useState<SortField>('updatedAt')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  // 模态框状态
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<InspectionTemplate | null>(null)
  const [viewingTemplate, setViewingTemplate] = useState<InspectionTemplate | null>(null)
  const [deleteConfirmTemplate, setDeleteConfirmTemplate] = useState<InspectionTemplate | null>(null)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)

  // 排序字段映射：前端驼峰 → 后端蛇形（数据库列名）
  const sortFieldMap: Record<SortField, string> = {
    name: 'name',
    category: 'category',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }

  // 使用新版 hooks
  const { data: templatesData, isLoading, refetch, error } = useInspectionTemplates({
    page: pagination.page,
    pageSize: pagination.page_size,
    category: filters.category || undefined,
    deviceTypes: filters.deviceType ? [filters.deviceType] : undefined,
    search: debouncedSearch || undefined,
    vendor: filters.vendor || undefined,
    sort: sortFieldMap[sortField] || undefined,
    order: pagination.order || undefined,
  })

  const cloneTemplate = useCloneTemplate()

  const deleteTemplateMutation = useDeleteTemplate()

  // 导出模板函数
  const handleExportTemplate = async (template: InspectionTemplate) => {
    try {
      const fullTemplate = await fetchInspectionTemplate(Number(template.id))
      if (fullTemplate) {
        const blob = new Blob([JSON.stringify(fullTemplate, null, 2)], { type: 'application/json' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `template-${template.name}-${Date.now()}.json`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (error) {
      console.error('Export template failed:', error)
    }
  }

  // 获取模板列表
  const templates: InspectionTemplate[] = templatesData?.templates || []

  const totalPages = Math.ceil((templatesData?.total || 0) / pagination.page_size)

  // 处理筛选变更
  const handleFilterChange = useCallback((key: keyof TemplateFilters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value || undefined
    }))
    setPagination(prev => ({ ...prev, page: 1 }))
  }, [])

  // 处理搜索
  const handleSearch = useCallback((value: string) => {
    setSearchText(value)
  }, [])

  // 处理排序
  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      const newOrder = sortOrder === 'asc' ? 'desc' : 'asc'
      setSortOrder(newOrder)
      setPagination(prev => ({ ...prev, sort: field, order: newOrder }))
    } else {
      setSortField(field)
      setSortOrder('desc')
      setPagination(prev => ({ ...prev, sort: field, order: 'desc' }))
    }
  }, [sortField, sortOrder])

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
    }
    return sortOrder === 'asc'
      ? <ArrowUp className="w-4 h-4 text-blue-600" />
      : <ArrowDown className="w-4 h-4 text-blue-600" />
  }

  // 操作处理函数
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
        name: `${template.name} - 副本`
      })
      refetch()
    } catch (error) {
      console.error('Clone template failed:', error)
    }
  }

  const handleDeleteTemplate = (template: InspectionTemplate) => {
    setDeleteConfirmTemplate(template)
  }

  const handleConfirmDelete = async () => {
    if (!deleteConfirmTemplate) return
    try {
      await deleteTemplateMutation.mutateAsync(String(deleteConfirmTemplate.id))
      setDeleteConfirmTemplate(null)
      refetch()
    } catch (error) {
      console.error('Delete template failed:', error)
    }
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

  // 清除所有筛选
  const handleClearFilters = () => {
    setFilters({})
    setSearchText('')
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  const hasActiveFilters = filters.vendor || filters.deviceType || filters.category || searchText

  // 辅助函数
  const getCategoryIcon = (category?: string) => {
    switch (category) {
      case 'network': return <Monitor className="w-4 h-4" />
      case 'system': return <Settings className="w-4 h-4" />
      case 'security': return <Shield className="w-4 h-4" />
      default: return <FileText className="w-4 h-4" />
    }
  }

  const getCategoryLabel = (category?: string) => {
    const labels: Record<string, string> = {
      network: '网络监控',
      system: '系统检查',
      security: '安全检测',
      custom: '自定义'
    }
    return labels[category || ''] || category || '未分类'
  }

  const getCategoryBadgeVariant = (category?: string): BadgeProps['variant'] => {
    switch (category) {
      case 'network': return 'primary'
      case 'system': return 'secondary'
      case 'security': return 'warning'
      default: return 'outline'
    }
  }

  // 表格列定义
  const columns: Column<InspectionTemplate>[] = [
    {
      key: 'name',
      title: '模板名称',
      render: (_value, template) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            {getCategoryIcon(template.category)}
            <span className="font-medium text-foreground">{template.name}</span>
            {template.isBuiltIn && (
              <Badge variant="success" size="sm">内置</Badge>
            )}
            {!template.isActive && (
              <Badge variant="outline" size="sm">已禁用</Badge>
            )}
          </div>
          {template.description && (
            <span className="text-sm text-muted-foreground line-clamp-2 mt-1">
              {template.description}
            </span>
          )}
        </div>
      )
    },
    {
      key: 'category',
      title: '类别',
      render: (_value, template) => (
        <Badge variant={getCategoryBadgeVariant(template.category)}>
          {getCategoryLabel(template.category)}
        </Badge>
      )
    },
    {
      key: 'deviceTypes',
      title: '支持设备',
      render: (_value, template) => {
        const deviceTypes = template.deviceTypes || []
        return (
          <div className="flex flex-wrap gap-1">
            {deviceTypes.slice(0, 3).map((type: string) => (
              <Badge key={type} variant="outline" size="sm">
                {type}
              </Badge>
            ))}
            {deviceTypes.length > 3 && (
              <Badge variant="outline" size="sm">
                +{deviceTypes.length - 3}
              </Badge>
            )}
            {deviceTypes.length === 0 && (
              <span className="text-muted-foreground text-sm">未配置</span>
            )}
          </div>
        )
      }
    },
    {
      key: 'checkItems',
      title: '检查项',
      render: (_value, template) => (
        <div className="flex items-center gap-1">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">
            {template.checkItems?.length || 0}
          </span>
        </div>
      )
    },
    {
      key: 'updatedAt',
      title: '更新时间',
      render: (_value, template) => (
        <div className="text-sm text-muted-foreground dark:text-gray-300">
          {template.updatedAt ? new Date(template.updatedAt).toLocaleDateString() : '-'}
        </div>
      )
    },
    {
      key: 'actions',
      title: '操作',
      render: (_value, template) => (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleViewTemplate(template)}
            title="查看详情"
          >
            <Eye className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleCloneTemplate(template)}
            disabled={cloneTemplate.isPending}
            title="复制模板"
          >
            <Copy className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleExportTemplateClick(template)}
            title="导出模板"
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
              >
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDeleteTemplate(template)}
                title="删除"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </Button>
            </>
          )}
        </div>
      )
    }
  ]

  // 如果正在编辑模板，显示新的向导组件
  if (isEditorOpen) {
    return (
      <>
        <CreateTemplateWizard
          template={editingTemplate}
          onClose={handleEditorClose}
          onSuccess={handleEditorSuccess}
        />
      </>
    )
  }

  // 加载状态
  if (isLoading) {
    return (
      <div className="space-y-4">
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

  // 错误状态
  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground">加载失败</h3>
          <p className="text-muted-foreground mt-1">{error.message}</p>
          <Button className="mt-4" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            重试
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        {/* 搜索框 */}
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="搜索模板名称或描述..."
              className="pl-10"
            />
          </div>
          <Button
            variant={showFilters ? 'primary' : 'outline'}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4 mr-2" />
            筛选
            {hasActiveFilters && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                {[filters.vendor, filters.deviceType, filters.category, searchText].filter(Boolean).length}
              </span>
            )}
          </Button>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsImportModalOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            导入模板
          </Button>
          <Button variant="outline" onClick={() => setIsQuickCreateOpen(true)}>
            <Zap className="w-4 h-4 mr-2" />
            快速创建
          </Button>
          <Button onClick={handleCreateTemplate}>
            <Plus className="w-4 h-4 mr-2" />
            创建模板
          </Button>
        </div>
      </div>

      {/* 筛选面板 */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-foreground">筛选条件</h3>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                      <X className="w-4 h-4 mr-1" />
                      清除筛选
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">
                  {templatesData?.total || 0}
                </div>
                <div className="text-sm text-muted-foreground dark:text-gray-300">全部模板</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">
                  {templates.filter(t => t.isBuiltIn).length}
                </div>
                <div className="text-sm text-muted-foreground dark:text-gray-300">内置模板</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Settings className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">
                  {templates.filter(t => !t.isBuiltIn).length}
                </div>
                <div className="text-sm text-muted-foreground dark:text-gray-300">自定义模板</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <Monitor className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">
                  {templates.filter(t => t.isActive).length}
                </div>
                <div className="text-sm text-muted-foreground dark:text-gray-300">已启用</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 排序选项 */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground dark:text-gray-300">排序:</span>
        <div className="flex gap-2">
          <Button
            variant={sortField === 'name' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => handleSort('name')}
            className="flex items-center gap-1"
          >
            模板名称
            {getSortIcon('name')}
          </Button>
          <Button
            variant={sortField === 'category' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => handleSort('category')}
            className="flex items-center gap-1"
          >
            类别
            {getSortIcon('category')}
          </Button>
          <Button
            variant={sortField === 'updatedAt' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => handleSort('updatedAt')}
            className="flex items-center gap-1"
          >
            更新时间
            {getSortIcon('updatedAt')}
          </Button>
        </div>
        <div className="ml-auto">
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 模板列表 */}
      {templates.length > 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Table
            data={templates}
            columns={columns}
            className="bg-card rounded-lg shadow-sm"
          />

          {/* 分页 */}
          <div className="flex flex-wrap justify-between items-center mt-4 px-2 gap-4">
            {/* 左侧：每页显示数量选择 */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">每页显示</span>
              <select
                value={pagination.page_size}
                onChange={(e) => setPagination(p => ({ ...p, page: 1, page_size: Number(e.target.value) }))}
                className="px-2 py-1 text-sm border border-border/70 rounded-md bg-card text-foreground/90 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={10}>10 条</option>
                <option value={20}>20 条</option>
                <option value={50}>50 条</option>
              </select>
              <span className="text-sm text-muted-foreground">
                共 {templatesData?.total || 0} 条记录
              </span>
            </div>

            {/* 右侧：分页控制 */}
            <div className="flex items-center gap-2">
              {/* 上一页 */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagination(p => ({ ...p, page: Math.max(1, p.page - 1) }))}
                disabled={pagination.page === 1}
              >
                上一页
              </Button>

              {/* 页码显示 */}
              <div className="flex items-center gap-1">
                {(() => {
                  const pages: (number | string)[] = []
                  const current = pagination.page
                  const total = totalPages

                  if (total <= 7) {
                    // 总页数小于等于7，显示所有页码
                    for (let i = 1; i <= total; i++) {
                      pages.push(i)
                    }
                  } else {
                    // 总页数大于7，显示省略号
                    if (current <= 4) {
                      // 当前页靠近开头
                      for (let i = 1; i <= 5; i++) pages.push(i)
                      pages.push('...')
                      pages.push(total)
                    } else if (current >= total - 3) {
                      // 当前页靠近结尾
                      pages.push(1)
                      pages.push('...')
                      for (let i = total - 4; i <= total; i++) pages.push(i)
                    } else {
                      // 当前页在中间
                      pages.push(1)
                      pages.push('...')
                      for (let i = current - 1; i <= current + 1; i++) pages.push(i)
                      pages.push('...')
                      pages.push(total)
                    }
                  }

                  return pages.map((p, idx) => (
                    p === '...' ? (
                      <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">...</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPagination(prev => ({ ...prev, page: p as number }))}
                        className={`min-w-[32px] h-8 px-2 text-sm rounded-md transition-colors ${
                          pagination.page === p
                            ? 'bg-blue-600 text-white'
                            : 'bg-card text-foreground/90 border border-border/70 hover:bg-muted dark:hover:bg-gray-700'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  ))
                })()}
              </div>

              {/* 下一页 */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                disabled={pagination.page >= totalPages}
              >
                下一页
              </Button>

              {/* 跳转到指定页 */}
              <div className="flex items-center gap-1 ml-2">
                <span className="text-sm text-muted-foreground">跳至</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  defaultValue={pagination.page}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const value = parseInt((e.target as HTMLInputElement).value)
                      if (value >= 1 && value <= totalPages) {
                        setPagination(p => ({ ...p, page: value }))
                      }
                    }
                  }}
                  onBlur={(e) => {
                    const value = parseInt(e.target.value)
                    if (value >= 1 && value <= totalPages) {
                      setPagination(p => ({ ...p, page: value }))
                    }
                  }}
                  className="w-14 px-2 py-1 text-sm text-center border border-border/70 rounded-md bg-card text-foreground/90 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-muted-foreground">页</span>
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <AlertCircle className="w-12 h-12 text-muted-foreground" />
              <div>
                <h3 className="text-lg font-medium text-foreground">
                  {hasActiveFilters ? '没有找到符合条件的模板' : '暂无巡检模板'}
                </h3>
                <p className="text-muted-foreground mt-1">
                  {hasActiveFilters ? '尝试调整筛选条件' : '开始创建您的第一个巡检模板'}
                </p>
              </div>
              {hasActiveFilters ? (
                <Button variant="outline" onClick={handleClearFilters}>
                  清除筛选条件
                </Button>
              ) : (
                <Button onClick={handleCreateTemplate}>
                  <Plus className="w-4 h-4 mr-2" />
                  创建模板
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 删除确认对话框 */}
      {deleteConfirmTemplate && (
        <div className="fixed inset-0 bg-gray-900/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-card rounded-xl shadow-xl max-w-md w-full p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">确认删除</h3>
                <p className="text-sm text-muted-foreground">此操作无法撤销</p>
              </div>
            </div>

            <div className="mb-6">
              <p className="text-foreground/90">
                确定要删除巡检模板 <span className="font-semibold">"{deleteConfirmTemplate.name}"</span> 吗？
              </p>
              {deleteConfirmTemplate.isBuiltIn && (
                <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-300">
                    ⚠️ 这是一个内置模板，删除后可能影响系统功能
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setDeleteConfirmTemplate(null)}
                disabled={deleteTemplateMutation.isPending}
              >
                取消
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmDelete}
                disabled={deleteTemplateMutation.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteTemplateMutation.isPending ? '删除中...' : '确认删除'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 模板详情查看 Modal */}
      {viewingTemplate && (
        <TemplateDetailModal
          template={viewingTemplate as any}
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
    </div>
  )
}

