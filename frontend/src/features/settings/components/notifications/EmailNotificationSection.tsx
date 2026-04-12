'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/features/settings/components/shared/SectionHeader'
import { ConfigItem } from '@/features/settings/components/shared/ConfigItem'
import { ConfigInput } from '@/features/settings/components/shared/ConfigInput'
import { ConfigSwitch } from '@/features/settings/components/shared/ConfigSwitch'
import { Mail, RotateCcw, Save, Send } from 'lucide-react'
import type { EmailNotificationConfig } from '@/features/settings/types/notification.types'
import { toast } from 'react-hot-toast'

interface EmailNotificationActions {
  isDirty: boolean
  isSaving: boolean
  onSave: () => void
  onReset: () => void
}

interface Props {
  data: EmailNotificationConfig
  onChange: (field: keyof EmailNotificationConfig, value: any) => void
  onTest: (email: string) => Promise<{ success: boolean; message: string }>
  isTesting?: boolean
  actions?: EmailNotificationActions
}

export function EmailNotificationSection({
  data,
  onChange,
  onTest,
  isTesting = false,
  actions,
}: Props) {
  const [testEmail, setTestEmail] = useState('')
  const [isTestingLocal, setIsTestingLocal] = useState(false)

  const handleTest = async () => {
    if (!testEmail) {
      toast.error('请输入测试邮箱地址')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
      toast.error('请输入有效的邮箱地址')
      return
    }
    setIsTestingLocal(true)
    try {
      const result = await onTest(testEmail)
      if (result.success) {
        toast.success('测试邮件发送成功！请检查您的收件箱')
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
    <section aria-label="邮件通知" className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <SectionHeader
        title="邮件通知"
        icon={Mail}
        actions={
          actions ? (
            <div role="group" aria-label="邮件通知操作" className="flex flex-wrap items-center gap-2">
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
        {/* 启用开关 */}
        <ConfigItem label="启用邮件通知" description="开启后，系统将通过邮件发送通知">
          <ConfigSwitch
            checked={data.enabled}
            onCheckedChange={(checked) => onChange('enabled', checked)}
          />
        </ConfigItem>

        {/* SMTP 服务器配置 */}
        <div className="pt-4 border-t space-y-4">
          <ConfigItem
            label="SMTP 服务器地址"
            description="邮件服务器的主机名或IP地址"
            required
          >
            <ConfigInput
              value={data.smtpHost}
              onChange={(value) => onChange('smtpHost', value)}
              placeholder="smtp.example.com"
              disabled={!data.enabled}
            />
          </ConfigItem>

          {/* SMTP 端口 + TLS 开关 并排（端口与加密协议是强关联配置）*/}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ConfigItem
              label="SMTP 端口"
              description="通常为 587（TLS）或 465（SSL）"
              required
            >
              <ConfigInput
                type="number"
                value={data.smtpPort}
                onChange={(value) => {
                  const parsed = Number.parseInt(value, 10)
                  if (!Number.isFinite(parsed)) return
                  onChange('smtpPort', parsed)
                }}
                min={1}
                max={65535}
                disabled={!data.enabled}
                className="w-full"
              />
            </ConfigItem>

            <ConfigItem label="使用 TLS 加密" description="启用传输层安全协议">
              <ConfigSwitch
                checked={data.smtpUseTls}
                onCheckedChange={(checked) => onChange('smtpUseTls', checked)}
                disabled={!data.enabled}
              />
            </ConfigItem>
          </div>

          {/* SMTP 用户名 + 密码 并排（凭据一对）*/}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ConfigItem label="SMTP 用户名" description="用于认证的邮箱账号" required>
              <ConfigInput
                value={data.smtpUser}
                onChange={(value) => onChange('smtpUser', value)}
                placeholder="user@example.com"
                disabled={!data.enabled}
                className="w-full"
              />
            </ConfigItem>

            <ConfigItem label="SMTP 密码" description="邮箱密码或授权码" required>
              <ConfigInput
                type="password"
                value={data.smtpPassword}
                onChange={(value) => onChange('smtpPassword', value)}
                placeholder="••••••••"
                disabled={!data.enabled}
                className="w-full"
              />
            </ConfigItem>
          </div>
        </div>

        {/* 发件人信息：邮箱 + 名称 并排 */}
        <div className="pt-4 border-t">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ConfigItem
              label="发件人邮箱"
              description="显示在邮件发件人字段的地址"
              required
            >
              <ConfigInput
                type="email"
                value={data.senderEmail}
                onChange={(value) => onChange('senderEmail', value)}
                placeholder="noreply@example.com"
                disabled={!data.enabled}
                className="w-full"
              />
            </ConfigItem>

            <ConfigItem
              label="发件人名称"
              description="显示在邮件发件人字段的名称"
              required
            >
              <ConfigInput
                value={data.senderName}
                onChange={(value) => onChange('senderName', value)}
                placeholder="网络设备巡检系统"
                disabled={!data.enabled}
                className="w-full"
              />
            </ConfigItem>
          </div>
        </div>

        {/* 测试功能 */}
        <div className="pt-4 border-t">
          <ConfigItem
            label="测试邮件通知"
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex-1 max-w-md">
                <ConfigInput
                  type="email"
                  value={testEmail}
                  onChange={setTestEmail}
                  placeholder="test@example.com"
                  disabled={!data.enabled}
                />
              </div>
              <Button
                onClick={handleTest}
                disabled={!data.enabled || isTestingLocal || isTesting}
                variant="outline"
              >
                <Send className="w-4 h-4 mr-2" />
                {isTestingLocal || isTesting ? '发送中...' : '发送测试邮件'}
              </Button>
            </div>
          </ConfigItem>
        </div>
      </div>
    </section>
  )
}
