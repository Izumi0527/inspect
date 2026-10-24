import * as React from 'react'
import { AlertTriangle } from 'lucide-react'
import { SimpleModal } from '@/components/atoms/modal'
import { Button } from '@/components/atoms/button'

export interface BatchDeleteConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  isDeleting?: boolean
  count: number
  isAllFiltered?: boolean
  title?: string
  description?: string
  entityLabel?: string
}

export const BatchDeleteConfirmModal: React.FC<BatchDeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isDeleting = false,
  count,
  isAllFiltered = false,
  title = '批量删除确认',
  description,
  entityLabel = '项记录',
}) => {
  return (
    <SimpleModal
      open={isOpen}
      onClose={onClose}
      size="sm"
      ariaLabel={title}
    >
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full shrink-0">
            <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              {title}
            </h3>
          </div>
        </div>

        <div className="mb-6 space-y-2 text-sm text-muted-foreground">
          <p className="text-foreground font-medium">
            {description ?? (
              isAllFiltered
                ? `您确定要删除当前筛选结果中的全部 ${count} ${entityLabel}吗？`
                : `您确定要批量删除选中的 ${count} ${entityLabel}吗？`
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            此操作将同时删除相关的检测与执行结果，删除后数据无法恢复，请谨慎操作。
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isDeleting}
          >
            取消
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isDeleting ? '删除中...' : '确认删除'}
          </Button>
        </div>
      </div>
    </SimpleModal>
  )
}
