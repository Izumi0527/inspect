'use client'

import React from 'react'
import { Lock, CalendarClock, GlobeLock, Users, ShieldAlert } from 'lucide-react'
import { CompactStatCard } from '@/components/shared'

interface SecurityOverviewCardProps {
  minLength: number
  passwordExpireDays: number
  maxLoginAttempts: number
  lockoutDuration: number
  ipWhitelistEnabled: boolean
  ipWhitelistCount: number
  maxConcurrentSessions: number
}

export const SecurityOverviewCard: React.FC<SecurityOverviewCardProps> = ({
  minLength,
  passwordExpireDays,
  maxLoginAttempts,
  lockoutDuration,
  ipWhitelistEnabled,
  ipWhitelistCount,
  maxConcurrentSessions,
}) => {
  const expiryLabel = passwordExpireDays > 0 ? `${passwordExpireDays} 天` : '永不过期'

  return (
    <section aria-label="安全策略概览" className="rounded-xl border border-border bg-card/70 p-5 shadow-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <CompactStatCard title="最小密码长度" value={`${minLength} 位`} icon={Lock} iconClassName="text-blue-600 dark:text-blue-400" className="bg-background/80" />
        <CompactStatCard title="密码有效期" value={expiryLabel} icon={CalendarClock} iconClassName="text-green-600 dark:text-green-400" className="bg-background/80" />
        <CompactStatCard title="登录失败锁定" value={`${maxLoginAttempts} 次 / ${lockoutDuration} 分钟`} icon={ShieldAlert} iconClassName="text-rose-600 dark:text-rose-400" className="bg-background/80" />
        <CompactStatCard title="IP 白名单" value={ipWhitelistEnabled ? `${ipWhitelistCount} 条` : '未启用'} icon={GlobeLock} iconClassName="text-amber-600 dark:text-amber-400" className="bg-background/80" />
        <CompactStatCard title="最大并发会话数" value={maxConcurrentSessions} icon={Users} iconClassName="text-purple-600 dark:text-purple-400" className="bg-background/80" />
      </div>
    </section>
  )
}
