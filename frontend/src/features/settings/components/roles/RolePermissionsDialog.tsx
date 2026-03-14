'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { rolesApi } from '../../api/roles.api'
import type { Permission, Role } from '../../types/users.types'
import { toast } from 'react-hot-toast'

interface Props {
  open: boolean
  role: Role | null
  canEdit?: boolean
  onOpenChange: (open: boolean) => void
}

const groupByModule = (permissions: Permission[]) => {
  const map = new Map<string, Permission[]>()
  permissions.forEach((p) => {
    const key = p.module || '其他'
    const list = map.get(key) || []
    list.push(p)
    map.set(key, list)
  })
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
}

export function RolePermissionsDialog({ open, role, canEdit = true, onOpenChange }: Props) {
  const queryClient = useQueryClient()

  const roleId = role?.id || ''
  const roleName = role?.displayName || role?.name || ''

  const [keyword, setKeyword] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const {
    data: permissions,
    isLoading,
    error,
  } = useQuery<Permission[]>({
    queryKey: ['settingsPermissions'],
    queryFn: rolesApi.listPermissions,
    enabled: open,
    staleTime: 1000 * 60 * 30,
  })

  useEffect(() => {
    if (!open || !role) return
    const ids =
      role.permissionIds?.length
        ? role.permissionIds
        : (role.permissions || []).map((p) => p.id).filter(Boolean)
    setSelected(new Set(ids))
    setKeyword('')
  }, [open, role])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return permissions || []
    return (permissions || []).filter((p) => {
      return (
        p.name.toLowerCase().includes(kw) ||
        (p.displayName || '').toLowerCase().includes(kw) ||
        (p.module || '').toLowerCase().includes(kw) ||
        (p.action || '').toLowerCase().includes(kw) ||
        (p.resource || '').toLowerCase().includes(kw)
      )
    })
  }, [permissions, keyword])

  const grouped = useMemo(() => groupByModule(filtered), [filtered])

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!roleId) throw new Error('角色信息缺失')
      await rolesApi.assignRolePermissions(roleId, Array.from(selected))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settingsRoles'] })
    },
  })

  const toggle = (permId: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(permId)
      else next.delete(permId)
      return next
    })
  }

  const handleSave = async () => {
    try {
      await assignMutation.mutateAsync()
      toast.success('权限已更新')
      onOpenChange(false)
    } catch (err) {
      toast.error('保存失败：' + (err as Error).message)
    }
  }

  const selectedCount = selected.size
  const totalCount = permissions?.length || 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>角色权限 - {roleName || '未选择角色'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              已选择 <span className="font-medium text-foreground">{selectedCount}</span> 项 / 共{' '}
              <span className="font-medium text-foreground">{totalCount}</span> 项
            </div>
            <div className="w-full max-w-sm">
              <Input placeholder="搜索权限（名称/模块/动作）" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            </div>
          </div>

          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400">
              {(error as Error).message || '获取权限列表失败'}
            </div>
          )}

          {!isLoading && !error && (
            <div className="max-h-[60vh] overflow-auto space-y-4 pr-2">
              {grouped.length === 0 && <div className="text-sm text-muted-foreground">暂无匹配的权限</div>}

              {grouped.map(([module, items]) => (
                <div key={module} className="border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-medium text-foreground">{module}</div>
                    <Badge variant="secondary">{items.length}</Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {items.map((p) => {
                      const checked = selected.has(p.id)
                      const title = p.displayName || p.name
                      const subtitle = `${p.name} · ${p.action} · ${p.resource}`
                      return (
                        <label
                          key={p.id}
                          className={`flex items-start gap-3 rounded-lg border border-border/60 px-3 py-2 hover:bg-muted/30 ${
                            !canEdit ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                          }`}
                          title={subtitle}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={!canEdit || assignMutation.isPending}
                            onCheckedChange={(v) => toggle(p.id, Boolean(v))}
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">{title}</div>
                            <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={assignMutation.isPending}>
            关闭
          </Button>
          {canEdit && (
            <Button onClick={handleSave} disabled={assignMutation.isPending || !roleId}>
              {assignMutation.isPending ? '保存中...' : '保存'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

