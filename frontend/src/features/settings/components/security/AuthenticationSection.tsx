'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SectionHeader } from '@/features/settings/components/shared/SectionHeader'
import { ConfigItem } from '@/features/settings/components/shared/ConfigItem'
import { ConfigInput } from '@/features/settings/components/shared/ConfigInput'
import { ConfigSwitch } from '@/features/settings/components/shared/ConfigSwitch'
import { GlobeLock, Plus, X } from 'lucide-react'
import type { AuthenticationConfig } from '@/features/settings/types/security.types'
import { toast } from 'react-hot-toast'

interface Props {
  data: AuthenticationConfig
  onChange: <K extends keyof AuthenticationConfig>(field: K, value: AuthenticationConfig[K]) => void
}

const ipv4Segment = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
const ipv4Pattern = new RegExp(`^(${ipv4Segment}\\.){3}${ipv4Segment}(\\/(3[0-2]|[12]?\\d))?$`)

export function AuthenticationSection({ data, onChange }: Props) {
  const [newIp, setNewIp] = useState('')

  const handleAddIp = () => {
    const candidate = newIp.trim()
    if (!candidate) {
      toast.error('请输入IP地址')
      return
    }
    if (!ipv4Pattern.test(candidate)) {
      toast.error('请输入有效的IP地址或CIDR格式 (例如: 192.168.1.1 或 10.0.0.0/8)')
      return
    }
    const current = data.ipWhitelist || []
    if (current.includes(candidate)) {
      toast.error('该IP地址已存在')
      return
    }
    onChange('ipWhitelist', [...current, candidate])
    setNewIp('')
  }

  const handleRemoveIp = (ip: string) => {
    const current = data.ipWhitelist || []
    onChange('ipWhitelist', current.filter((i) => i !== ip))
  }

  return (
    <section aria-label="访问控制" className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <SectionHeader
        title="访问控制"
        icon={GlobeLock}
      />

      <div className="mt-6 space-y-4">
        <ConfigItem label="启用IP白名单" description="只允许特定IP地址访问系统（含登录）">
          <ConfigSwitch
            checked={data.ipWhitelistEnabled}
            onCheckedChange={(checked) => onChange('ipWhitelistEnabled', checked)}
          />
        </ConfigItem>

        {data.ipWhitelistEnabled && (
          <>
            <div className="rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
              保存后立即生效。列表必须包含你当前的访问 IP，否则服务端会拒绝保存以避免把自己锁在门外。
            </div>

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
    </section>
  )
}
