/**
 * 模板列表组件
 * 集成筛选、搜索、分页功能的完整模板列表
 */

import { useState } from 'react'
import toast from 'react-hot-toast'
import { useInspectionTemplates, useCloneTemplate, useDeleteTemplate } from '../hooks/useInspection'
import { VendorFilter } from './VendorFilter'
import { DeviceTypeFilter } from './DeviceTypeFilter'
import { CategoryFilter } from './CategoryFilter'
import { TemplateCard } from './TemplateCard'

interface TemplateFilters {
  vendor?: string
  deviceType?: string
  category?: string
  search?: string
}

interface Pagination {
  page: number
  pageSize: number
  sort?: string
  order?: 'asc' | 'desc'
}

interface TemplateListProps {
  onTemplateSelect?: (id: string) => void
  selectedTemplateId?: string | null
  showActions?: boolean
}

export function TemplateList({
  onTemplateSelect,
  selectedTemplateId = null,
  showActions = true,
}: TemplateListProps) {
  const [filters, setFilters] = useState<TemplateFilters>({})
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    sort: 'createdAt',
    order: 'desc',
  })

  // 获取模板列表
  const {
    data: templatesData,
    isLoading,
    error,
    refetch,
  } = useInspectionTemplates({
    page: pagination.page,
    pageSize: pagination.pageSize,
    category: filters.category,
    deviceTypes: filters.deviceType ? [filters.deviceType] : undefined,
  })

  // 复制模板
  const cloneMutation = useCloneTemplate()

  // 删除模板
  const deleteMutation = useDeleteTemplate()

  // 处理筛选变更
  const handleFilterChange = (key: keyof TemplateFilters, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
    }))
    setPagination((prev) => ({ ...prev, page: 1 }))
  }

  // 处理搜索
  const handleSearchChange = (value: string) => {
    handleFilterChange('search', value)
  }

  // 处理复制
  const handleCopy = (id: string) => {
    cloneMutation.mutate({ id, name: '' })
  }

  // 处理删除
  const handleDelete = (id: string) => {
    if (confirm('确定要删除这个模板吗？')) {
      deleteMutation.mutate(id)
    }
  }

  // 处理导出
  const handleExport = async (_id: string) => {
    toast('导出功能开发中…', { icon: '🛠️' })
  }

  // 计算总页数
  const totalPages = Math.ceil((templatesData?.total || 0) / pagination.pageSize)
  const templates = templatesData?.templates || []

  return (
    <div className="space-y-6">
      {/* 筛选器 */}
      <div className="bg-card border border-border p-4 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">筛选条件</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
        <div className="flex gap-4">
          <div className="flex-1">
            <label htmlFor="search" className="block text-sm font-medium mb-1">搜索</label>
            <input
              id="search"
              type="text"
              className="w-full border rounded px-3 py-2"
              placeholder="搜索模板名称或描述..."
              value={filters.search || ''}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button onClick={() => refetch()} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
              刷新
            </button>
          </div>
        </div>
      </div>

      {/* 模板列表 */}
      <div className="bg-card border border-border p-4 rounded-lg shadow">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">
            模板列表
            {templatesData && <span className="ml-2 text-sm font-normal text-muted-foreground">(共 {templatesData.total} 个)</span>}
          </h2>
        </div>

        {isLoading && <div className="text-center py-8 text-gray-500">加载中...</div>}
        {error && <div className="text-center py-8 text-red-500">错误: {(error as Error).message}</div>}

        {templatesData && (
          <div className="space-y-3">
            {templates.length === 0 ? (
              <div className="text-center py-8 text-gray-500">没有找到符合条件的模板</div>
            ) : (
              templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isSelected={selectedTemplateId === template.id}
                  onSelect={onTemplateSelect}
                  onCopy={showActions ? handleCopy : undefined}
                  onDelete={showActions ? handleDelete : undefined}
                  onExport={showActions ? handleExport : undefined}
                  isLoading={cloneMutation.isPending || deleteMutation.isPending}
                />
              ))
            )}

            {templates.length > 0 && (
              <div className="flex justify-between items-center pt-4 border-t">
                <div className="text-sm text-muted-foreground">第 {pagination.page} 页，共 {totalPages} 页</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
                    disabled={pagination.page === 1}
                    className="px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                    disabled={pagination.page >= totalPages}
                    className="px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
