'use client'

/**
 * 皮肤（界面风格）上下文
 *
 * 三套可切换皮肤（与 next-themes 的明暗轴正交）：
 *   classic    经典主题 —— 旧半透明卡片外观（默认）
 *   instrument 精密仪器风格主题 —— 明度阶 + 发丝线 + 状态轨
 *   glass      浅色玻璃拟态 —— 光斑 + 玻璃卡；恒浅色，明暗轴对其无效
 *
 * 皮肤写 <html data-skin>，明暗写 <html class="dark">，互不干扰。
 * 首帧防闪烁由 app/layout.tsx 的内联脚本负责：读取 localStorage 后在绘制前设置属性。
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type Skin = 'classic' | 'instrument' | 'glass'

/** 皮肤清单（首位为默认值）；首帧脚本与主题菜单须与此一致，由 skin-first-paint 测试守卫。 */
export const SKINS = ['classic', 'instrument', 'glass'] as const

export const SKIN_STORAGE_KEY = 'ui-skin'

interface SkinContextValue {
  skin: Skin
  setSkin: (skin: Skin) => void
}

const SkinContext = createContext<SkinContextValue>({
  skin: 'classic',
  setSkin: () => {},
})

function isSkin(value: unknown): value is Skin {
  return typeof value === 'string' && (SKINS as readonly string[]).includes(value)
}

function normalizeSkin(value: string | null | undefined): Skin {
  return isSkin(value) ? value : 'classic'
}

function readStoredSkin(): Skin {
  if (typeof window === 'undefined') return 'classic'
  try {
    const fromDom = document.documentElement.getAttribute('data-skin')
    if (isSkin(fromDom)) return fromDom
    return normalizeSkin(window.localStorage.getItem(SKIN_STORAGE_KEY))
  } catch {
    return 'classic'
  }
}

export function SkinProvider({ children }: { children: React.ReactNode }) {
  // SSR 与首帧一律按 classic 渲染，挂载后再同步真实皮肤，避免水合不一致
  const [skin, setSkinState] = useState<Skin>('classic')

  useEffect(() => {
    const stored = readStoredSkin()
    setSkinState(stored)
    // 与首帧内联脚本保持一致：即便脚本未执行（如内联脚本被策略拦截），这里也补齐属性
    document.documentElement.setAttribute('data-skin', stored)
  }, [])

  // 跨标签页同步
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === SKIN_STORAGE_KEY) {
        const next = normalizeSkin(event.newValue)
        setSkinState(next)
        document.documentElement.setAttribute('data-skin', next)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setSkin = useCallback((next: Skin) => {
    setSkinState(next)
    try {
      window.localStorage.setItem(SKIN_STORAGE_KEY, next)
    } catch {
      // 存储不可用时仅当前会话生效
    }
    document.documentElement.setAttribute('data-skin', next)
  }, [])

  return <SkinContext.Provider value={{ skin, setSkin }}>{children}</SkinContext.Provider>
}

export function useSkin(): SkinContextValue {
  return useContext(SkinContext)
}
