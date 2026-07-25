'use client'

import { SectionHeader } from '@/features/settings/components/shared/SectionHeader'
import { ConfigItem } from '@/features/settings/components/shared/ConfigItem'
import { ConfigInput } from '@/features/settings/components/shared/ConfigInput'
import { ConfigSwitch } from '@/features/settings/components/shared/ConfigSwitch'
import { Button } from '@/components/ui/button'
import { Lock, RotateCcw, Save } from 'lucide-react'
import type { PasswordPolicyConfig } from '@/features/settings/types/security.types'

interface PasswordPolicyActions {
  isDirty: boolean
  isSaving: boolean
  onSave: () => void
  onReset: () => void
}

interface Props {
  data: PasswordPolicyConfig
  onChange: <K extends keyof PasswordPolicyConfig>(field: K, value: PasswordPolicyConfig[K]) => void
  actions?: PasswordPolicyActions
}

export function PasswordPolicySection({ data, onChange, actions }: Props) {
  return (
    <section aria-label="密码策略" className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <SectionHeader
        title="密码策略"
        icon={Lock}
        actions={
          actions ? (
            <div role="group" aria-label="密码策略操作" className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={actions.onReset}
                disabled={!actions.isDirty || actions.isSaving}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                重置整页更改
              </Button>
              <Button
                type="button"
                onClick={actions.onSave}
                disabled={!actions.isDirty || actions.isSaving}
              >
                <Save className="w-4 h-4 mr-2" />
                {actions.isSaving ? '保存中...' : '保存整页更改'}
              </Button>
            </div>
          ) : null
        }
      />

      <div className="mt-6 space-y-4">
        <ConfigItem
          label="最小密码长度"
          description="密码最少字符数 (6-32个字符)"
          required
        >
          <ConfigInput
            type="number"
            value={data.minLength}
            onChange={(value) => {
              const parsed = Number.parseInt(value, 10)
              if (!Number.isFinite(parsed)) return
              onChange('minLength', parsed)
            }}
            min={6}
            max={32}
          />
        </ConfigItem>

        {/* 密码复杂度要求 - 2×2 网格 */}
        <div className="pt-4 border-t">
          <div className="text-sm font-medium text-foreground/90 mb-3">密码复杂度要求</div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
            <ConfigItem
              label="需要大写字母"
              description="至少一个大写字母 (A-Z)"
            >
              <ConfigSwitch
                checked={data.requireUppercase}
                onCheckedChange={(checked) => onChange('requireUppercase', checked)}
              />
            </ConfigItem>

            <ConfigItem
              label="需要小写字母"
              description="至少一个小写字母 (a-z)"
            >
              <ConfigSwitch
                checked={data.requireLowercase}
                onCheckedChange={(checked) => onChange('requireLowercase', checked)}
              />
            </ConfigItem>

            <ConfigItem
              label="需要数字"
              description="至少一个数字 (0-9)"
            >
              <ConfigSwitch
                checked={data.requireNumbers}
                onCheckedChange={(checked) => onChange('requireNumbers', checked)}
              />
            </ConfigItem>

            <ConfigItem
              label="需要特殊字符"
              description="至少一个特殊字符 (!@#$%^&*)"
            >
              <ConfigSwitch
                checked={data.requireSpecialChars}
                onCheckedChange={(checked) => onChange('requireSpecialChars', checked)}
              />
            </ConfigItem>
          </div>
        </div>

        {/* 密码过期时间 + 历史记录数量 - 并排 */}
        <div className="pt-4 border-t space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ConfigItem
              label="密码过期时间 (天)"
              description="强制更改周期 (0=永不过期)"
              required
            >
              <ConfigInput
                type="number"
                value={data.passwordExpireDays}
                onChange={(value) => {
                  const parsed = Number.parseInt(value, 10)
                  if (!Number.isFinite(parsed)) return
                  onChange('passwordExpireDays', parsed)
                }}
                min={0}
                max={365}
                className="w-full"
              />
            </ConfigItem>

            <ConfigItem
              label="密码历史记录数量"
              description="禁止重复使用最近N次密码 (0-20)"
              required
            >
              <ConfigInput
                type="number"
                value={data.passwordHistoryCount}
                onChange={(value) => {
                  const parsed = Number.parseInt(value, 10)
                  if (!Number.isFinite(parsed)) return
                  onChange('passwordHistoryCount', parsed)
                }}
                min={0}
                max={20}
                className="w-full"
              />
            </ConfigItem>
          </div>

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

        {/* 登录安全 - 两个数值输入并排 */}
        <div className="pt-4 border-t">
          <div className="text-sm font-medium text-foreground/90 mb-3">登录安全</div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ConfigItem
              label="最大登录尝试次数"
              description="锁定前允许的失败次数 (3-10次)"
              required
            >
              <ConfigInput
                type="number"
                value={data.maxLoginAttempts}
                onChange={(value) => {
                  const parsed = Number.parseInt(value, 10)
                  if (!Number.isFinite(parsed)) return
                  onChange('maxLoginAttempts', parsed)
                }}
                min={3}
                max={10}
                className="w-full"
              />
            </ConfigItem>

            <ConfigItem
              label="账户锁定时长 (分钟)"
              description="达到上限后的锁定时间 (5-1440分钟)"
              required
            >
              <ConfigInput
                type="number"
                value={data.lockoutDuration}
                onChange={(value) => {
                  const parsed = Number.parseInt(value, 10)
                  if (!Number.isFinite(parsed)) return
                  onChange('lockoutDuration', parsed)
                }}
                min={5}
                max={1440}
                className="w-full"
              />
            </ConfigItem>
          </div>
        </div>
      </div>
    </section>
  )
}
