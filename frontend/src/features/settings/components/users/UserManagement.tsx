'use client'

import { useMemo, useState, useCallback } from 'react'
import { useUserManagement } from '../../hooks/useUserManagement'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { CompactStatCard } from '@/components/shared'
import {
  Users,
  UserPlus,
  Search,
  Trash2,
  Lock,
  Unlock,
  CheckCircle,
  XCircle,
  Pencil,
  KeyRound,
  Shield,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import type { BuiltInUserRole, User, UserStatus } from '../../types/users.types'
import type { Role } from '../../types/users.types'
import { UserFormDialog } from './UserFormDialog'
import { UserPasswordDialog } from './UserPasswordDialog'
import { UserPermissionsDialog } from './UserPermissionsDialog'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'
import { EmptyState } from '../shared/EmptyState'

// 内置角色映射（后端支持自定义角色，这里仅作为兜底）
const builtInRoleLabels: Record<BuiltInUserRole, string> = {
  admin: '管理员',
  operator: '操作员',
  viewer: '查看者',
}

// 状态Badge
function StatusBadge({ status }: { status: UserStatus }) {
  const config = {
    active: { className: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300', label: '正常' },
    inactive: { className: 'bg-muted/60 dark:bg-muted/80 text-foreground/90', label: '停用' },
    locked: { className: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300', label: '锁定' },
  }
  const { className, label } = config[status]
  return <Badge className={className}>{label}</Badge>
}

// 格式化日期
function formatDate(isoString: string | null): string {
  if (!isoString) return '从未登录'
  return new Date(isoString).toLocaleString('zh-CN')
}

export function UserManagement() {
  const canRead = usePermission(Permission.USERS_READ)
  const canCreate = usePermission(Permission.USERS_CREATE)
  const canUpdate = usePermission(Permission.USERS_UPDATE)
  const canDelete = usePermission(Permission.USERS_DELETE)

  const {
    users,
    totalCount,
    page,
    pageSize,
    stats,
    roles,
    isLoading,
    isRolesLoading,
    isDeleting,
    isCreating,
    isUpdating,
    isChangingPassword,
    updateQueryParams,
    deleteUser,
    createUser,
    updateUser,
    changePassword,
    activateUser,
    deactivateUser,
    lockUser,
    unlockUser,
    error,
    rolesError,
  } = useUserManagement()

  const [keyword, setKeyword] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [passwordUser, setPasswordUser] = useState<User | null>(null)
  const [permissionsUser, setPermissionsUser] = useState<User | null>(null)

  const effectiveRoles: Role[] = roles.length
    ? roles
    : [
        { id: 'admin', name: 'admin', displayName: '管理员', description: '系统管理员', permissions: [], userCount: 0 },
        { id: 'operator', name: 'operator', displayName: '操作员', description: '普通操作员', permissions: [], userCount: 0 },
        { id: 'viewer', name: 'viewer', displayName: '只读用户', description: '只读权限', permissions: [], userCount: 0 },
      ]

  const roleLabelByName = useMemo(() => {
    const map = new Map<string, string>()
    effectiveRoles.forEach((r) => {
      const key = String(r.name || '').trim()
      if (!key) return
      map.set(key, r.displayName || key)
    })
    // 内置角色兜底
    Object.entries(builtInRoleLabels).forEach(([k, v]) => {
      if (!map.has(k)) map.set(k, v)
    })
    return map
  }, [effectiveRoles])

  // 处理搜索
  const handleSearch = useCallback(() => {
    updateQueryParams({ keyword, page: 1 })
  }, [keyword, updateQueryParams])

  // 处理删除
  const handleDelete = async (user: User) => {
    if (!canDelete) {
      toast.error('需要 users:delete 权限')
      return
    }
    if (!window.confirm(`确定要删除用户 "${user.username}" 吗？\n\n此操作不可撤销。`)) {
      return
    }

    try {
      await deleteUser(user.id)
      toast.success('用户已删除')
    } catch (err) {
      toast.error('删除失败：' + (err as Error).message)
    }
  }

  // 处理激活
  const handleActivate = async (user: User) => {
    if (!canUpdate) {
      toast.error('需要 users:update 权限')
      return
    }
    try {
      await activateUser(user.id)
      toast.success('用户已激活')
    } catch (err) {
      toast.error('激活失败：' + (err as Error).message)
    }
  }

  // 处理停用
  const handleDeactivate = async (user: User) => {
    if (!canUpdate) {
      toast.error('需要 users:update 权限')
      return
    }
    try {
      await deactivateUser(user.id)
      toast.success('用户已停用')
    } catch (err) {
      toast.error('停用失败：' + (err as Error).message)
    }
  }

  // 处理锁定
  const handleLock = async (user: User) => {
    if (!canUpdate) {
      toast.error('需要 users:update 权限')
      return
    }
    try {
      await lockUser(user.id)
      toast.success('用户已锁定')
    } catch (err) {
      toast.error('锁定失败：' + (err as Error).message)
    }
  }

  // 处理解锁
  const handleUnlock = async (user: User) => {
    if (!canUpdate) {
      toast.error('需要 users:update 权限')
      return
    }
    try {
      await unlockUser(user.id)
      toast.success('用户已解锁')
    } catch (err) {
      toast.error('解锁失败：' + (err as Error).message)
    }
  }

  // 加载状态
  if (isLoading && !users.length) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  // 错误状态
  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 flex items-start space-x-4">
          <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">
              加载用户列表失败
            </h3>
            <p className="text-sm text-red-700 dark:text-red-300">
              {(error as Error).message || '无法连接到服务器，请稍后重试'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!canRead) {
    return (
      <div className="p-4">
        <EmptyState
          title="无权限查看用户管理"
          description="需要 users:read 权限，请联系管理员开通。"
          icon={Users}
        />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 flex-1 flex flex-col min-h-0">
      <UserFormDialog
        open={createOpen}
        mode="create"
        roles={effectiveRoles}
        isSubmitting={isCreating || isRolesLoading}
        onOpenChange={setCreateOpen}
        onCreate={async (data) => {
          if (!canCreate) {
            toast.error('需要 users:create 权限')
            return
          }
          await createUser(data)
          toast.success('用户创建成功')
        }}
        onUpdate={async () => {}}
      />

      <UserFormDialog
        open={!!editUser}
        mode="edit"
        roles={effectiveRoles}
        user={editUser}
        isSubmitting={isUpdating || isRolesLoading}
        onOpenChange={(open) => {
          if (!open) setEditUser(null)
        }}
        onCreate={async () => {}}
        onUpdate={async (userId, data) => {
          if (!canUpdate) {
            toast.error('需要 users:update 权限')
            return
          }
          await updateUser(userId, data)
          toast.success('用户已更新')
        }}
      />

      <UserPasswordDialog
        open={!!passwordUser}
        user={passwordUser}
        isSubmitting={isChangingPassword}
        onOpenChange={(open) => {
          if (!open) setPasswordUser(null)
        }}
        onSubmit={async (userId, newPassword) => {
          if (!canUpdate) {
            toast.error('需要 users:update 权限')
            return
          }
          await changePassword(userId, newPassword)
          toast.success('密码已重置')
        }}
      />

      <UserPermissionsDialog
        open={!!permissionsUser}
        user={permissionsUser}
        onOpenChange={(open) => {
          if (!open) setPermissionsUser(null)
        }}
      />

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <CompactStatCard
            title="总用户数"
            value={stats.totalUsers}
            icon={Users}
            iconClassName="text-blue-600 dark:text-blue-400"
          />
          <CompactStatCard
            title="正常用户"
            value={stats.activeUsers}
            icon={CheckCircle}
            iconClassName="text-green-600 dark:text-green-400"
            valueClassName="text-green-600 dark:text-green-400"
          />
          <CompactStatCard
            title="停用用户"
            value={stats.inactiveUsers}
            icon={XCircle}
            iconClassName="text-muted-foreground"
            valueClassName="text-muted-foreground"
          />
          <CompactStatCard
            title="锁定用户"
            value={stats.lockedUsers}
            icon={Lock}
            iconClassName="text-red-600 dark:text-red-400"
            valueClassName="text-red-600 dark:text-red-400"
          />
        </div>
      )}

      {/* 操作栏 */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground/80" />
              <Input
                placeholder="搜索用户名、邮箱..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearch} variant="outline">
              搜索
            </Button>
          </div>
          <Button onClick={() => setCreateOpen(true)} disabled={!canCreate || isRolesLoading}>
            <UserPlus className="w-4 h-4 mr-2" />
            添加用户
          </Button>
        </div>
        {!canCreate && <div className="mt-2 text-xs text-muted-foreground">创建用户需要 users:create 权限</div>}
        {rolesError && (
          <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            {(rolesError as Error).message || '角色列表加载失败，已使用默认角色列表'}
          </div>
        )}
      </Card>

      {/* 用户列表 */}
      <Card className="flex-1 flex flex-col min-h-0">
        {users.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <EmptyState title="暂无用户" description="当前筛选条件下没有匹配的用户记录。" icon={Users} />
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium text-foreground/90">用户名</th>
                  <th className="px-4 py-3 text-left font-medium text-foreground/90">邮箱</th>
                  <th className="px-4 py-3 text-left font-medium text-foreground/90">姓名</th>
                  <th className="px-4 py-3 text-left font-medium text-foreground/90">角色</th>
                  <th className="px-4 py-3 text-left font-medium text-foreground/90">状态</th>
                  <th className="px-4 py-3 text-left font-medium text-foreground/90">最后登录</th>
                  <th className="px-4 py-3 text-right font-medium text-foreground/90">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/60">
                    <td className="px-4 py-3 font-medium">{user.username}</td>
                    <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{user.fullName}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">{roleLabelByName.get(user.role) || user.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={user.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {formatDate(user.lastLoginAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPermissionsUser(user)}
                          title="查看权限"
                        >
                          <Shield className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPasswordUser(user)}
                          disabled={!canUpdate}
                          title={canUpdate ? '重置密码' : '需要 users:update 权限'}
                        >
                          <KeyRound className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditUser(user)}
                          disabled={!canUpdate}
                          title={canUpdate ? '编辑用户' : '需要 users:update 权限'}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {user.status === 'locked' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnlock(user)}
                            disabled={!canUpdate}
                            title={canUpdate ? '解锁用户' : '需要 users:update 权限'}
                          >
                            <Unlock className="w-4 h-4" />
                          </Button>
                        )}
                        {user.status !== 'locked' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleLock(user)}
                            disabled={!canUpdate}
                            title={canUpdate ? '锁定用户' : '需要 users:update 权限'}
                          >
                            <Lock className="w-4 h-4" />
                          </Button>
                        )}
                        {user.status === 'inactive' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleActivate(user)}
                            disabled={!canUpdate}
                            title={canUpdate ? '激活用户' : '需要 users:update 权限'}
                          >
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                        )}
                        {user.status === 'active' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeactivate(user)}
                            disabled={!canUpdate}
                            title={canUpdate ? '停用用户' : '需要 users:update 权限'}
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(user)}
                          disabled={!canDelete || isDeleting}
                          title={canDelete ? '删除用户' : '需要 users:delete 权限'}
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
        )}

        {/* 分页 */}
        {totalCount > pageSize && (
          <div className="px-4 py-3 border-t border-border flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              共 {totalCount} 条记录，第 {page} 页
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateQueryParams({ page: page - 1 })}
                disabled={page <= 1}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateQueryParams({ page: page + 1 })}
                disabled={page * pageSize >= totalCount}
              >
                下一页
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
