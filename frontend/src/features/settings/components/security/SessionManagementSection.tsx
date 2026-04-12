'use client'

import { SectionHeader } from '@/features/settings/components/shared/SectionHeader'
import { ConfigItem } from '@/features/settings/components/shared/ConfigItem'
import { ConfigInput } from '@/features/settings/components/shared/ConfigInput'
import { ConfigSwitch } from '@/features/settings/components/shared/ConfigSwitch'
import { Clock } from 'lucide-react'
import type { SessionManagementConfig } from '@/features/settings/types/security.types'

interface Props {
  data: SessionManagementConfig
  onChange: (field: keyof SessionManagementConfig, value: any) => void
}

export function SessionManagementSection({ data, onChange }: Props) {
  return (
    <section aria-label="会话管理" className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <SectionHeader
        title="会话管理"
        description="控制访问时效、并发登录与改密后的会话处置。"
        icon={Clock}
      />

      <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
        会话策略决定用户登录后可维持多久、可同时登录多少会话，以及在密码变化后如何收口其它会话风险。
      </div>

      <div className="mt-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ConfigItem
            label="会话超时时间 (分钟)"
            description="无操作后自动登出 (5-1440分钟)"
            required
          >
            <ConfigInput
              type="number"
              value={data.sessionTimeout}
              onChange={(value) => {
                const parsed = Number.parseInt(value, 10)
                if (!Number.isFinite(parsed)) return
                onChange('sessionTimeout', parsed)
              }}
              min={5}
              max={1440}
              className="w-full"
            />
          </ConfigItem>

          <ConfigItem
            label="启用自动登出"
            description="超时后自动登出用户"
          >
            <ConfigSwitch
              checked={data.autoLogoutEnabled}
              onCheckedChange={(checked) => onChange('autoLogoutEnabled', checked)}
            />
          </ConfigItem>
        </div>

        {/* 记住我 - 保持纵向（持续时间为条件展示项） */}
        <div className="pt-4 border-t space-y-4">
          <ConfigItem
            label='启用"记住我"功能'
            description="允许用户选择保持登录状态"
          >
            <ConfigSwitch
              checked={data.rememberMeEnabled}
              onCheckedChange={(checked) => onChange('rememberMeEnabled', checked)}
            />
          </ConfigItem>

          {!data.autoLogoutEnabled && (
            <div className="rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
              当前已关闭自动登出，会话超时时间仅保留为预设值，不会在运行时生效。
            </div>
          )}

          {data.rememberMeEnabled && (
            <ConfigItem
              label='"记住我"持续时间 (天)'
              description="记住登录状态的持续天数 (1-90天)"
              required
            >
              <ConfigInput
                type="number"
                value={data.rememberMeDuration}
                onChange={(value) => {
                  const parsed = Number.parseInt(value, 10)
                  if (!Number.isFinite(parsed)) return
                  onChange('rememberMeDuration', parsed)
                }}
                min={1}
                max={90}
              />
            </ConfigItem>
          )}
        </div>

        {/* 最大并发会话数 + 密码更改后强制登出 - 并排 */}
        <div className="pt-4 border-t">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ConfigItem
              label="最大并发会话数"
              description="单用户允许同时登录数 (1-10)"
              required
            >
              <ConfigInput
                type="number"
                value={data.maxConcurrentSessions}
                onChange={(value) => {
                  const parsed = Number.parseInt(value, 10)
                  if (!Number.isFinite(parsed)) return
                  onChange('maxConcurrentSessions', parsed)
                }}
                min={1}
                max={10}
                className="w-full"
              />
            </ConfigItem>

            <ConfigItem
              label="密码更改后强制登出"
              description="改密后强制登出所有其他会话"
            >
              <ConfigSwitch
                checked={data.forceLogoutOnPasswordChange}
                onCheckedChange={(checked) => onChange('forceLogoutOnPasswordChange', checked)}
              />
            </ConfigItem>
          </div>
        </div>
      </div>
    </section>
  )
}
