'use client'

import React, { useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export type SettingsConfirmTone = 'default' | 'danger'

export interface SettingsConfirmDialogProps {
  open: boolean
  tone?: SettingsConfirmTone
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  confirmLoading?: boolean
  confirmDisabled?: boolean
  cancelDisabled?: boolean
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
}

export const SettingsConfirmDialog: React.FC<SettingsConfirmDialogProps> = ({
  open,
  tone = 'default',
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  confirmLoading = false,
  confirmDisabled = false,
  cancelDisabled = false,
  onConfirm,
  onOpenChange,
}) => {
  const handleConfirm = useCallback(() => {
    onConfirm()
  }, [onConfirm])

  const confirmVariant = tone === 'danger' ? 'destructive' : 'default'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="settings-confirm-dialog"
        hideDescription={!description}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription className="whitespace-pre-line">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={cancelDisabled || confirmLoading}
            onClick={() => onOpenChange(false)}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            loading={confirmLoading}
            disabled={confirmDisabled || confirmLoading}
            onClick={handleConfirm}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
