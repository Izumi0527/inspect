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
    <div className="p-4">
      <SectionHeader
        title="会话管理"
        description="配置用户会话超时和并发控制"
        icon={Clock}
      />

      <div className="mt-6 space-y-4">
        <ConfigItem
          label="会话超时时间 (分钟)"
          description="用户无操作后自动登出的时间 (5-1440分钟)"
          required
        >
          <ConfigInput
            type="number"
            value={data.sessionTimeout}
            onChange={(value) => onChange('sessionTimeout', parseInt(value, 10))}
            min={5}
            max={1440}
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

          {data.rememberMeEnabled && (
            <ConfigItem
              label='"记住我"持续时间 (天)'
              description="记住登录状态的持续天数 (1-90天)"
              required
            >
              <ConfigInput
                type="number"
                value={data.rememberMeDuration}
                onChange={(value) => onChange('rememberMeDuration', parseInt(value, 10))}
                min={1}
                max={90}
              />
            </ConfigItem>
          )}
        </div>

        <div className="pt-4 border-t space-y-4">
          <ConfigItem
            label="最大并发会话数"
            description="单个用户允许的最大同时登录会话数 (1-10)"
            required
          >
            <ConfigInput
              type="number"
              value={data.maxConcurrentSessions}
              onChange={(value) => onChange('maxConcurrentSessions', parseInt(value, 10))}
              min={1}
              max={10}
            />
          </ConfigItem>

          <ConfigItem
            label="密码更改后强制登出"
            description="用户更改密码后，强制登出所有其他会话"
          >
            <ConfigSwitch
              checked={data.forceLogoutOnPasswordChange}
              onCheckedChange={(checked) => onChange('forceLogoutOnPasswordChange', checked)}
            />
          </ConfigItem>
        </div>
      </div>
    </div>
  )
}
