'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor, Check } from 'lucide-react'
import { useThemeSettings } from '@/lib/contexts/theme-context'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/atoms/dropdown-menu'
import { Button } from '@/components/atoms/button'

/**
 * 主题切换组件
 *
 * 提供浅色、深色、跟随系统三个主题选项
 * 使用下拉菜单交互，支持丝滑动画过渡
 */
export function ThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme, systemTheme } = useTheme()
  const { darkThemeVariant, setDarkThemeVariant } = useThemeSettings()

  // 避免 SSR 水合不匹配
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="relative rounded-xl"
        disabled
      >
        <Sun className="h-[1.2rem] w-[1.2rem]" />
        <span className="sr-only">主题设置</span>
      </Button>
    )
  }

  // 获取当前实际显示的主题
  const currentTheme = theme === 'system' ? systemTheme : theme

  // 根据当前主题选择图标
  const ThemeIcon = currentTheme === 'dark' ? Moon : Sun

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-xl transition-all duration-200 hover:bg-accent/10 hover:scale-105"
          title="主题设置"
        >
          <ThemeIcon className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:rotate-90 dark:scale-0" />
          <ThemeIcon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">主题设置</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-56 bg-card/95 backdrop-blur-xl border-border/50 shadow-lg"
        sideOffset={8}
      >
        <DropdownMenuItem
          onClick={() => setTheme('light')}
          className="cursor-pointer transition-all duration-150 hover:bg-accent/10"
        >
          <Sun className="mr-2 h-4 w-4" />
          <span className="flex-1">浅色主题</span>
          {theme === 'light' && (
            <Check className="h-4 w-4 text-primary animate-in fade-in-0 zoom-in-95" />
          )}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setTheme('dark')}
          className="cursor-pointer transition-all duration-150 hover:bg-accent/10"
        >
          <Moon className="mr-2 h-4 w-4" />
          <span className="flex-1">深色主题</span>
          {theme === 'dark' && (
            <Check className="h-4 w-4 text-primary animate-in fade-in-0 zoom-in-95" />
          )}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setTheme('system')}
          className="cursor-pointer transition-all duration-150 hover:bg-accent/10"
        >
          <Monitor className="mr-2 h-4 w-4" />
          <span className="flex-1">跟随系统</span>
          {theme === 'system' && (
            <Check className="h-4 w-4 text-primary animate-in fade-in-0 zoom-in-95" />
          )}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>深色风格</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={darkThemeVariant}
          onValueChange={(value) => setDarkThemeVariant(value as 'vscode' | 'legacy')}
        >
          <DropdownMenuRadioItem
            value="vscode"
            className="cursor-pointer transition-all duration-150 hover:bg-accent/10"
          >
            VS Code Dark Modern
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value="legacy"
            className="cursor-pointer transition-all duration-150 hover:bg-accent/10"
          >
            经典紫色风格
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
