'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, TextArea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Role } from '../../types/users.types'

type Mode = 'create' | 'edit'

interface Props {
  open: boolean
  mode: Mode
  role?: Role | null
  isSubmitting?: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (data: { name: string; displayName?: string; description?: string }) => Promise<void>
  onUpdate: (roleId: string, data: { displayName?: string; description?: string }) => Promise<void>
}

const isValidRoleName = (name: string) => /^[a-zA-Z0-9_-]{2,50}$/.test(name)

export function RoleFormDialog({
  open,
  mode,
  role,
  isSubmitting = false,
  onOpenChange,
  onCreate,
  onUpdate,
}: Props) {
  const isEdit = mode === 'edit'

  const title = useMemo(() => (isEdit ? '编辑角色' : '新建角色'), [isEdit])

  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setError(null)
      return
    }

    if (isEdit && role) {
      setName(role.name || '')
      setDisplayName(role.displayName || role.name || '')
      setDescription(role.description || '')
      setError(null)
      return
    }

    setName('')
    setDisplayName('')
    setDescription('')
    setError(null)
  }, [open, isEdit, role])

  const handleSubmit = async () => {
    setError(null)

    try {
      if (!isEdit) {
        const trimmedName = name.trim()
        const trimmedDisplay = displayName.trim()
        const trimmedDesc = description.trim()

        if (!trimmedName) {
          setError('请输入角色标识（name）')
          return
        }
        if (!isValidRoleName(trimmedName)) {
          setError('角色标识仅允许字母/数字/_/-，长度 2-50')
          return
        }

        await onCreate({
          name: trimmedName,
          displayName: trimmedDisplay || trimmedName,
          description: trimmedDesc || undefined,
        })
        onOpenChange(false)
        return
      }

      if (!role?.id) {
        setError('角色信息缺失')
        return
      }

      const trimmedDisplay = displayName.trim()
      const trimmedDesc = description.trim()

      if (!trimmedDisplay) {
        setError('请输入角色显示名称')
        return
      }

      await onUpdate(role.id, {
        displayName: trimmedDisplay,
        description: trimmedDesc || '',
      })
      onOpenChange(false)
    } catch (err) {
      setError((err as Error).message || '提交失败')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="role-name">角色标识（name）</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：admin、operator、report_viewer"
              disabled={isEdit || isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              用于权限计算与鉴权（建议英文小写/下划线），创建后不建议修改。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="role-displayName">显示名称</Label>
            <Input
              id="role-displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例如：管理员、审计员"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role-desc">描述</Label>
            <TextArea
              id="role-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="（可选）描述该角色的用途与边界"
              disabled={isSubmitting}
            />
          </div>

          {error && <div role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</div>}
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? '提交中...' : '提交'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

