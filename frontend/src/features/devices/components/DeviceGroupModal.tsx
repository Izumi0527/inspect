'use client'

import React from 'react'
import { FolderPlus, FolderTree, RefreshCw } from 'lucide-react'
import { Button } from '@/components/atoms'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDeviceGroupModal } from '../hooks/useDeviceGroupModal'
import { DeviceGroupFormPanel } from './DeviceGroupFormPanel'
import { DeviceGroupTreeList } from './DeviceGroupTreeList'

export interface DeviceGroupModalProps {
  isOpen: boolean
  onClose: () => void
  canCreate?: boolean
  canUpdate?: boolean
  canDelete?: boolean
  onMutated?: () => void
}

export const DeviceGroupModal: React.FC<DeviceGroupModalProps> = ({
  isOpen,
  onClose,
  canCreate = true,
  canUpdate = true,
  canDelete = true,
  onMutated,
}) => {
  const state = useDeviceGroupModal(isOpen, onMutated)
  const deletingChildCount = state.deletingGroup
    ? state.childCountMap.get(state.deletingGroup.id) ?? 0
    : 0

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-primary" />
            设备分组管理
          </DialogTitle>
          <DialogDescription>
            支持最多 3 级树形分组，删除非空分组时可安全将设备移至未分组。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              共 {state.groups.length} 个分组
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void state.refetch()}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                刷新
              </Button>
              {canCreate && (
                <Button type="button" size="sm" onClick={state.openCreateForm}>
                  <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
                  新建分组
                </Button>
              )}
            </div>
          </div>

          {state.formMode && (
            <DeviceGroupFormPanel
              mode={state.formMode}
              values={state.formValues}
              parentOptions={state.parentOptions}
              submitting={state.submitting}
              errorMessage={state.formError}
              onChange={state.setFormValues}
              onSubmit={state.handleFormSubmit}
              onCancel={state.closeForm}
            />
          )}

          {state.deletingGroup && (
            <div
              role="alertdialog"
              aria-label="非空分组删除确认"
              className="space-y-3 rounded-lg border border-danger/40 bg-danger-soft p-4"
            >
              <p className="text-sm font-medium text-danger-soft-foreground">
                分组「{state.deletingGroup.name}」当前包含 {state.deletingGroup.device_count} 台设备
                {deletingChildCount > 0 ? `及 ${deletingChildCount} 个子分组` : ''}
                ，请选择处理方式：
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={state.deleting}
                  onClick={() => state.setDeletingGroup(null)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  loading={state.deleting}
                  onClick={() => void state.handleConfirmUnassignDelete()}
                >
                  将设备移至未分组并删除
                </Button>
              </div>
            </div>
          )}

          <DeviceGroupTreeList
            nodes={state.flatNodes}
            isLoading={state.isLoading}
            isError={state.isError}
            errorMessage={state.errorMessage}
            canUpdate={canUpdate}
            canDelete={canDelete}
            deleting={state.deleting}
            onEdit={state.openEditForm}
            onDelete={(group) => void state.handleRequestDelete(group)}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
