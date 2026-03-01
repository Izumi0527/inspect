'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { usersApi } from '../../api/users.api'
import type { Permission, User } from '../../types/users.types'

interface Props {
  open: boolean
  user: User | null
  onOpenChange: (open: boolean) => void
}

const groupByModule = (permissions: Permission[]) => {
  const map = new Map<string, Permission[]>()
  permissions.forEach((p) => {
    const key = p.module || '其他'
    const next = map.get(key) || []
    next.push(p)
    map.set(key, next)
  })
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
}

export function UserPermissionsDialog({ open, user, onOpenChange }: Props) {
  const userId = user?.id || ''

  const {
    data: permissions,
    isLoading,
    error,
  } = useQuery<Permission[]>({
    queryKey: ['userPermissions', userId],
    queryFn: () => usersApi.getUserPermissions(userId),
    enabled: open && !!userId,
    staleTime: 1000 * 60 * 5,
  })

  const grouped = useMemo(() => groupByModule(permissions || []), [permissions])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>用户权限</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            {user ? (
              <>
                用户：<span className="font-medium text-foreground">{user.username}</span>
                <span className="mx-2">·</span>
                角色：<span className="font-medium text-foreground">{user.role}</span>
              </>
            ) : (
              '请选择用户'
            )}
          </div>

          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400">
              {(error as Error).message || '获取权限失败'}
            </div>
          )}

          {!isLoading && !error && (
            <div className="space-y-4">
              {grouped.length === 0 && (
                <div className="text-sm text-muted-foreground">暂无权限数据</div>
              )}

              {grouped.map(([module, items]) => (
                <div key={module} className="border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-medium text-foreground">{module}</div>
                    <Badge variant="secondary">{items.length}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {items.map((p) => (
                      <Badge key={p.id} variant="outline" title={p.name}>
                        {p.displayName || p.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

