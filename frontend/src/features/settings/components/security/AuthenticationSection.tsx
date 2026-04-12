'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SectionHeader } from '@/features/settings/components/shared/SectionHeader'
import { ConfigItem } from '@/features/settings/components/shared/ConfigItem'
import { ConfigInput } from '@/features/settings/components/shared/ConfigInput'
import { ConfigSwitch } from '@/features/settings/components/shared/ConfigSwitch'
import { ShieldCheck, Plus, X } from 'lucide-react'
import type { AuthenticationConfig } from '@/features/settings/types/security.types'
import { toast } from 'react-hot-toast'

interface Props {
  data: AuthenticationConfig
  onChange: (field: keyof AuthenticationConfig, value: any) => void
}

const mfaMethodOptions: Array<{ value: 'totp' | 'sms' | 'email'; label: string }> = [
  { value: 'totp', label: 'TOTP (App)' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: '邮件' },
]

const oauthProviderOptions: Array<{ value: 'google' | 'microsoft' | 'github'; label: string }> = [
  { value: 'google', label: 'Google' },
  { value: 'microsoft', label: 'Microsoft' },
  { value: 'github', label: 'GitHub' },
]

export function AuthenticationSection({ data, onChange }: Props) {
  const [newIp, setNewIp] = useState('')

  const handleToggleMfaMethod = (method: 'totp' | 'sms' | 'email') => {
    const current = data.mfaMethods || []
    if (current.includes(method)) {
      onChange('mfaMethods', current.filter((m) => m !== method))
    } else {
      onChange('mfaMethods', [...current, method])
    }
  }

  const handleToggleOAuthProvider = (provider: 'google' | 'microsoft' | 'github') => {
    const current = data.oauthProviders || []
    if (current.includes(provider)) {
      onChange('oauthProviders', current.filter((p) => p !== provider))
    } else {
      onChange('oauthProviders', [...current, provider])
    }
  }

  const handleAddIp = () => {
    if (!newIp) {
      toast.error('请输入IP地址')
      return
    }
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/
    if (!ipRegex.test(newIp)) {
      toast.error('请输入有效的IP地址或CIDR格式 (例如: 192.168.1.1 或 10.0.0.0/8)')
      return
    }
    const current = data.ipWhitelist || []
    if (current.includes(newIp)) {
      toast.error('该IP地址已存在')
      return
    }
    onChange('ipWhitelist', [...current, newIp])
    setNewIp('')
    toast.success('IP地址已添加')
  }

  const handleRemoveIp = (ip: string) => {
    const current = data.ipWhitelist || []
    onChange('ipWhitelist', current.filter((i) => i !== ip))
    toast.success('IP地址已移除')
  }

  const handleBadgeKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    callback: () => void
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      callback()
    }
  }

  return (
    <section aria-label="认证方式" className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <SectionHeader
        title="认证方式"
        icon={ShieldCheck}
      />

      <div className="mt-6 space-y-4">
        {/* MFA 配置 */}
        <div className="space-y-4">
          <ConfigItem label="启用多因素认证 (MFA)" description="为用户账号添加额外的安全验证层">
            <ConfigSwitch
              checked={data.mfaEnabled}
              onCheckedChange={(checked) => onChange('mfaEnabled', checked)}
            />
          </ConfigItem>

          {data.mfaEnabled && (
            /* MFA 子选项：方法选择 + 强制开关 并排 */
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ConfigItem
                label="支持的MFA方法"
                description="选择允许使用的认证方式"
                required
              >
                  <div className="flex flex-wrap gap-2">
                    {mfaMethodOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={Boolean(data.mfaMethods?.includes(option.value))}
                        className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm transition-colors ${data.mfaMethods?.includes(option.value) ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background hover:bg-muted'}`}
                        onClick={() => handleToggleMfaMethod(option.value)}
                        onKeyDown={(event) => handleBadgeKeyDown(event, () => handleToggleMfaMethod(option.value))}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </ConfigItem>

              <ConfigItem
                label="强制所有用户使用MFA"
                description="要求所有用户必须启用多因素认证"
              >
                <ConfigSwitch
                  checked={data.mfaRequired}
                  onCheckedChange={(checked) => onChange('mfaRequired', checked)}
                />
              </ConfigItem>
            </div>
          )}

          {data.mfaEnabled && (!data.mfaMethods || data.mfaMethods.length === 0) && (
            <div className="rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
              已启用 MFA，但尚未选择任何可用认证方式。建议至少保留一种方法，以免策略配置不完整。
            </div>
          )}
        </div>

        {/* OAuth 登录 */}
        <div className="pt-4 border-t space-y-4">
          <ConfigItem label="允许OAuth登录" description="允许用户使用第三方账号登录">
            <ConfigSwitch
              checked={data.allowOAuthLogin}
              onCheckedChange={(checked) => onChange('allowOAuthLogin', checked)}
            />
          </ConfigItem>

          {data.allowOAuthLogin && (
            <ConfigItem
              label="支持的OAuth提供商"
              description="选择允许的第三方登录方式"
              required
            >
                <div className="flex flex-wrap gap-2">
                  {oauthProviderOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={Boolean(data.oauthProviders?.includes(option.value))}
                      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm transition-colors ${data.oauthProviders?.includes(option.value) ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background hover:bg-muted'}`}
                      onClick={() => handleToggleOAuthProvider(option.value)}
                      onKeyDown={(event) => handleBadgeKeyDown(event, () => handleToggleOAuthProvider(option.value))}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </ConfigItem>
          )}
        </div>

        {/* IP 白名单 */}
        <div className="pt-4 border-t space-y-4">
          <ConfigItem label="启用IP白名单" description="只允许特定IP地址访问系统">
            <ConfigSwitch
              checked={data.ipWhitelistEnabled}
              onCheckedChange={(checked) => onChange('ipWhitelistEnabled', checked)}
            />
          </ConfigItem>

          {data.ipWhitelistEnabled && (
            <>
              <ConfigItem
                label="添加IP地址"
                description="支持单个IP (192.168.1.1) 或CIDR格式 (10.0.0.0/8)"
              >
                <div className="flex space-x-2">
                    <div className="flex-1 max-w-md">
                      <ConfigInput
                      value={newIp}
                      onChange={setNewIp}
                      placeholder="192.168.1.1 或 10.0.0.0/8"
                    />
                  </div>
                  <Button onClick={handleAddIp} variant="outline">
                    <Plus className="w-4 h-4 mr-2" />
                    添加
                  </Button>
                </div>
              </ConfigItem>

              {data.ipWhitelist && data.ipWhitelist.length > 0 && (
                <ConfigItem label="已添加的IP地址" description={`共 ${data.ipWhitelist.length} 个`}>
                  <div className="flex flex-wrap gap-2 max-w-2xl">
                    {data.ipWhitelist.map((ip) => (
                      <Badge key={ip} variant="secondary" className="px-3 py-1.5">
                        {ip}
                        <button
                          type="button"
                          onClick={() => handleRemoveIp(ip)}
                          className="ml-2 hover:text-red-600"
                          aria-label={`移除 IP ${ip}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </ConfigItem>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
