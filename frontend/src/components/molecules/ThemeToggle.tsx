'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor, Check } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/atoms/dropdown-menu'

const triggerClassName =
  'relative inline-flex h-9 w-9 items-center justify-center rounded-xl text-sm font-medium ' +
  'transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none ' +
  'disabled:opacity-50 hover:bg-accent/12 hover:text-accent-foreground hover:scale-105'

/**
 * 主题切换组件
 *
 * 提供浅色、暗色、跟随系统三个主题选项
 * 使用下拉菜单交互，支持丝滑动画过渡
 */
export function ThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme, systemTheme } = useTheme()

  // 避免 SSR 水合不匹配
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <button type="button" className={triggerClassName} disabled>
        <Sun className="h-[1.2rem] w-[1.2rem]" />
        <span className="sr-only">主题</span>
      </button>
    )
  }

  // 获取当前实际显示的主题
  const currentTheme = theme === 'system' ? systemTheme : theme

  // 根据当前主题选择图标
  const ThemeIcon = currentTheme === 'dark' ? Moon : Sun

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={triggerClassName} title="主题">
          <ThemeIcon className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:rotate-90 dark:scale-0" />
          <ThemeIcon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">主题</span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-56 border-border/60 bg-card/96 shadow-lg backdrop-blur-xl"
        sideOffset={8}
      >
        <DropdownMenuItem
          onClick={() => setTheme('light')}
          className="cursor-pointer transition-all duration-150 hover:bg-accent/12"
        >
          <Sun className="mr-2 h-4 w-4" />
          <span className="flex-1">浅色主题</span>
          {theme === 'light' && (
            <Check className="h-4 w-4 text-primary animate-in fade-in-0 zoom-in-95" />
          )}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setTheme('dark')}
          className="cursor-pointer transition-all duration-150 hover:bg-accent/12"
        >
          <Moon className="mr-2 h-4 w-4" />
          <span className="flex-1">暗色主题</span>
          {theme === 'dark' && (
            <Check className="h-4 w-4 text-primary animate-in fade-in-0 zoom-in-95" />
          )}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setTheme('system')}
          className="cursor-pointer transition-all duration-150 hover:bg-accent/12"
        >
          <Monitor className="mr-2 h-4 w-4" />
          <span className="flex-1">跟随系统</span>
          {theme === 'system' && (
            <Check className="h-4 w-4 text-primary animate-in fade-in-0 zoom-in-95" />
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
