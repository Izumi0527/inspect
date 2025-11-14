'use client'

import { Card } from '@/components/ui/card'
import { SectionHeader } from '@/features/settings/components/shared/SectionHeader'
import { ConfigItem } from '@/features/settings/components/shared/ConfigItem'
import { ConfigInput } from '@/features/settings/components/shared/ConfigInput'
import { ConfigSwitch } from '@/features/settings/components/shared/ConfigSwitch'
import { Lock } from 'lucide-react'
import type { PasswordPolicyConfig } from '@/features/settings/types/security.types'

interface Props {
  data: PasswordPolicyConfig
  onChange: (field: keyof PasswordPolicyConfig, value: any) => void
}

export function PasswordPolicySection({ data, onChange }: Props) {
  return (
    <Card className="p-6">
      <SectionHeader
        title="密码策略"
        description="配置密码复杂度和安全要求"
        icon={Lock}
      />

      <div className="mt-6 space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <p className="text-sm text-blue-800">
            ℹ️ 密码策略变更将在用户下次修改密码时生效
          </p>
        </div>

        <ConfigItem
          label="最小密码长度"
          description="密码最少字符数 (6-32个字符)"
          required
        >
          <ConfigInput
            type="number"
            value={data.minLength}
            onChange={(value) => onChange('minLength', parseInt(value, 10))}
            min={6}
            max={32}
          />
        </ConfigItem>

        <div className="pt-4 border-t space-y-4">
          <div className="text-sm font-medium text-gray-700 mb-2">密码复杂度要求</div>

          <ConfigItem
            label="需要大写字母"
            description="密码必须包含至少一个大写字母 (A-Z)"
          >
            <ConfigSwitch
              checked={data.requireUppercase}
              onCheckedChange={(checked) => onChange('requireUppercase', checked)}
            />
          </ConfigItem>

          <ConfigItem
            label="需要小写字母"
            description="密码必须包含至少一个小写字母 (a-z)"
          >
            <ConfigSwitch
              checked={data.requireLowercase}
              onCheckedChange={(checked) => onChange('requireLowercase', checked)}
            />
          </ConfigItem>

          <ConfigItem
            label="需要数字"
            description="密码必须包含至少一个数字 (0-9)"
          >
            <ConfigSwitch
              checked={data.requireNumbers}
              onCheckedChange={(checked) => onChange('requireNumbers', checked)}
            />
          </ConfigItem>

          <ConfigItem
            label="需要特殊字符"
            description="密码必须包含至少一个特殊字符 (!@#$%^&*)"
          >
            <ConfigSwitch
              checked={data.requireSpecialChars}
              onCheckedChange={(checked) => onChange('requireSpecialChars', checked)}
            />
          </ConfigItem>
        </div>

        <div className="pt-4 border-t space-y-4">
          <ConfigItem
            label="密码过期时间 (天)"
            description="密码使用多少天后需要强制更改 (0=永不过期)"
            required
          >
            <ConfigInput
              type="number"
              value={data.passwordExpireDays}
              onChange={(value) => onChange('passwordExpireDays', parseInt(value, 10))}
              min={0}
              max={365}
            />
          </ConfigItem>

          <ConfigItem
            label="密码历史记录数量"
            description="禁止重复使用最近N次使用过的密码 (0-20)"
            required
          >
            <ConfigInput
              type="number"
              value={data.passwordHistoryCount}
              onChange={(value) => onChange('passwordHistoryCount', parseInt(value, 10))}
              min={0}
              max={20}
            />
          </ConfigItem>

          <ConfigItem
            label="防止使用常见密码"
            description="阻止用户使用常见弱密码（如123456、password等）"
          >
            <ConfigSwitch
              checked={data.preventCommonPasswords}
              onCheckedChange={(checked) => onChange('preventCommonPasswords', checked)}
            />
          </ConfigItem>
        </div>

        <div className="pt-4 border-t space-y-4">
          <div className="text-sm font-medium text-gray-700 mb-2">登录安全</div>

          <ConfigItem
            label="最大登录尝试次数"
            description="账户锁定前允许的最大登录失败次数 (3-10次)"
            required
          >
            <ConfigInput
              type="number"
              value={data.maxLoginAttempts}
              onChange={(value) => onChange('maxLoginAttempts', parseInt(value, 10))}
              min={3}
              max={10}
            />
          </ConfigItem>

          <ConfigItem
            label="账户锁定时长 (分钟)"
            description="达到最大尝试次数后账户锁定的时间 (5-1440分钟)"
            required
          >
            <ConfigInput
              type="number"
              value={data.lockoutDuration}
              onChange={(value) => onChange('lockoutDuration', parseInt(value, 10))}
              min={5}
              max={1440}
            />
          </ConfigItem>
        </div>
      </div>
    </Card>
  )
}
