'use client'

import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, KeyRound, Pencil, Plus, Shield, Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermission } from '@/lib/contexts/auth-context'
import { ApiClientError } from '@/lib/api-client'
import { Permission } from '@/lib/types/auth.types'
import { rolesApi } from '../../api/roles.api'
import type { Role } from '../../types/users.types'
import { EmptyState } from '../shared/EmptyState'
import { RoleFormDialog } from './RoleFormDialog'
import { RolePermissionsDialog } from './RolePermissionsDialog'

const formatDateTime = (iso?: string) => {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN')
}

export function RoleManagement() {
  const queryClient = useQueryClient()

  const canRead = usePermission(Permission.USERS_READ)
  const canCreate = usePermission(Permission.USERS_CREATE)
  const canUpdate = usePermission(Permission.USERS_UPDATE)
  const canDelete = usePermission(Permission.USERS_DELETE)

  const [keyword, setKeyword] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editRole, setEditRole] = useState<Role | null>(null)
  const [permissionsRole, setPermissionsRole] = useState<Role | null>(null)

  const rolesQuery = useQuery<Role[]>({
    queryKey: ['settingsRoles'],
    queryFn: rolesApi.listRoles,
    enabled: canRead,
    staleTime: 1000 * 60 * 5,
  })

  const createMutation = useMutation({
    mutationFn: rolesApi.createRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settingsRoles'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ roleId, data }: { roleId: string; data: { displayName?: string; description?: string } }) =>
      rolesApi.updateRole(roleId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settingsRoles'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (roleId: string) => rolesApi.deleteRole(roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settingsRoles'] })
    },
  })

  const roles = rolesQuery.data || []

  const filteredRoles = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return roles
    return roles.filter((r) => {
      return (
        r.name.toLowerCase().includes(kw) ||
        (r.displayName || '').toLowerCase().includes(kw) ||
        (r.description || '').toLowerCase().includes(kw)
      )
    })
  }, [roles, keyword])

  const stats = useMemo(() => {
    const builtIn = roles.filter((r) => Boolean(r.isBuiltIn)).length
    return {
      total: roles.length,
      builtIn,
      custom: Math.max(0, roles.length - builtIn),
    }
  }, [roles])

  const handleDelete = useCallback(
    async (role: Role) => {
      if (!canDelete) {
        toast.error('需要 users:delete 权限')
        return
      }
      if (role.isBuiltIn) {
        toast.error('内置角色不允许删除')
        return
      }

      const confirmed = window.confirm(
        `确定要删除角色 "${role.displayName || role.name}" 吗？\n\n注意：删除角色不会自动修改已绑定该角色的用户，请先确认用户角色分配策略。`
      )
      if (!confirmed) return

      try {
        await deleteMutation.mutateAsync(role.id)
        toast.success('角色已删除')
      } catch (err) {
        toast.error('删除失败：' + (err as Error).message)
      }
    },
    [canDelete, deleteMutation]
  )

  const handleCreate = useCallback(
    async (data: { name: string; displayName?: string; description?: string }) => {
      if (!canCreate) {
        toast.error('需要 users:create 权限')
        return
      }
      await createMutation.mutateAsync(data)
      toast.success('角色已创建')
    },
    [canCreate, createMutation]
  )

  const handleUpdate = useCallback(
    async (roleId: string, data: { displayName?: string; description?: string }) => {
      if (!canUpdate) {
        toast.error('需要 users:update 权限')
        return
      }
      await updateMutation.mutateAsync({ roleId, data })
      toast.success('角色已更新')
    },
    [canUpdate, updateMutation]
  )

  if (!canRead) {
    return (
      <div className="p-4">
        <EmptyState title="无权限查看角色" description="需要 users:read 权限，请联系管理员开通。" icon={Shield} />
      </div>
    )
  }

  if (rolesQuery.isLoading && roles.length === 0) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (rolesQuery.error) {
    const err = rolesQuery.error as Error
    const status = rolesQuery.error instanceof ApiClientError ? rolesQuery.error.status : undefined
    const denied = status === 403
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 flex items-start space-x-4">
          <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">
              {denied ? '无权限访问角色管理' : '加载角色列表失败'}
            </h3>
            <p className="text-sm text-red-700 dark:text-red-300">{err.message || '请稍后重试'}</p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={() => rolesQuery.refetch()}>
                重试
              </Button>
              <Button variant="outline" onClick={() => window.history.back()}>
                返回
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 flex-1 flex flex-col min-h-0">
      <RoleFormDialog
        open={createOpen}
        mode="create"
        isSubmitting={createMutation.isPending}
        onOpenChange={setCreateOpen}
        onCreate={handleCreate}
        onUpdate={async () => {}}
      />

      <RoleFormDialog
        open={!!editRole}
        mode="edit"
        role={editRole}
        isSubmitting={updateMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setEditRole(null)
        }}
        onCreate={async () => {}}
        onUpdate={handleUpdate}
      />

      <RolePermissionsDialog
        open={!!permissionsRole}
        role={permissionsRole}
        canEdit={canUpdate}
        onOpenChange={(open) => {
          if (!open) setPermissionsRole(null)
        }}
      />

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">角色总数</p>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            </div>
            <Shield className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">内置角色</p>
              <p className="text-2xl font-bold text-foreground">{stats.builtIn}</p>
            </div>
            <Badge variant="secondary">built-in</Badge>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">自定义角色</p>
              <p className="text-2xl font-bold text-foreground">{stats.custom}</p>
            </div>
            <Badge variant="outline">custom</Badge>
          </div>
        </Card>
      </div>

      {/* 操作栏 */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Input
                placeholder="搜索角色名称/显示名称/描述..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-full"
              />
            </div>
            <Button variant="outline" onClick={() => rolesQuery.refetch()} disabled={rolesQuery.isFetching}>
              刷新
            </Button>
          </div>
          <Button onClick={() => setCreateOpen(true)} disabled={!canCreate}>
            <Plus className="w-4 h-4 mr-2" />
            新建角色
          </Button>
        </div>
        {!canCreate && (
          <div className="mt-2 text-xs text-muted-foreground">创建角色需要 users:create 权限</div>
        )}
      </Card>

      {/* 角色列表 */}
      <Card className="flex-1 flex flex-col min-h-0">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-foreground/90">角色</th>
                <th className="px-4 py-3 text-left font-medium text-foreground/90">描述</th>
                <th className="px-4 py-3 text-left font-medium text-foreground/90">用户数</th>
                <th className="px-4 py-3 text-left font-medium text-foreground/90">权限数</th>
                <th className="px-4 py-3 text-left font-medium text-foreground/90">更新时间</th>
                <th className="px-4 py-3 text-right font-medium text-foreground/90">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredRoles.map((role) => (
                <tr key={role.id} className="hover:bg-muted/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-foreground">{role.displayName || role.name}</div>
                      <Badge variant="outline" title={role.name}>
                        {role.name}
                      </Badge>
                      {role.isBuiltIn && <Badge variant="secondary">内置</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-md truncate" title={role.description || ''}>
                    {role.description || '-'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{role.userCount ?? 0}</td>
                  <td className="px-4 py-3 text-muted-foreground">{role.permissions?.length ?? 0}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {formatDateTime(role.updatedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPermissionsRole(role)}
                        title={canUpdate ? '分配权限' : '查看权限（需要 users:update 才能修改）'}
                      >
                        <KeyRound className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditRole(role)}
                        disabled={!canUpdate}
                        title={canUpdate ? '编辑角色' : '需要 users:update 权限'}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(role)}
                        disabled={!canDelete || role.isBuiltIn || deleteMutation.isPending}
                        title={
                          role.isBuiltIn
                            ? '内置角色不可删除'
                            : canDelete
                              ? '删除角色'
                              : '需要 users:delete 权限'
                        }
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredRoles.length === 0 && (
          <EmptyState title="暂无角色" description="请调整筛选条件，或新建角色。" icon={Shield} />
        )}
      </Card>
    </div>
  )
}

