import React, { useState } from 'react'
import { motion } from 'framer-motion'
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
  ArrowDown
} from 'lucide-react'
import {
  Card,
  CardContent,
  Button,
  Badge,
  Table,
  Column
} from '@/components/atoms'
import type { BadgeProps } from '@/components/atoms'
import {
  useInspectionTemplates,
  useCloneTemplate,
  useDeleteTemplate
} from '../hooks/useInspection'
import { InspectionTemplate } from '../types'
import { TemplateModal } from './TemplateModal'
import { TemplateDetailModal } from './TemplateDetailModal'
import { TemplateImportModal } from './TemplateImportModal'

interface Props {
  searchText: string
}

export const InspectionTemplates: React.FC<Props> = ({ searchText }) => {
  const { data: templatesData, isLoading, refetch } = useInspectionTemplates()
  const cloneTemplate = useCloneTemplate()
  const deleteTemplate = useDeleteTemplate()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<InspectionTemplate | null>(null)
  const [viewingTemplate, setViewingTemplate] = useState<InspectionTemplate | null>(null)
  const [deleteConfirmTemplate, setDeleteConfirmTemplate] = useState<InspectionTemplate | null>(null)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [sortField, setSortField] = useState<'name' | 'category' | 'updatedAt'>('updatedAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [selectedCategory, setSelectedCategory] = useState<InspectionTemplate['category'] | 'all'>('all')

  const templates: InspectionTemplate[] = templatesData?.templates ?? []

  // 过滤模板列表
  const normalizedKeyword = searchText.trim().toLowerCase()
  const filteredTemplates = templates.filter(template => {
    const name = template.name?.toLowerCase() ?? ''
    const description = template.description?.toLowerCase() ?? ''

    // 搜索关键词筛选
    const matchesSearch = !normalizedKeyword ||
      name.includes(normalizedKeyword) ||
      description.includes(normalizedKeyword)

    // 类别筛选
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  // 排序模板列表
  const sortedTemplates = [...filteredTemplates].sort((a, b) => {
    let compareResult = 0

    switch (sortField) {
      case 'name':
        compareResult = a.name.localeCompare(b.name, 'zh-CN')
        break
      case 'category':
        compareResult = a.category.localeCompare(b.category)
        break
      case 'updatedAt':
        compareResult = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
        break
    }

    return sortDirection === 'asc' ? compareResult : -compareResult
  })

  const handleSort = (field: 'name' | 'category' | 'updatedAt') => {
    if (sortField === field) {
      // 切换排序方向
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // 切换排序字段,默认降序
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const getSortIcon = (field: 'name' | 'category' | 'updatedAt') => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="w-4 h-4 text-blue-600" />
      : <ArrowDown className="w-4 h-4 text-blue-600" />
  }

  const handleCloneTemplate = async (template: InspectionTemplate) => {
    try {
      await cloneTemplate.mutateAsync({
        id: template.id,
        name: `${template.name} - 副本`
      })
    } catch (error) {
      console.error('Clone template failed:', error)
    }
  }

  const handleCreateTemplate = () => {
    setEditingTemplate(null)
    setIsModalOpen(true)
  }

  const handleEditTemplate = (template: InspectionTemplate) => {
    setEditingTemplate(template)
    setIsModalOpen(true)
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingTemplate(null)
  }

  const handleModalSuccess = () => {
    handleModalClose()
    refetch()
  }

  const handleDeleteTemplate = (template: InspectionTemplate) => {
    setDeleteConfirmTemplate(template)
  }

  const handleConfirmDelete = async () => {
    if (!deleteConfirmTemplate) return

    try {
      await deleteTemplate.mutateAsync(deleteConfirmTemplate.id)
      setDeleteConfirmTemplate(null)
      refetch()
    } catch (error) {
      console.error('Delete template failed:', error)
    }
  }

  const handleCancelDelete = () => {
    setDeleteConfirmTemplate(null)
  }

  const handleViewTemplate = (template: InspectionTemplate) => {
    setViewingTemplate(template)
  }

  const handleCloseDetailModal = () => {
    setViewingTemplate(null)
  }

  const handleEditFromDetail = () => {
    if (viewingTemplate) {
      setEditingTemplate(viewingTemplate)
      setViewingTemplate(null)
      setIsModalOpen(true)
    }
  }

  const handleOpenImportModal = () => {
    setIsImportModalOpen(true)
  }

  const handleCloseImportModal = () => {
    setIsImportModalOpen(false)
  }

  const handleImportSuccess = () => {
    refetch()
  }

  const handleCategoryClick = (category: InspectionTemplate['category'] | 'all') => {
    // 如果点击当前选中的类别,则重置为"全部"
    if (selectedCategory === category) {
      setSelectedCategory('all')
    } else {
      setSelectedCategory(category)
    }
  }

  const getCategoryIcon = (category: InspectionTemplate['category']) => {
    switch (category) {
      case 'network':
        return <Monitor className="w-4 h-4" />
      case 'system':
        return <Settings className="w-4 h-4" />
      case 'security':
        return <Shield className="w-4 h-4" />
      default:
        return <FileText className="w-4 h-4" />
    }
  }

  const getCategoryLabel = (category: InspectionTemplate['category']) => {
    const labels = {
      network: '网络监控',
      system: '系统检查',
      security: '安全检测',
      custom: '自定义'
    }
    return labels[category as keyof typeof labels] || category
  }

  const getCategoryBadgeVariant = (category: InspectionTemplate['category']): BadgeProps['variant'] => {
    switch (category) {
      case 'network':
        return 'primary'
      case 'system':
        return 'secondary'
      case 'security':
        return 'warning'
      default:
        return 'outline'
    }
  }

  const columns: Column<InspectionTemplate>[] = [
    {
      key: 'name',
      title: '模板名称',
      render: (_value, template) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            {getCategoryIcon(template.category)}
            <span className="font-medium text-gray-900 dark:text-gray-100">{template.name}</span>
            {template.isBuiltIn && (
              <Badge variant="success" size="sm">内置</Badge>
            )}
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">{template.description}</span>
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
        const deviceTypes = template.deviceTypes ?? []
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
          </div>
        )
      }
    },
    {
      key: 'checkItems',
      title: '检查项',
      render: (_value, template) => (
        <div className="flex items-center gap-1">
          <FileText className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          <span className="font-medium">{template.checkItems.length}</span>
        </div>
      )
    },
    {
      key: 'updatedAt',
      title: '更新时间',
      render: (_value, template) => (
        <div className="text-sm text-gray-600 dark:text-gray-300">
          {new Date(template.updatedAt).toLocaleDateString()}
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
          <h3 className="text-lg font-semibold dark:text-gray-100">巡检模板管理</h3>
          <Badge variant="secondary">{filteredTemplates.length} 项</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleOpenImportModal}>
            <Copy className="w-4 h-4 mr-2" />
            导入模板
          </Button>
          <Button onClick={handleCreateTemplate}>
            <Plus className="w-4 h-4 mr-2" />
            创建模板
          </Button>
        </div>
      </div>

      {/* 快速统计 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: '网络监控', count: templates.filter(t => t.category === 'network').length, icon: Monitor, color: 'blue', category: 'network' as const },
          { label: '系统检查', count: templates.filter(t => t.category === 'system').length, icon: Settings, color: 'green', category: 'system' as const },
          { label: '安全检测', count: templates.filter(t => t.category === 'security').length, icon: Shield, color: 'red', category: 'security' as const },
          { label: '自定义', count: templates.filter(t => t.category === 'custom').length, icon: FileText, color: 'purple', category: 'custom' as const }
        ].map((item) => {
          const isSelected = selectedCategory === item.category
          return (
            <Card
              key={item.label}
              className={`cursor-pointer transition-all hover:shadow-md ${
                isSelected ? 'ring-2 ring-blue-500 shadow-md' : ''
              }`}
              onClick={() => handleCategoryClick(item.category)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-${item.color}-100`}>
                    <item.icon className={`w-5 h-5 text-${item.color}-600`} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{item.count}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">{item.label}</div>
                  </div>
                </div>
                {isSelected && (
                  <div className="mt-2 text-xs text-blue-600 dark:text-blue-400 font-medium">
                    ✓ 已选中
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* 排序选项 */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">排序:</span>
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
      </div>

      {/* 模板列表 */}
      {sortedTemplates.length > 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Table
            data={sortedTemplates}
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
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">暂无巡检模板</h3>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                  {searchText ? '没有找到匹配的模板' : '开始创建您的第一个巡检模板'}
                </p>
              </div>
              {!searchText && (
                <Button className="mt-2" onClick={handleCreateTemplate}>
                  <Plus className="w-4 h-4 mr-2" />
                  创建模板
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 模板创建/编辑 Modal */}
      {isModalOpen && (
        <TemplateModal
          template={editingTemplate}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      )}

      {/* 删除确认对话框 */}
      {deleteConfirmTemplate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-md w-full p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">确认删除</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">此操作无法撤销</p>
              </div>
            </div>

            <div className="mb-6">
              <p className="text-gray-700 dark:text-gray-300">
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
                onClick={handleCancelDelete}
                disabled={deleteTemplate.isPending}
              >
                取消
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmDelete}
                disabled={deleteTemplate.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteTemplate.isPending ? '删除中...' : '确认删除'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 模板详情查看 Modal */}
      {viewingTemplate && (
        <TemplateDetailModal
          template={viewingTemplate}
          onClose={handleCloseDetailModal}
          onEdit={handleEditFromDetail}
        />
      )}

      {/* 模板导入 Modal */}
      {isImportModalOpen && (
        <TemplateImportModal
          onClose={handleCloseImportModal}
          onSuccess={handleImportSuccess}
        />
      )}
    </div>
  )
}