/**
 * 模板卡片组件
 * 显示单个巡检模板的摘要信息
 */

import type { InspectionTemplate } from '../types'

interface TemplateCardProps {
  template: InspectionTemplate
  isSelected?: boolean
  onSelect?: (id: string) => void
  onCopy?: (id: string) => void
  onDelete?: (id: string) => void
  onExport?: (id: string) => void
  isLoading?: boolean
}

export function TemplateCard({
  template,
  isSelected = false,
  onSelect,
  onCopy,
  onDelete,
  onExport,
  isLoading = false,
}: TemplateCardProps) {
  const handleCardClick = () => {
    if (onSelect && !isLoading) {
      onSelect(template.id)
    }
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onCopy && !isLoading) {
      onCopy(template.id)
    }
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onDelete && !isLoading) {
      onDelete(template.id)
    }
  }

  const handleExport = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onExport && !isLoading) {
      onExport(template.id)
    }
  }

  return (
    <div
      className={`border rounded-lg p-4 transition-all ${
        isSelected
          ? 'bg-blue-50 border-blue-500 shadow-md'
          : 'bg-white hover:bg-gray-50 hover:shadow-sm'
      } ${onSelect ? 'cursor-pointer' : ''} ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
      onClick={handleCardClick}
    >
      <div className="flex justify-between items-start gap-4">
        {/* 模板信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-lg truncate">{template.name}</h3>
            {template.isBuiltIn && (
              <span className="flex-shrink-0 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                内置
              </span>
            )}
            {!template.isActive && (
              <span className="flex-shrink-0 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                已禁用
              </span>
            )}
          </div>

          {template.description && (
            <p className="text-sm text-gray-600 mb-2 line-clamp-2">{template.description}</p>
          )}

          <div className="flex flex-wrap gap-2 text-xs text-gray-500">
            {template.deviceTypes && template.deviceTypes.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="font-medium">设备类型:</span>
                <span>{template.deviceTypes.join(', ')}</span>
              </span>
            )}
            <span className="flex items-center gap-1">
              <span className="font-medium">检查项:</span>
              <span>{template.checkItems?.length || 0}</span>
            </span>
            {template.category && (
              <span className="flex items-center gap-1">
                <span className="font-medium">分类:</span>
                <span>{template.category}</span>
              </span>
            )}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex flex-col gap-2">
          {onCopy && (
            <button
              onClick={handleCopy}
              disabled={isLoading}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              title="复制模板"
            >
              复制
            </button>
          )}
          {onExport && (
            <button
              onClick={handleExport}
              disabled={isLoading}
              className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              title="导出模板"
            >
              导出
            </button>
          )}
          {!template.isBuiltIn && onDelete && (
            <button
              onClick={handleDelete}
              disabled={isLoading}
              className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              title="删除模板"
            >
              删除
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
