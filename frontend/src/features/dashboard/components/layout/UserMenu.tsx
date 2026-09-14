'use client'

import { LogOut, Settings } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/atoms/dropdown-menu'
import { Button } from '@/components/atoms/button'
import { useAuth } from '@/lib/contexts/auth-context'
import { cn } from '@/utils/cn'

interface UserMenuProps {
  /** 额外的CSS类名 */
  className?: string
}

/**
 * 用户菜单组件
 * 显示用户头像/图标，点击展开包含退出登录等操作的下拉菜单
 */
export function UserMenu({ className }: UserMenuProps) {
  const { user, logout } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()

  // 处理退出登录
  const handleLogout = async () => {
    await logout()
    queryClient.clear()
  }

  // 处理跳转到系统设置
  const handleSettings = () => {
    router.push('/settings')
  }

  // 获取用户显示名称
  const displayName = user?.full_name || user?.username || '用户'

  // 获取用户头像首字母
  const avatarInitial = displayName.charAt(0).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label={`${displayName} 菜单`}
          title={`${displayName} 菜单`}
          className={cn(
            'relative h-9 w-9 rounded-full p-0 hover:bg-gray-100 dark:hover:bg-gray-800',
            className
          )}
        >
          {user?.avatar ? (
            // 如果有头像，显示头像图片
            <img
              src={user.avatar}
              alt={displayName}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            // 否则显示首字母头像
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 text-white text-sm font-medium">
              {avatarInitial}
            </div>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/* 用户信息区域 */}
        <div className="px-3 py-2">
          <p className="text-sm font-medium text-foreground">
            {displayName}
          </p>
          {user?.email && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {user.email}
            </p>
          )}
        </div>

        <DropdownMenuSeparator />

        {/* 系统设置 */}
        <DropdownMenuItem onClick={handleSettings} className="cursor-pointer">
          <Settings className="mr-2 h-4 w-4" />
          <span>系统设置</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* 退出登录 */}
        <DropdownMenuItem
          onClick={handleLogout}
          className="cursor-pointer text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/20"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>退出登录</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
