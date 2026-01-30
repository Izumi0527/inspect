/**
 * 模板详情组件
 * 显示模板的完整信息和所有检查项
 */

import { useInspectionTemplate } from '../hooks/useInspection'
import { CheckItemGroup } from './CheckItemGroup'
import type { InspectionCheckItem } from '../types'

// 兼容旧版 CheckItem 类型
type CheckItem = InspectionCheckItem & {
  description?: string
  enabled?: boolean
  category?: string
  config?: {
    oid?: string
    command?: string
    timeout?: number
    unit?: string
    threshold?: { warning?: number; critical?: number }
    parsePattern?: string
    url?: string
  }
}

interface TemplateDetailProps {
  templateId: number
  onEdit?: (id: number) => void
  onCopy?: (id: number) => void
  onExport?: (id: number) => void
  onClose?: () => void
}

export function TemplateDetail({
  templateId,
  onEdit,
  onCopy,
  onExport,
  onClose,
}: TemplateDetailProps) {
  const { data: template, isLoading, error } = useInspectionTemplate(templateId)

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-8">
        <div className="text-center text-gray-500">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-8">
        <div className="text-center text-red-500">错误: {error.message}</div>
      </div>
    )
  }

  if (!template) {
    return (
      <div className="bg-white rounded-lg shadow p-8">
        <div className="text-center text-gray-500">模板不存在</div>
      </div>
    )
  }

  // 按类别分组检查项
  const checkItems = template.checkItems || []
  const groupedItems = checkItems.reduce((acc: Record<string, CheckItem[]>, item: any) => {
    const category = item.category || 'other'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(item as CheckItem)
    return acc
  }, {} as Record<string, CheckItem[]>)

  // 排序类别
  const categoryOrder = ['health', 'performance', 'compliance', 'security', 'routing', 'other']
  const sortedCategories = Object.keys(groupedItems).sort(
    (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
  )

  return (
    <div className="bg-white rounded-lg shadow">
      {/* 头部 */}
      <div className="p-6 border-b">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-bold text-gray-900">{template.name}</h2>
              {template.isBuiltIn && (
                <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
                  内置模板
                </span>
              )}
              {!template.isActive && (
                <span className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded-full">
                  已禁用
                </span>
              )}
            </div>
            {template.description && (
              <p className="text-gray-600 mb-4">{template.description}</p>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="关闭"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* 基本信息 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div>
            <div className="text-sm text-gray-600">分类</div>
            <div className="text-base font-medium text-gray-900">
              {template.category || '-'}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">状态</div>
            <div className="text-base font-medium text-gray-900">
              {(template.isActive ?? true) ? '启用' : '禁用'}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">检查项数量</div>
            <div className="text-base font-medium text-gray-900">
              {template.checkItems?.length || 0}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">模板类型</div>
            <div className="text-base font-medium text-gray-900">
              {template.isBuiltIn ? '内置' : '自定义'}
            </div>
          </div>
        </div>

        {/* 设备类型信息 */}
        {template.deviceTypes && template.deviceTypes.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div>
              <div className="text-sm text-gray-600 mb-1">支持设备类型</div>
              <div className="flex flex-wrap gap-2">
                {template.deviceTypes.map((type: string) => (
                  <span
                    key={type}
                    className="px-2 py-1 bg-blue-50 text-blue-700 text-sm rounded"
                  >
                    {type}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-2 mt-4">
          {onCopy && (
            <button
              onClick={() => onCopy(Number(template.id))}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              复制模板
            </button>
          )}
          {onExport && (
            <button
              onClick={() => onExport(Number(template.id))}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
            >
              导出模板
            </button>
          )}
          {!template.isBuiltIn && onEdit && (
            <button
              onClick={() => onEdit(Number(template.id))}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            >
              编辑模板
            </button>
          )}
        </div>
      </div>

      {/* 检查项列表 */}
      <div className="p-6">
        <h3 className="text-lg font-semibold mb-4">检查项列表</h3>
        {sortedCategories.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            该模板没有配置检查项
          </div>
        ) : (
          <div className="space-y-4">
            {sortedCategories.map((category) => (
              <CheckItemGroup
                key={category}
                category={category}
                items={groupedItems[category]}
                defaultExpanded={true}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
