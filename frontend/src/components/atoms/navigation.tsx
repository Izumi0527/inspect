import * as React from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Settings, Bell, User, Menu, X, Search } from 'lucide-react'
import { cn } from '@/utils/cn'

// 顶部导航栏
interface HeaderProps {
  title: string
  user?: {
    name: string
    avatar?: string
    role?: string
  }
  onMenuClick?: () => void
  showSearch?: boolean
  onSearch?: (query: string) => void
  actions?: React.ReactNode
  className?: string
}

export const Header: React.FC<HeaderProps> = ({
  title,
  user,
  onMenuClick,
  showSearch = false,
  onSearch,
  actions,
  className
}) => {
  const [searchQuery, setSearchQuery] = React.useState('')
  const [showMobileSearch, setShowMobileSearch] = React.useState(false)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch?.(searchQuery)
  }

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={cn(
        'sticky top-0 z-40 w-full border-b border-border/50 dark:border-border/50 bg-card/80 backdrop-blur-xl',
        className
      )}
    >
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        {/* 左侧 */}
        <div className="flex items-center gap-4">
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="p-2 rounded-lg hover:bg-muted dark:hover:bg-accent/20 transition-colors lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <h1 className="text-xl font-semibold text-foreground dark:text-foreground hidden sm:block">
            {title}
          </h1>
        </div>

        {/* 中间搜索 */}
        {showSearch && !showMobileSearch && (
          <div className="hidden md:flex flex-1 max-w-md mx-8">
            <form onSubmit={handleSearch} className="w-full">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="搜索设备、告警..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-border/50 dark:border-border/50 bg-card/80 backdrop-blur-lg pl-10 pr-4 py-2 text-sm text-foreground transition-colors focus:border-primary focus:bg-background/90 focus:ring-2 focus:ring-ring/30 focus:outline-none"
                />
              </div>
            </form>
          </div>
        )}

        {/* 右侧 */}
        <div className="flex items-center gap-2">
          {/* 移动端搜索按钮 */}
          {showSearch && (
            <button
              onClick={() => setShowMobileSearch(!showMobileSearch)}
              className="p-2 rounded-lg hover:bg-muted dark:hover:bg-accent/20 transition-colors md:hidden"
            >
              {showMobileSearch ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
            </button>
          )}

          {actions}

          {/* 通知 */}
          <button className="relative p-2 rounded-lg hover:bg-muted dark:hover:bg-accent/20 transition-colors">
            <Bell className="h-5 w-5" />
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-xs text-white flex items-center justify-center">
              3
            </span>
          </button>

          {/* 用户菜单 */}
          {user && (
            <div className="flex items-center gap-3 pl-3 border-l border-border">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium text-foreground dark:text-foreground">{user.name}</p>
                {user.role && (
                  <p className="text-xs text-muted-foreground dark:text-muted-foreground">{user.role}</p>
                )}
              </div>
              <button className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center overflow-hidden">
                {user.avatar ? (
                  <Image
                    src={user.avatar}
                    alt={user.name}
                    width={32}
                    height={32}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-4 w-4" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 移动端搜索栏 */}
      {showSearch && showMobileSearch && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="border-t border-border/50 dark:border-border/50 p-4 md:hidden"
        >
          <form onSubmit={handleSearch}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="搜索设备、告警..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-border/50 dark:border-border/50 bg-card/80 backdrop-blur-lg pl-10 pr-4 py-2 text-sm text-foreground transition-colors focus:border-primary focus:bg-background/90 focus:ring-2 focus:ring-ring/30 focus:outline-none"
                autoFocus
              />
            </div>
          </form>
        </motion.div>
      )}
    </motion.header>
  )
}

// 侧边栏
interface SidebarItem {
  id: string
  label: string
  icon: React.ReactNode
  href: string
  badge?: number
  children?: Omit<SidebarItem, 'icon' | 'children'>[]
}

interface SidebarProps {
  items: SidebarItem[]
  activeItem?: string
  onItemClick?: (item: SidebarItem) => void
  collapsed?: boolean
  onCollapse?: (collapsed: boolean) => void
  className?: string
}

export const Sidebar: React.FC<SidebarProps> = ({
  items,
  activeItem,
  onItemClick,
  collapsed = false,
  onCollapse,
  className
}) => {
  const [expandedItems, setExpandedItems] = React.useState<Set<string>>(new Set())

  const toggleExpanded = (itemId: string) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId)
    } else {
      newExpanded.add(itemId)
    }
    setExpandedItems(newExpanded)
  }

  const renderItem = (item: SidebarItem, level = 0) => {
    const isActive = activeItem === item.id
    const isExpanded = expandedItems.has(item.id)
    const hasChildren = item.children && item.children.length > 0

    return (
      <div key={item.id}>
        <button
          onClick={() => {
            if (hasChildren) {
              toggleExpanded(item.id)
            } else {
              onItemClick?.(item)
            }
          }}
          className={cn(
            'flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200',
            level === 0 ? 'mx-2' : 'ml-6 mr-2',
            isActive
              ? 'bg-primary/15 text-primary'
              : 'text-foreground/90 hover:bg-muted dark:hover:bg-accent/20',
            collapsed && level === 0 && 'justify-center px-2'
          )}
        >
          <span className="flex-shrink-0">{item.icon}</span>
          {!collapsed && (
            <>
              <span className="ml-3 flex-1 text-left">{item.label}</span>
              {item.badge && item.badge > 0 && (
                <span className="ml-auto bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
              {hasChildren && (
                <motion.div
                  animate={{ rotate: isExpanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="ml-2"
                >
                  ↓
                </motion.div>
              )}
            </>
          )}
        </button>

        {/* 子项目 */}
        {hasChildren && !collapsed && (
          <motion.div
            initial={false}
            animate={{ height: isExpanded ? 'auto' : 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {item.children!.map((child) => (
              <button
                key={child.id}
                onClick={() => onItemClick?.(child as SidebarItem)}
                className={cn(
                  'flex items-center w-full px-3 py-2 text-sm ml-8 mr-2 rounded-lg transition-colors',
                  activeItem === child.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted/40 dark:hover:bg-accent/20'
                )}
              >
                <span className="flex-1 text-left">{child.label}</span>
                {child.badge && child.badge > 0 && (
                  <span className="ml-auto bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full">
                    {child.badge}
                  </span>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </div>
    )
  }

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 64 : 256 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className={cn(
        'flex flex-col h-full bg-card border-r border-border/50 dark:border-border/50',
        className
      )}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b border-border/50 dark:border-border/50">
        {!collapsed && (
          <h2 className="text-lg font-semibold text-foreground dark:text-foreground">
            设备巡检系统
          </h2>
        )}
        {onCollapse && (
          <button
            onClick={() => onCollapse(!collapsed)}
            className="p-1.5 rounded-lg hover:bg-muted dark:hover:bg-accent/20 transition-colors"
          >
            <motion.div
              animate={{ rotate: collapsed ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              ←
            </motion.div>
          </button>
        )}
      </div>

      {/* 导航项目 */}
      <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
        {items.map((item) => renderItem(item))}
      </nav>

      {/* 底部 */}
      <div className="p-4 border-t border-border/50 dark:border-border/50">
        <button
          onClick={() => onItemClick?.({ id: 'settings', label: '设置', icon: <Settings className="h-5 w-5" />, href: '/settings' })}
          className={cn(
            'flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-lg transition-colors text-foreground/90 hover:bg-muted dark:hover:bg-accent/20',
            collapsed && 'justify-center px-2'
          )}
        >
          <Settings className="h-5 w-5" />
          {!collapsed && <span className="ml-3">设置</span>}
        </button>
      </div>
    </motion.aside>
  )
}

