'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface SidebarContextType {
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

const SIDEBAR_STORAGE_KEY = 'sidebar-open'

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mounted, setMounted] = useState(false)

  // 客户端初始化：从 localStorage 读取状态
  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY)
    if (stored !== null) {
      setSidebarOpen(stored === 'true')
    }
  }, [])

  // 持久化到 localStorage
  useEffect(() => {
    if (mounted) {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarOpen))
    }
  }, [sidebarOpen, mounted])

  const toggleSidebar = () => {
    setSidebarOpen(prev => !prev)
  }

  return (
    <SidebarContext.Provider value={{ sidebarOpen, toggleSidebar, setSidebarOpen }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return context
}
