'use client'

import { Button } from '@/components/ui/button'
import { Save, RotateCcw, Download, Upload } from 'lucide-react'
import { useRef } from 'react'

interface ExtraAction {
  label: string
  onClick: () => void
  variant?: 'default' | 'outline' | 'destructive' | 'secondary' | 'ghost' | 'link'
  icon?: React.ReactNode
}

interface ActionButtonsProps {
  isDirty?: boolean
  isSaving?: boolean
  onSave?: () => void
  onReset?: () => void
  onExport?: () => void
  onImport?: (file: File) => void
  extraActions?: ExtraAction[]
}

export function ActionButtons({
  isDirty = false,
  isSaving = false,
  onSave,
  onReset,
  onExport,
  onImport,
  extraActions = [],
}: ActionButtonsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && onImport) {
      onImport(file)
      // 重置 input 以允许再次选择同一文件
      e.target.value = ''
    }
  }

  return (
    <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center space-x-2">
        {isDirty && (
          <span className="text-sm text-orange-600 dark:text-orange-400 font-medium">
            • 有未保存的更改
          </span>
        )}
      </div>

      <div className="flex items-center space-x-3">
        {/* 额外操作按钮 */}
        {extraActions.map((action, index) => (
          <Button
            key={index}
            variant={action.variant || 'outline'}
            onClick={action.onClick}
          >
            {action.icon}
            {action.label}
          </Button>
        ))}

        {/* 导出按钮 */}
        {onExport && (
          <Button variant="outline" onClick={onExport}>
            <Download className="w-4 h-4 mr-2" />
            导出配置
          </Button>
        )}

        {/* 导入按钮 */}
        {onImport && (
          <>
            <Button variant="outline" onClick={handleImportClick}>
              <Upload className="w-4 h-4 mr-2" />
              导入配置
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileChange}
            />
          </>
        )}

        {/* 重置按钮 */}
        {onReset && (
          <Button
            variant="outline"
            onClick={onReset}
            disabled={!isDirty || isSaving}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            重置
          </Button>
        )}

        {/* 保存按钮 */}
        {onSave && (
          <Button
            onClick={onSave}
            disabled={!isDirty || isSaving}
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? '保存中...' : '保存'}
          </Button>
        )}
      </div>
    </div>
  )
}
