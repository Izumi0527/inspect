'use client'

import React, { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Server,
  Network,
  Shield,
  Router,
  HardDrive
} from 'lucide-react'
import {
  Button,
  SimpleInput as Input,
  Card,
  CardContent
} from '@/components/atoms'
import { SimpleSelect, SelectItem } from '@/components/ui/select'
import { CLIConfigForm } from './CLIConfigForm'
import { SNMPConfigForm } from './SNMPConfigForm'
import {
  Device,
  DeviceType
} from '../../types'

// 设备类型映射
const DEVICE_TYPE_OPTIONS: Array<{
  value: DeviceType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string
}> = [
  { value: 'switch', label: '交换机', icon: Network, color: 'text-blue-600' },
  { value: 'router', label: '路由器', icon: Router, color: 'text-green-600' },
  { value: 'firewall', label: '防火墙', icon: Shield, color: 'text-red-600' },
  { value: 'wireless_ap', label: '无线AP', icon: HardDrive, color: 'text-purple-600' }
]

// 表单验证 Schema
const deviceFormSchema = z.object({
  // 基本信息
  name: z
    .string()
    .min(1, '设备名称不能为空')
    .max(100, '设备名称不能超过100个字符'),
  ip: z
    .string()
    .min(1, 'IP地址不能为空')
    .regex(
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
      '请输入有效的IP地址'
    ),
  device_type: z.enum(['switch', 'router', 'firewall', 'wireless_ap'] as const),
  location: z
    .string()
    .max(200, '位置信息不能超过200个字符')
    .optional()
    .or(z.literal('')),
  description: z
    .string()
    .max(500, '描述不能超过500个字符')
    .optional()
    .or(z.literal('')),

  // CLI配置
  cli_protocol: z.enum(['ssh', 'telnet', 'none'] as const).optional(),
  ssh_config: z.object({
    username: z.string().optional(),
    password: z.string().optional(),
    port: z.number().optional(),
    use_key_auth: z.boolean().optional(),
    private_key: z.string().optional(),
    password_configured: z.boolean().optional(),
    private_key_configured: z.boolean().optional()
  }).optional(),
  telnet_config: z.object({
    username: z.string().optional(),
    password: z.string().optional(),
    port: z.number().optional(),
    enable_password: z.string().optional(),
    password_configured: z.boolean().optional(),
    enable_password_configured: z.boolean().optional()
  }).optional(),

  // SNMP配置
  snmp_config: z.object({
    version: z.enum(['v2c', 'v3'] as const),
    port: z.number().optional(),
    v2c_config: z.object({
      community: z.string(),
      write_community: z.string().optional(),
      community_configured: z.boolean().optional(),
      write_community_configured: z.boolean().optional()
    }).optional(),
    v3_config: z.object({
      username: z.string(),
      security_level: z.enum(['noAuthNoPriv', 'authNoPriv', 'authPriv'] as const),
      auth_protocol: z.enum(['MD5', 'SHA', 'SHA224', 'SHA256', 'SHA384', 'SHA512'] as const).optional(),
      auth_password: z.string().optional(),
      priv_protocol: z.enum(['DES', '3DES', 'AES128', 'AES192', 'AES256'] as const).optional(),
      priv_password: z.string().optional(),
      context_name: z.string().optional(),
      auth_password_configured: z.boolean().optional(),
      priv_password_configured: z.boolean().optional()
    }).optional()
  }).optional(),

  // 高级配置
  advanced_config: z.object({
    timeout: z.number().min(5).max(300).optional(),
    retry: z.number().min(0).max(10).optional()
  }).optional(),

  // 兼容性字段
  snmp_community: z
    .string()
    .max(50, 'SNMP团体字符串不能超过50个字符')
    .optional()
    .or(z.literal('')),
  ssh_username: z
    .string()
    .max(50, 'SSH用户名不能超过50个字符')
    .optional()
    .or(z.literal('')),
  ssh_password: z
    .string()
    .max(100, 'SSH密码不能超过100个字符')
    .optional()
    .or(z.literal(''))
})

type DeviceFormData = z.infer<typeof deviceFormSchema>

// 导出类型供子组件使用
export type { DeviceFormData }

interface Props {
  initialData?: Partial<Device>
  onSubmit: (data: DeviceFormData) => Promise<void>
  onCancel: () => void
  loading?: boolean
}

export const DeviceForm: React.FC<Props> = ({
  initialData,
  onSubmit,
  onCancel,
  loading = false
}) => {
  const [submitting, setSubmitting] = useState(false)

  const isEditMode = !!initialData?.id

  // 表单配置
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isValid }
  } = useForm<DeviceFormData>({
    resolver: zodResolver(deviceFormSchema),
    defaultValues: {
      // 基本信息
      name: initialData?.name || '',
      ip: initialData?.ip || '',
      device_type: initialData?.device_type || 'switch',
      location: initialData?.location || '',
      description: initialData?.description || '',

      // CLI配置
      cli_protocol: initialData?.cli_protocol || 'none',
      ssh_config: {
        username: initialData?.ssh_config?.username || '',
        password: initialData?.ssh_config?.password || '',
        port: initialData?.ssh_config?.port || 22,
        use_key_auth: initialData?.ssh_config?.use_key_auth || false,
        private_key: initialData?.ssh_config?.private_key || ''
      },
      telnet_config: {
        username: initialData?.telnet_config?.username || '',
        password: initialData?.telnet_config?.password || '',
        port: initialData?.telnet_config?.port || 23,
        enable_password: initialData?.telnet_config?.enable_password || ''
      },

      // SNMP配置
      snmp_config: {
        version: initialData?.snmp_config?.version ?? 'v2c',
        port: initialData?.snmp_config?.port ?? 161,
        v2c_config: {
          community: initialData?.snmp_config?.v2c_config?.community ?? (isEditMode ? '' : 'public'),
          write_community: initialData?.snmp_config?.v2c_config?.write_community ?? ''
        },
        v3_config: {
          username: initialData?.snmp_config?.v3_config?.username ?? '',
          security_level: initialData?.snmp_config?.v3_config?.security_level ?? 'noAuthNoPriv',
          auth_protocol: initialData?.snmp_config?.v3_config?.auth_protocol ?? 'SHA',
          auth_password: initialData?.snmp_config?.v3_config?.auth_password ?? '',
          priv_protocol: initialData?.snmp_config?.v3_config?.priv_protocol ?? 'AES128',
          priv_password: initialData?.snmp_config?.v3_config?.priv_password ?? '',
          context_name: initialData?.snmp_config?.v3_config?.context_name ?? '',
          auth_password_configured: initialData?.snmp_config?.v3_config?.auth_password_configured ?? false,
          priv_password_configured: initialData?.snmp_config?.v3_config?.priv_password_configured ?? false,
        }
      },

      // 高级配置
      advanced_config: {
        timeout: initialData?.advanced_config?.timeout || 30,
        retry: initialData?.advanced_config?.retry || 3
      },

      // 兼容性字段
      snmp_community: initialData?.snmp_community ?? (isEditMode ? '' : 'public'),
      ssh_username: initialData?.ssh_username ?? '',
      ssh_password: initialData?.ssh_password ?? ''
    },
    mode: 'onChange'
  })

  // 处理表单提交
  const handleFormSubmit = async (data: DeviceFormData) => {
    try {
      setSubmitting(true)
      await onSubmit(data)
    } catch (error) {
      console.error('提交设备表单失败:', error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col h-full max-h-[calc(100vh-12rem)]">
      {/* 可滚动内容区域 */}
      <div className="flex-1 overflow-y-auto pr-2 space-y-6">
        {/* 顶部：设备基本信息 */}
        <Card>
          <CardContent className="p-4">
            <div className="space-y-4">
              <h3 className="text-md font-medium text-foreground flex items-center gap-2">
                <Server className="h-4 w-4" />
                设备基本信息
              </h3>

              <div className="space-y-4">
                {/* 第一行：必填项 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 设备名称 */}
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      设备名称 <span className="text-red-500">*</span>
                    </label>
                    <Controller
                      name="name"
                      control={control}
                      render={({ field }) => (
                        <Input
                          {...field}
                          placeholder="请输入设备名称"
                          error={errors.name?.message}
                        />
                      )}
                    />
                  </div>

                  {/* IP地址 */}
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      IP地址 <span className="text-red-500">*</span>
                    </label>
                    <Controller
                      name="ip"
                      control={control}
                      render={({ field }) => (
                        <Input
                          {...field}
                          placeholder="192.168.1.100"
                          error={errors.ip?.message}
                        />
                      )}
                    />
                  </div>

                  {/* 设备类型 */}
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      设备类型 <span className="text-red-500">*</span>
                    </label>
                    <Controller
                      name="device_type"
                      control={control}
                      render={({ field }) => (
                        <SimpleSelect
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="选择设备类型"
                        >
                          {DEVICE_TYPE_OPTIONS.map(option => {
                            const IconComponent = option.icon
                            return (
                              <SelectItem key={option.value} value={option.value}>
                                <div className="flex items-center gap-2">
                                  <IconComponent className={`h-4 w-4 ${option.color}`} />
                                  {option.label}
                                </div>
                              </SelectItem>
                            )
                          })}
                        </SimpleSelect>
                      )}
                    />
                    {errors.device_type && (
                      <p className="mt-1 text-sm text-red-600">{errors.device_type.message}</p>
                    )}
                  </div>
                </div>

                {/* 第二行：可选项 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 位置信息 */}
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      位置信息
                    </label>
                    <Controller
                      name="location"
                      control={control}
                      render={({ field }) => (
                        <Input
                          {...field}
                          placeholder="例如：A座3楼机房"
                          error={errors.location?.message}
                        />
                      )}
                    />
                  </div>

                  {/* 设备描述 */}
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      设备描述
                    </label>
                    <Controller
                      name="description"
                      control={control}
                      render={({ field }) => (
                        <Input
                          {...field}
                          placeholder="可选：设备的详细描述信息"
                          error={errors.description?.message}
                        />
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 下方：配置区域 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左侧：CLI配置 */}
          <div className="space-y-6">
            <CLIConfigForm
              control={control}
              errors={errors}
              watch={watch}
            />
          </div>

          {/* 右侧：SNMP配置 */}
          <div className="space-y-6">
            <SNMPConfigForm
              control={control}
              errors={errors}
              watch={watch}
            />
          </div>
        </div>
      </div>

      {/* 固定底部按钮 */}
      <div className="flex-shrink-0 flex justify-end space-x-3 pt-6 mt-6 border-t border-border bg-card">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting || loading}
        >
          取消
        </Button>
        <Button
          type="submit"
          disabled={!isValid || submitting || loading}
          loading={submitting || loading}
        >
          {isEditMode ? '更新设备' : '添加设备'}
        </Button>
      </div>
    </form>
  )
}
