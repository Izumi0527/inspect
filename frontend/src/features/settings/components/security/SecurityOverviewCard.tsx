'use client'

import React from 'react'
import { Lock, KeyRound, GlobeLock, Users } from 'lucide-react'
import { CompactStatCard } from '@/components/shared'

interface SecurityOverviewCardProps {
  minLength: number
  requireUppercase: boolean
  requireLowercase: boolean
  requireNumbers: boolean
  requireSpecialChars: boolean
  mfaEnabled: boolean
  mfaRequired: boolean
  ipWhitelistEnabled: boolean
  ipWhitelistCount: number
  maxConcurrentSessions: number
}

export const SecurityOverviewCard: React.FC<SecurityOverviewCardProps> = ({
  minLength,
  requireUppercase,
  requireLowercase,
  requireNumbers,
  requireSpecialChars,
  mfaEnabled,
  mfaRequired,
  ipWhitelistEnabled,
  ipWhitelistCount,
  maxConcurrentSessions,
}) => {
  const complexityCount = [requireUppercase, requireLowercase, requireNumbers, requireSpecialChars].filter(Boolean).length

  return (
    <section aria-label="安全策略概览" className="rounded-xl border border-border bg-card/70 p-5 shadow-sm">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">安全策略</h2>
          </div>
          <div className="rounded-xl border border-border bg-background/80 px-4 py-3 xl:min-w-[320px]">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">当前安全基线</p>
            <p className="mt-2 text-lg font-semibold text-foreground">密码最小长度 {minLength} 位</p>
            <p className="mt-2 text-xs text-muted-foreground">
              MFA：{mfaEnabled ? (mfaRequired ? '已启用（强制）' : '已启用（可选）') : '未启用'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CompactStatCard title="最小密码长度" value={`${minLength} 位`} icon={Lock} iconClassName="text-blue-600 dark:text-blue-400" className="bg-background/80" />
          <CompactStatCard title="MFA 状态" value={mfaEnabled ? (mfaRequired ? '强制启用' : '已启用') : '未启用'} icon={KeyRound} iconClassName="text-green-600 dark:text-green-400" className="bg-background/80" />
          <CompactStatCard title="IP 白名单" value={ipWhitelistEnabled ? `${ipWhitelistCount} 条` : '未启用'} icon={GlobeLock} iconClassName="text-amber-600 dark:text-amber-400" className="bg-background/80" />
          <CompactStatCard title="最大并发会话数" value={maxConcurrentSessions} icon={Users} iconClassName="text-purple-600 dark:text-purple-400" className="bg-background/80" />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-background/80 px-4 py-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">密码复杂度要求</span>
            <span className="ml-2">{complexityCount}/4 项已启用</span>
          </div>
        </div>
      </div>
    </section>
  )
}
