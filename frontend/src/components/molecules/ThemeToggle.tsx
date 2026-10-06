'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor, Check, Gauge, GlassWater } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/atoms/dropdown-menu'
import { useSkin, type Skin } from '@/lib/contexts/skin-context'

const triggerClassName =
  'relative inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium ' +
  'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none ' +
  'disabled:opacity-50 hover:bg-surface-3'

const itemClassName =
  'cursor-pointer transition-colors duration-150 hover:bg-surface-3 focus:bg-surface-3'

const SKIN_OPTIONS: { value: Skin; label: string; icon: LucideIcon }[] = [
  { value: 'classic', label: '经典主题', icon: GlassWater },
  { value: 'instrument', label: '精密仪器风格主题', icon: Gauge },
]

/**
 * 外观切换组件
 *
 * 两组正交设置：
 * - 明暗轴：浅色 / 暗色 / 跟随系统（next-themes，写 html.dark）
 * - 皮肤轴：经典主题（玻璃拟态）/ 精密仪器风格主题（skin-context，写 html data-skin）
 */
export function ThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme, systemTheme } = useTheme()
  const { skin, setSkin } = useSkin()

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
        <button
          type="button"
          className={triggerClassName}
          data-slot="theme-toggle"
          title="主题"
        >
          <ThemeIcon className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:rotate-90 dark:scale-0" />
          <ThemeIcon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">主题</span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-56 border-border bg-popover shadow-overlay backdrop-blur-none"
        sideOffset={8}
      >
        <DropdownMenuItem onClick={() => setTheme('light')} className={itemClassName}>
          <Sun className="mr-2 h-4 w-4" />
          <span className="flex-1">浅色主题</span>
          {theme === 'light' && (
            <Check className="h-4 w-4 text-primary animate-in fade-in-0 zoom-in-95" />
          )}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => setTheme('dark')} className={itemClassName}>
          <Moon className="mr-2 h-4 w-4" />
          <span className="flex-1">暗色主题</span>
          {theme === 'dark' && (
            <Check className="h-4 w-4 text-primary animate-in fade-in-0 zoom-in-95" />
          )}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => setTheme('system')} className={itemClassName}>
          <Monitor className="mr-2 h-4 w-4" />
          <span className="flex-1">跟随系统</span>
          {theme === 'system' && (
            <Check className="h-4 w-4 text-primary animate-in fade-in-0 zoom-in-95" />
          )}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
          界面风格
        </DropdownMenuLabel>

        {SKIN_OPTIONS.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem key={value} onClick={() => setSkin(value)} className={itemClassName}>
            <Icon className="mr-2 h-4 w-4" />
            <span className="flex-1">{label}</span>
            {skin === value && (
              <Check className="h-4 w-4 text-primary animate-in fade-in-0 zoom-in-95" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
