'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/features/settings/components/shared/SectionHeader'
import { ConfigItem } from '@/features/settings/components/shared/ConfigItem'
import { ConfigInput } from '@/features/settings/components/shared/ConfigInput'
import { ConfigSelect } from '@/features/settings/components/shared/ConfigSelect'
import { ConfigSwitch } from '@/features/settings/components/shared/ConfigSwitch'
import { MessageSquare, Send } from 'lucide-react'
import type { SmsNotificationConfig } from '@/features/settings/types/notification.types'
import { toast } from 'react-hot-toast'

interface Props {
  data: SmsNotificationConfig
  onChange: (field: keyof SmsNotificationConfig, value: any) => void
  onTest: (phone: string) => Promise<{ success: boolean; message: string }>
  isTesting?: boolean
}

const providerOptions = [
  { value: 'aliyun', label: '阿里云 SMS' },
  { value: 'tencent', label: '腾讯云 SMS' },
  { value: 'twilio', label: 'Twilio' },
  { value: 'custom', label: '自定义' },
]

export function SmsNotificationSection({ data, onChange, onTest, isTesting = false }: Props) {
  const [testPhone, setTestPhone] = useState('')
  const [isTestingLocal, setIsTestingLocal] = useState(false)

  const handleTest = async () => {
    if (!testPhone) {
      toast.error('请输入测试手机号')
      return
    }
    if (!/^1[3-9]\d{9}$/.test(testPhone)) {
      toast.error('请输入有效的中国大陆手机号')
      return
    }
    setIsTestingLocal(true)
    try {
      const result = await onTest(testPhone)
      if (result.success) {
        toast.success('测试短信发送成功！请检查您的手机')
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
        title="短信通知"
        description="配置短信网关用于发送 SMS 通知"
        icon={MessageSquare}
      />

      <div className="mt-6 space-y-4">
        {/* 启用开关 */}
        <ConfigItem label="启用短信通知" description="开启后，系统将通过短信发送通知">
          <ConfigSwitch
            checked={data.enabled}
            onCheckedChange={(checked) => onChange('enabled', checked)}
          />
        </ConfigItem>

        {/* 提供商 */}
        <div className="pt-4 border-t space-y-4">
          <ConfigItem label="短信服务提供商" description="选择您的短信服务提供商" required>
            <ConfigSelect
              value={data.provider}
              options={providerOptions}
              onChange={(value) =>
                onChange('provider', value as 'aliyun' | 'tencent' | 'twilio' | 'custom')
              }
              disabled={!data.enabled}
            />
          </ConfigItem>

          {/* API Key + API Secret 并排（凭据一对）*/}
          <div className="grid grid-cols-2 gap-4">
            <ConfigItem
              label="API Key / Access Key ID"
              description={
                data.provider === 'aliyun' ? '阿里云 Access Key ID'
                : data.provider === 'tencent' ? '腾讯云 Secret ID'
                : data.provider === 'twilio' ? 'Twilio Account SID'
                : 'API Key'
              }
              required
            >
              <ConfigInput
                value={data.apiKey}
                onChange={(value) => onChange('apiKey', value)}
                placeholder={
                  data.provider === 'aliyun' ? 'LTAI...'
                  : data.provider === 'tencent' ? 'AKIDz...'
                  : data.provider === 'twilio' ? 'AC...'
                  : 'your-api-key'
                }
                disabled={!data.enabled}
                className="w-full"
              />
            </ConfigItem>

            <ConfigItem
              label="API Secret / Access Key Secret"
              description={
                data.provider === 'aliyun' ? '阿里云 Access Key Secret'
                : data.provider === 'tencent' ? '腾讯云 Secret Key'
                : data.provider === 'twilio' ? 'Twilio Auth Token'
                : 'API Secret'
              }
              required
            >
              <ConfigInput
                type="password"
                value={data.apiSecret}
                onChange={(value) => onChange('apiSecret', value)}
                placeholder="••••••••"
                disabled={!data.enabled}
                className="w-full"
              />
            </ConfigItem>
          </div>

          {/* 短信签名（条件展示，保持独行）*/}
          {data.provider !== 'twilio' && (
            <ConfigItem
              label="短信签名"
              description="在短信内容前显示的签名，需提前在服务商控制台申请"
              required
            >
              <ConfigInput
                value={data.signName}
                onChange={(value) => onChange('signName', value)}
                placeholder="网络设备巡检系统"
                disabled={!data.enabled}
              />
            </ConfigItem>
          )}

          <ConfigItem
            label="短信模板代码"
            description={
              data.provider === 'twilio'
                ? 'Twilio Messaging Service SID 或留空使用默认'
                : '在服务商控制台创建的短信模板ID'
            }
            required={data.provider !== 'twilio'}
          >
            <ConfigInput
              value={data.templateCode}
              onChange={(value) => onChange('templateCode', value)}
              placeholder={
                data.provider === 'aliyun' ? 'SMS_123456789'
                : data.provider === 'tencent' ? '1234567'
                : data.provider === 'twilio' ? 'MG...'
                : 'template-code'
              }
              disabled={!data.enabled}
            />
          </ConfigItem>
        </div>

        {/* 测试功能 */}
        <div className="pt-4 border-t">
          <ConfigItem label="测试短信通知" description="发送测试短信以验证配置是否正确">
            <div className="flex space-x-2">
              <div className="flex-1 max-w-md">
                <ConfigInput
                  value={testPhone}
                  onChange={setTestPhone}
                  placeholder="13800138000"
                  disabled={!data.enabled}
                />
              </div>
              <Button
                onClick={handleTest}
                disabled={!data.enabled || isTestingLocal || isTesting}
                variant="outline"
              >
                <Send className="w-4 h-4 mr-2" />
                {isTestingLocal || isTesting ? '发送中...' : '发送测试短信'}
              </Button>
            </div>
          </ConfigItem>
        </div>
      </div>
    </div>
  )
}
