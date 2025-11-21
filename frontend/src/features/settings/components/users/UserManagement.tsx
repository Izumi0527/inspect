'use client'

import { useState, useCallback } from 'react'
import { useUserManagement } from '../../hooks/useUserManagement'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Users,
  UserPlus,
  Search,
  Trash2,
  Lock,
  Unlock,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import type { User, UserRole, UserStatus } from '../../types/users.types'

// 角色映射
const roleLabels: Record<UserRole, string> = {
  admin: '管理员',
  operator: '操作员',
  viewer: '查看者',
}

// 状态Badge
function StatusBadge({ status }: { status: UserStatus }) {
  const config = {
    active: { className: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300', label: '正常' },
    inactive: { className: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300', label: '停用' },
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
  const {
    users,
    totalCount,
    page,
    pageSize,
    stats,
    isLoading,
    isDeleting,
    updateQueryParams,
    deleteUser,
    activateUser,
    deactivateUser,
    lockUser,
    unlockUser,
  } = useUserManagement()

  const [keyword, setKeyword] = useState('')

  // 处理搜索
  const handleSearch = useCallback(() => {
    updateQueryParams({ keyword, page: 1 })
  }, [keyword, updateQueryParams])

  // 处理删除
  const handleDelete = async (user: User) => {
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
    try {
      await activateUser(user.id)
      toast.success('用户已激活')
    } catch (err) {
      toast.error('激活失败：' + (err as Error).message)
    }
  }

  // 处理停用
  const handleDeactivate = async (user: User) => {
    try {
      await deactivateUser(user.id)
      toast.success('用户已停用')
    } catch (err) {
      toast.error('停用失败：' + (err as Error).message)
    }
  }

  // 处理锁定
  const handleLock = async (user: User) => {
    try {
      await lockUser(user.id)
      toast.success('用户已锁定')
    } catch (err) {
      toast.error('锁定失败：' + (err as Error).message)
    }
  }

  // 处理解锁
  const handleUnlock = async (user: User) => {
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
      <div className="p-6 space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">总用户数</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.totalUsers}</p>
              </div>
              <Users className="w-8 h-8 text-blue-600" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">正常用户</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.activeUsers}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">停用用户</p>
                <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">{stats.inactiveUsers}</p>
              </div>
              <XCircle className="w-8 h-8 text-gray-600" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">锁定用户</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.lockedUsers}</p>
              </div>
              <Lock className="w-8 h-8 text-red-600" />
            </div>
          </Card>
        </div>
      )}

      {/* 操作栏 */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
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
          <Button>
            <UserPlus className="w-4 h-4 mr-2" />
            添加用户
          </Button>
        </div>
      </Card>

      {/* 用户列表 */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">用户名</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">邮箱</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">姓名</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">角色</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">状态</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">最后登录</th>
                <th className="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-3 font-medium">{user.username}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{user.email}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{user.fullName}</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{roleLabels[user.role]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={user.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">
                    {formatDate(user.lastLoginAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {user.status === 'locked' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUnlock(user)}
                          title="解锁用户"
                        >
                          <Unlock className="w-4 h-4" />
                        </Button>
                      )}
                      {user.status !== 'locked' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleLock(user)}
                          title="锁定用户"
                        >
                          <Lock className="w-4 h-4" />
                        </Button>
                      )}
                      {user.status === 'inactive' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleActivate(user)}
                          title="激活用户"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                      )}
                      {user.status === 'active' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeactivate(user)}
                          title="停用用户"
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(user)}
                        disabled={isDeleting}
                        title="删除用户"
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

        {/* 分页 */}
        {totalCount > pageSize && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
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
