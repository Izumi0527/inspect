import React from 'react'
import Link from 'next/link'
import { 
  Home, 
  Monitor, 
  BarChart3, 
  Shield, 
  Database, 
  Settings,
  Menu,
  LogOut,
  ChevronRight,
  Search
} from 'lucide-react'
import { Button } from '@/components/atoms'
import { NavigationItem } from '../types'

interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
  currentPath?: string
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen, 
  onToggle, 
  currentPath = '/dashboard' 
}) => {
  const navItems: NavigationItem[] = [
    { name: '总览', icon: Home, href: '/dashboard' },
    { name: '设备管理', icon: Monitor, href: '/devices' },
    { name: '巡检管理', icon: Search, href: '/inspection' },
    { name: '监控中心', icon: BarChart3, href: '/monitoring' },
    { name: '告警中心', icon: Shield, href: '/alerts' },
    { name: '报表分析', icon: Database, href: '/reports' },
    { name: '系统设置', icon: Settings, href: '/settings' },
  ]

  const handleLogout = () => {
    // TODO: 实现登出逻辑
    console.log('用户登出')
  }

  return (
    <div className={`fixed inset-y-0 left-0 z-50 ${isOpen ? 'w-64' : 'w-20'} bg-white shadow-lg transform transition-all duration-300`}>
      <div className="flex items-center justify-between p-4 border-b">
        {isOpen && (
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            巡检系统
          </h1>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="hover:bg-gray-100"
        >
          <Menu className="w-5 h-5" />
        </Button>
      </div>
      
      <nav className="mt-8">
        {navItems.map((item) => {
          const isActive = currentPath === item.href
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors ${
                isActive ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''
              }`}
            >
              <item.icon className="w-6 h-6 flex-shrink-0" />
              {isOpen && (
                <>
                  <span className="ml-3 text-sm font-medium">{item.name}</span>
                  {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
                </>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="absolute bottom-0 w-full p-4 border-t">
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full justify-start text-gray-600 hover:text-red-600 hover:bg-red-50"
        >
          <LogOut className="w-5 h-5" />
          {isOpen && <span className="ml-3">退出登录</span>}
        </Button>
      </div>
    </div>
  )
}