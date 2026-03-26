'use client'

import React from 'react'
import { Controller, Control, FieldErrors } from 'react-hook-form'
import {
  Network,
  Shield,
  Key,
  Lock,
  AlertTriangle
} from 'lucide-react'
import {
  SimpleInput as Input,
  SimpleSelect,
  SelectItem,
  Card,
  CardContent
} from '@/components/atoms'
import {
  SNMPVersion,
  SNMPv3SecurityLevel,
  SNMPv3AuthProtocol,
  SNMPv3PrivProtocol,
  SNMPConfig
} from '../../types'
import { DeviceFormData } from './DeviceForm'
import { PasswordInput } from './PasswordInput'

// SNMP版本选项
const SNMP_VERSION_OPTIONS = [
  { value: 'v2c' as SNMPVersion, label: 'SNMPv2c', description: '简单社区字符串认证' },
  { value: 'v3' as SNMPVersion, label: 'SNMPv3', description: '支持认证和加密' }
]

// SNMPv3安全级别选项
const SNMPV3_SECURITY_LEVELS = [
  {
    value: 'noAuthNoPriv' as SNMPv3SecurityLevel,
    label: '无认证无加密',
    description: '仅用户名验证，不安全'
  },
  {
    value: 'authNoPriv' as SNMPv3SecurityLevel,
    label: '仅认证',
    description: '用户名+密码认证，数据未加密'
  },
  {
    value: 'authPriv' as SNMPv3SecurityLevel,
    label: '认证+加密',
    description: '最高安全级别，推荐使用'
  }
]

// 认证协议选项
const AUTH_PROTOCOLS = [
  { value: 'MD5' as SNMPv3AuthProtocol, label: 'MD5', description: '兼容性好，安全性一般' },
  { value: 'SHA' as SNMPv3AuthProtocol, label: 'SHA', description: '推荐，安全性较好' },
  { value: 'SHA224' as SNMPv3AuthProtocol, label: 'SHA224', description: '高安全性' },
  { value: 'SHA256' as SNMPv3AuthProtocol, label: 'SHA256', description: '高安全性' },
  { value: 'SHA384' as SNMPv3AuthProtocol, label: 'SHA384', description: '最高安全性' },
  { value: 'SHA512' as SNMPv3AuthProtocol, label: 'SHA512', description: '最高安全性' }
]

// 加密协议选项
const PRIV_PROTOCOLS = [
  { value: 'DES' as SNMPv3PrivProtocol, label: 'DES', description: '基础加密，兼容性好' },
  { value: '3DES' as SNMPv3PrivProtocol, label: '3DES', description: '增强DES，安全性较好' },
  { value: 'AES128' as SNMPv3PrivProtocol, label: 'AES128', description: '推荐，性能和安全性平衡' },
  { value: 'AES192' as SNMPv3PrivProtocol, label: 'AES192', description: '高安全性' },
  { value: 'AES256' as SNMPv3PrivProtocol, label: 'AES256', description: '最高安全性' }
]

export interface SNMPConfigFormData {
  snmp_config: SNMPConfig
}

interface SNMPConfigFormProps {
  control: Control<DeviceFormData>
  errors: FieldErrors<DeviceFormData>
  watch: (name: string) => unknown
}

export const SNMPConfigForm: React.FC<SNMPConfigFormProps> = ({
  control,
  errors,
  watch
}) => {
  const snmpVersion = watch('snmp_config.version') as string
  const securityLevel = watch('snmp_config.v3_config.security_level') as string

  const needsAuth = securityLevel === 'authNoPriv' || securityLevel === 'authPriv'
  const needsPriv = securityLevel === 'authPriv'

  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-6">
          <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
            <Network className="h-5 w-5" />
            SNMP配置
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* SNMP版本选择 */}
            <div>
              <label className="block text-sm font-medium text-foreground/90 mb-2">
                SNMP版本 <span className="text-red-500">*</span>
              </label>
              <Controller
                name="snmp_config.version"
                control={control}
                render={({ field }) => (
                  <SimpleSelect
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="选择SNMP版本"
                  >
                    {SNMP_VERSION_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex flex-col">
                          <span className="font-medium">{option.label}</span>
                          <span className="text-xs text-muted-foreground">{option.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SimpleSelect>
                )}
              />
              {errors.snmp_config?.version && (
                <p className="mt-1 text-sm text-red-600">{errors.snmp_config.version.message}</p>
              )}
            </div>

            {/* SNMP端口 */}
            <div>
              <label className="block text-sm font-medium text-foreground/90 mb-1">
                端口号
              </label>
              <Controller
                name="snmp_config.port"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    type="number"
                    placeholder="161"
                    value={field.value || '161'}
                    onChange={e => field.onChange(parseInt(e.target.value) || 161)}
                    error={errors.snmp_config?.port?.message}
                  />
                )}
              />
            </div>
          </div>

          {/* SNMPv2c配置 */}
          {snmpVersion === 'v2c' && (
            <div className="space-y-4 p-4 bg-blue-50/50 dark:bg-blue-900/20 rounded-lg border border-blue-200/50 dark:border-blue-700/50">
              <h4 className="text-md font-medium text-blue-800 dark:text-blue-200 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                SNMPv2c配置
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 只读团体字符串 */}
                <div>
                  <label className="block text-sm font-medium text-foreground/90 mb-1">
                    只读团体字符串 <span className="text-red-500">*</span>
                  </label>
                  <Controller
                    name="snmp_config.v2c_config.community"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        placeholder="public"
                        error={errors.snmp_config?.v2c_config?.community?.message}
                      />
                    )}
                  />
                </div>

                {/* 读写团体字符串 */}
                <div>
                  <label className="block text-sm font-medium text-foreground/90 mb-1">
                    读写团体字符串
                  </label>
                  <Controller
                    name="snmp_config.v2c_config.write_community"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        placeholder="private"
                        error={errors.snmp_config?.v2c_config?.write_community?.message}
                      />
                    )}
                  />
                </div>
              </div>

              <div className="text-xs text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 p-2 rounded border border-blue-200 dark:border-blue-700">
                <p>⚠️ SNMPv2c使用明文传输，请使用复杂的团体字符串</p>
              </div>
            </div>
          )}

          {/* SNMPv3配置 */}
          {snmpVersion === 'v3' && (
            <div className="space-y-4 p-4 bg-green-50/50 dark:bg-green-900/20 rounded-lg border border-green-200/50 dark:border-green-700/50">
              <h4 className="text-md font-medium text-green-800 dark:text-green-200 flex items-center gap-2">
                <Lock className="h-4 w-4" />
                SNMPv3配置
              </h4>

              {/* 用户名 */}
              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1">
                  用户名 <span className="text-red-500">*</span>
                </label>
                <Controller
                  name="snmp_config.v3_config.username"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      placeholder="snmpuser"
                      error={errors.snmp_config?.v3_config?.username?.message}
                    />
                  )}
                />
              </div>

              {/* 安全级别 */}
              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-2">
                  安全级别 <span className="text-red-500">*</span>
                </label>
                <Controller
                  name="snmp_config.v3_config.security_level"
                  control={control}
                  render={({ field }) => (
                    <SimpleSelect
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="选择安全级别"
                    >
                      {SNMPV3_SECURITY_LEVELS.map(level => (
                        <SelectItem key={level.value} value={level.value}>
                          <div className="flex flex-col">
                            <span className="font-medium">{level.label}</span>
                            <span className="text-xs text-muted-foreground">{level.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SimpleSelect>
                  )}
                />
                {errors.snmp_config?.v3_config?.security_level && (
                  <p className="mt-1 text-sm text-red-600">{errors.snmp_config.v3_config.security_level.message}</p>
                )}
              </div>

              {/* 认证配置 */}
              {needsAuth && (
                <div className="space-y-4 p-3 bg-yellow-50/50 dark:bg-yellow-900/20 rounded border border-yellow-200/50 dark:border-yellow-700/50">
                  <h5 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
                    <Key className="h-3 w-3" />
                    认证配置
                  </h5>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 认证协议 */}
                    <div>
                      <label className="block text-sm font-medium text-foreground/90 mb-1">
                        认证协议 <span className="text-red-500">*</span>
                      </label>
                      <Controller
                        name="snmp_config.v3_config.auth_protocol"
                        control={control}
                        render={({ field }) => (
                          <SimpleSelect
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="选择认证协议"
                          >
                            {AUTH_PROTOCOLS.map(protocol => (
                              <SelectItem key={protocol.value} value={protocol.value}>
                                <div className="flex flex-col">
                                  <span className="font-medium">{protocol.label}</span>
                                  <span className="text-xs text-muted-foreground">{protocol.description}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SimpleSelect>
                        )}
                      />
                    </div>

                    {/* 认证密码 */}
                    <div>
                      <label className="block text-sm font-medium text-foreground/90 mb-1">
                        认证密码 <span className="text-red-500">*</span>
                      </label>
                      <Controller
                        name="snmp_config.v3_config.auth_password"
                        control={control}
                        render={({ field }) => (
                          <PasswordInput
                            {...field}
                            placeholder="至少8位字符"
                            error={errors.snmp_config?.v3_config?.auth_password?.message}
                          />
                        )}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 加密配置 */}
              {needsPriv && (
                <div className="space-y-4 p-3 bg-red-50/50 dark:bg-red-900/20 rounded border border-red-200/50 dark:border-red-700/50">
                  <h5 className="text-sm font-medium text-red-800 dark:text-red-200 flex items-center gap-2">
                    <Lock className="h-3 w-3" />
                    加密配置
                  </h5>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 加密协议 */}
                    <div>
                      <label className="block text-sm font-medium text-foreground/90 mb-1">
                        加密协议 <span className="text-red-500">*</span>
                      </label>
                      <Controller
                        name="snmp_config.v3_config.priv_protocol"
                        control={control}
                        render={({ field }) => (
                          <SimpleSelect
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="选择加密协议"
                          >
                            {PRIV_PROTOCOLS.map(protocol => (
                              <SelectItem key={protocol.value} value={protocol.value}>
                                <div className="flex flex-col">
                                  <span className="font-medium">{protocol.label}</span>
                                  <span className="text-xs text-muted-foreground">{protocol.description}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SimpleSelect>
                        )}
                      />
                    </div>

                    {/* 加密密码 */}
                    <div>
                      <label className="block text-sm font-medium text-foreground/90 mb-1">
                        加密密码 <span className="text-red-500">*</span>
                      </label>
                      <Controller
                        name="snmp_config.v3_config.priv_password"
                        control={control}
                        render={({ field }) => (
                          <PasswordInput
                            {...field}
                            placeholder="至少8位字符"
                            error={errors.snmp_config?.v3_config?.priv_password?.message}
                          />
                        )}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 上下文名称 */}
              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1">
                  上下文名称
                </label>
                <Controller
                  name="snmp_config.v3_config.context_name"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      placeholder="可选：用于访问特定MIB视图"
                      error={errors.snmp_config?.v3_config?.context_name?.message}
                    />
                  )}
                />
              </div>

              <div className="text-xs text-green-600 dark:text-green-300 bg-green-50 dark:bg-green-900/20 p-2 rounded border border-green-200 dark:border-green-700">
                <p>✅ SNMPv3提供企业级安全保护，建议使用&ldquo;认证+加密&rdquo;模式</p>
              </div>
            </div>
          )}

          {/* 无版本选择提示 */}
          {!snmpVersion && (
            <div className="text-center p-6 bg-muted/40 rounded-lg border border-border">
              <AlertTriangle className="h-8 w-8 text-muted-foreground/80 mx-auto mb-2" />
              <p className="text-muted-foreground">请先选择SNMP版本</p>
              <p className="text-sm text-muted-foreground mt-1">
                推荐使用SNMPv3以获得更好的安全性
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}