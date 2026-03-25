'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/features/settings/components/shared/SectionHeader'
import { ConfigItem } from '@/features/settings/components/shared/ConfigItem'
import { ConfigInput } from '@/features/settings/components/shared/ConfigInput'
import { ConfigSelect } from '@/features/settings/components/shared/ConfigSelect'
import { ConfigSwitch } from '@/features/settings/components/shared/ConfigSwitch'
import { Webhook, Send } from 'lucide-react'
import type { WebhookNotificationConfig } from '@/features/settings/types/notification.types'
import { toast } from 'react-hot-toast'

interface Props {
  data: WebhookNotificationConfig
  onChange: (field: keyof WebhookNotificationConfig, value: any) => void
  onTest: () => Promise<{ success: boolean; message: string }>
  isTesting?: boolean
}

const methodOptions = [
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
]

const authTypeOptions = [
  { value: 'none', label: '无认证' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'apikey', label: 'API Key' },
]

export function WebhookNotificationSection({ data, onChange, onTest, isTesting = false }: Props) {
  const [isTestingLocal, setIsTestingLocal] = useState(false)

  const handleTest = async () => {
    if (!data.url) {
      toast.error('请先配置 Webhook URL')
      return
    }
    setIsTestingLocal(true)
    try {
      const result = await onTest()
      if (result.success) {
        toast.success('Webhook 测试成功！')
      } else {
        toast.error(`测试失败：${result.message}`)
      }
    } catch (error) {
      toast.error('测试失败：' + (error as Error).message)
    } finally {
      setIsTestingLocal(false)
    }
  }

  return (
    <div className="p-4">
      <SectionHeader
        title="Webhook 通知"
        description="配置 Webhook 以接收系统事件通知"
        icon={Webhook}
      />

      <div className="mt-6 space-y-4">
        {/* 启用开关 */}
        <ConfigItem
          label="启用 Webhook 通知"
          description="开启后，系统将向指定 URL 发送事件通知"
        >
          <ConfigSwitch
            checked={data.enabled}
            onCheckedChange={(checked) => onChange('enabled', checked)}
          />
        </ConfigItem>

        {/* URL */}
        <div className="pt-4 border-t space-y-4">
          <ConfigItem label="Webhook URL" description="接收通知的完整 URL 地址" required>
            <ConfigInput
              type="url"
              value={data.url}
              onChange={(value) => onChange('url', value)}
              placeholder="https://example.com/webhook"
              disabled={!data.enabled}
            />
          </ConfigItem>

          {/* HTTP 方法 + 认证类型 并排（都是请求行为选项）*/}
          <div className="grid grid-cols-2 gap-4">
            <ConfigItem label="HTTP 方法" description="发送请求时使用的 HTTP 方法" required>
              <ConfigSelect
                value={data.method}
                options={methodOptions}
                onChange={(value) => onChange('method', value as 'POST' | 'PUT')}
                disabled={!data.enabled}
              />
            </ConfigItem>

            <ConfigItem label="认证类型" description="选择 Webhook 请求的认证方式" required>
              <ConfigSelect
                value={data.authType}
                options={authTypeOptions}
                onChange={(value) =>
                  onChange('authType', value as 'none' | 'bearer' | 'basic' | 'apikey')
                }
                disabled={!data.enabled}
              />
            </ConfigItem>
          </div>

          {/* 认证 Token（条件展示，保持独行）*/}
          {data.authType !== 'none' && (
            <ConfigItem
              label={
                data.authType === 'bearer' ? 'Bearer Token'
                : data.authType === 'basic' ? 'Basic Auth Token (base64)'
                : 'API Key'
              }
              description={
                data.authType === 'bearer' ? '将在 Authorization 头中作为 Bearer Token 发送'
                : data.authType === 'basic' ? '将在 Authorization 头中作为 Basic Auth 发送'
                : '将在 X-API-Key 头中发送'
              }
              required
            >
              <ConfigInput
                type="password"
                value={data.authToken || ''}
                onChange={(value) => onChange('authToken', value)}
                placeholder={
                  data.authType === 'bearer' ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
                  : data.authType === 'basic' ? 'dXNlcjpwYXNzd29yZA=='
                  : 'your-api-key-here'
                }
                disabled={!data.enabled}
              />
            </ConfigItem>
          )}
        </div>

        {/* 高级配置：失败重试次数 + 超时时间 并排 */}
        <div className="pt-4 border-t">
          <div className="grid grid-cols-2 gap-4">
            <ConfigItem
              label="失败重试次数"
              description="调用失败后的自动重试次数 (0-10次)"
              required
            >
              <ConfigInput
                type="number"
                value={data.retryCount}
                onChange={(value) => {
                  const parsed = Number.parseInt(value, 10)
                  if (!Number.isFinite(parsed)) return
                  onChange('retryCount', parsed)
                }}
                min={0}
                max={10}
                disabled={!data.enabled}
                className="w-full"
              />
            </ConfigItem>

            <ConfigItem
              label="超时时间 (秒)"
              description="请求的超时时间 (5-300秒)"
              required
            >
              <ConfigInput
                type="number"
                value={data.timeout}
                onChange={(value) => {
                  const parsed = Number.parseInt(value, 10)
                  if (!Number.isFinite(parsed)) return
                  onChange('timeout', parsed)
                }}
                min={5}
                max={300}
                disabled={!data.enabled}
                className="w-full"
              />
            </ConfigItem>
          </div>
        </div>

        {/* 测试功能 */}
        <div className="pt-4 border-t">
          <ConfigItem label="测试 Webhook" description="发送测试事件以验证 Webhook 配置是否正确">
            <Button
              onClick={handleTest}
              disabled={!data.enabled || isTestingLocal || isTesting}
              variant="outline"
            >
              <Send className="w-4 h-4 mr-2" />
              {isTestingLocal || isTesting ? '测试中...' : '发送测试事件'}
            </Button>
          </ConfigItem>
        </div>
      </div>
    </div>
  )
}
