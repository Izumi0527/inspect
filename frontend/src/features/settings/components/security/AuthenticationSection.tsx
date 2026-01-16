'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
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
      onChange(
        'mfaMethods',
        current.filter((m) => m !== method)
      )
    } else {
      onChange('mfaMethods', [...current, method])
    }
  }

  const handleToggleOAuthProvider = (provider: 'google' | 'microsoft' | 'github') => {
    const current = data.oauthProviders || []
    if (current.includes(provider)) {
      onChange(
        'oauthProviders',
        current.filter((p) => p !== provider)
      )
    } else {
      onChange('oauthProviders', [...current, provider])
    }
  }

  const handleAddIp = () => {
    if (!newIp) {
      toast.error('请输入IP地址')
      return
    }

    // Simple IP validation
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
    onChange(
      'ipWhitelist',
      current.filter((i) => i !== ip)
    )
    toast.success('IP地址已移除')
  }

  return (
    <div className="p-4">
      <SectionHeader
        title="认证方式"
        description="配置多因素认证、OAuth登录和IP白名单"
        icon={ShieldCheck}
      />

      <div className="mt-6 space-y-4">
        {/* MFA配置 */}
        <div className="space-y-4">
          <ConfigItem label="启用多因素认证 (MFA)" description="为用户账号添加额外的安全验证层">
            <ConfigSwitch
              checked={data.mfaEnabled}
              onCheckedChange={(checked) => onChange('mfaEnabled', checked)}
            />
          </ConfigItem>

          {data.mfaEnabled && (
            <>
              <ConfigItem
                label="支持的MFA方法"
                description="选择允许用户使用的多因素认证方式"
                required
              >
                <div className="flex flex-wrap gap-2">
                  {mfaMethodOptions.map((option) => (
                    <Badge
                      key={option.value}
                      variant={data.mfaMethods?.includes(option.value) ? 'default' : 'outline'}
                      className="cursor-pointer px-3 py-1.5"
                      onClick={() => handleToggleMfaMethod(option.value)}
                    >
                      {option.label}
                    </Badge>
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
            </>
          )}
        </div>

        {/* OAuth登录 */}
        <div className="pt-4 border-t space-y-4">
          <ConfigItem
            label="允许OAuth登录"
            description="允许用户使用第三方账号登录"
          >
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
                  <Badge
                    key={option.value}
                    variant={data.oauthProviders?.includes(option.value) ? 'default' : 'outline'}
                    className="cursor-pointer px-3 py-1.5"
                    onClick={() => handleToggleOAuthProvider(option.value)}
                  >
                    {option.label}
                  </Badge>
                ))}
              </div>
            </ConfigItem>
          )}
        </div>

        {/* IP白名单 */}
        <div className="pt-4 border-t space-y-4">
          <ConfigItem
            label="启用IP白名单"
            description="只允许特定IP地址访问系统"
          >
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
                      disabled={!data.ipWhitelistEnabled}
                    />
                  </div>
                  <Button
                    onClick={handleAddIp}
                    disabled={!data.ipWhitelistEnabled}
                    variant="outline"
                  >
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
                          onClick={() => handleRemoveIp(ip)}
                          className="ml-2 hover:text-red-600"
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
    </div>
  )
}
