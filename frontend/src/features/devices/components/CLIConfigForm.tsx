'use client'

import React from 'react'
import { Controller, Control, FieldErrors } from 'react-hook-form'
import {
  Terminal,
  Key,
  Eye,
  EyeOff,
  Shield,
  Server
} from 'lucide-react'
import {
  SimpleInput as Input,
  SimpleSelect,
  SelectItem,
  Card,
  CardContent
} from '@/components/atoms'
import {
  CLIProtocol,
  SSHConfig,
  TelnetConfig
} from '../types'
import { DeviceFormData } from './DeviceForm'

// CLI协议选项
const CLI_PROTOCOL_OPTIONS = [
  { value: 'none' as CLIProtocol, label: '不使用CLI', icon: Shield, color: 'text-gray-500' },
  { value: 'ssh' as CLIProtocol, label: 'SSH', icon: Terminal, color: 'text-green-600' },
  { value: 'telnet' as CLIProtocol, label: 'Telnet', icon: Server, color: 'text-blue-600' }
]

export interface CLIConfigFormData {
  cli_protocol: CLIProtocol
  ssh_config?: SSHConfig
  telnet_config?: TelnetConfig
}

interface CLIConfigFormProps {
  control: Control<DeviceFormData>
  errors: FieldErrors<DeviceFormData>
  watch: (name: string) => unknown
}

export const CLIConfigForm: React.FC<CLIConfigFormProps> = ({
  control,
  errors,
  watch
}) => {
  const [showSSHPassword, setShowSSHPassword] = React.useState(false)
  const [showTelnetPassword, setShowTelnetPassword] = React.useState(false)
  const [showEnablePassword, setShowEnablePassword] = React.useState(false)

  const cliProtocol = watch('cli_protocol') as string

  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-6">
          <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            CLI连接配置
          </h3>

          {/* 协议选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              连接协议
            </label>
            <Controller
              name="cli_protocol"
              control={control}
              render={({ field }) => (
                <SimpleSelect
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="选择CLI连接协议"
                >
                  {CLI_PROTOCOL_OPTIONS.map(option => {
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
            {errors.cli_protocol?.message && (
              <p className="mt-1 text-sm text-red-600">{errors.cli_protocol.message}</p>
            )}
          </div>

          {/* SSH配置 */}
          {cliProtocol === 'ssh' && (
            <div className="space-y-4 p-4 bg-green-50/50 rounded-lg border border-green-200/50">
              <h4 className="text-md font-medium text-green-800 flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                SSH配置
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* SSH用户名 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    用户名 <span className="text-red-500">*</span>
                  </label>
                  <Controller
                    name="ssh_config.username"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        placeholder="admin"
                        error={errors.ssh_config?.username?.message}
                      />
                    )}
                  />
                </div>

                {/* SSH端口 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    端口号
                  </label>
                  <Controller
                    name="ssh_config.port"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        type="number"
                        placeholder="22"
                        value={field.value || '22'}
                        onChange={e => field.onChange(parseInt(e.target.value) || 22)}
                        error={errors.ssh_config?.port?.message}
                      />
                    )}
                  />
                </div>
              </div>

              {/* SSH认证方式选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  认证方式
                </label>
                <Controller
                  name="ssh_config.use_key_auth"
                  control={control}
                  render={({ field }) => (
                    <div className="flex gap-4">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          checked={!field.value}
                          onChange={() => field.onChange(false)}
                          className="mr-2"
                        />
                        密码认证
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          checked={!!field.value}
                          onChange={() => field.onChange(true)}
                          className="mr-2"
                        />
                        密钥认证
                      </label>
                    </div>
                  )}
                />
              </div>

              {/* 根据认证方式显示不同字段 */}
              {!((watch('ssh_config.use_key_auth') as boolean)) ? (
                /* 密码认证 */
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    密码 <span className="text-red-500">*</span>
                  </label>
                  <Controller
                    name="ssh_config.password"
                    control={control}
                    render={({ field }) => (
                      <div className="relative">
                        <Input
                          {...field}
                          type={showSSHPassword ? 'text' : 'password'}
                          placeholder="请输入SSH密码"
                          error={errors.ssh_config?.password?.message}
                        />
                        <button
                          type="button"
                          className="absolute inset-y-0 right-0 pr-3 flex items-center"
                          onClick={() => setShowSSHPassword(!showSSHPassword)}
                        >
                          {showSSHPassword ? (
                            <EyeOff className="h-4 w-4 text-gray-400" />
                          ) : (
                            <Eye className="h-4 w-4 text-gray-400" />
                          )}
                        </button>
                      </div>
                    )}
                  />
                </div>
              ) : (
                /* 密钥认证 */
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    私钥内容 <span className="text-red-500">*</span>
                  </label>
                  <Controller
                    name="ssh_config.private_key"
                    control={control}
                    render={({ field }) => (
                      <div className="space-y-2">
                        <textarea
                          {...field}
                          placeholder="请粘贴SSH私钥内容..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 font-mono text-sm"
                          rows={6}
                        />
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Key className="h-3 w-3" />
                          支持OpenSSH、RSA、DSA格式私钥
                        </div>
                        {errors.ssh_config?.private_key && (
                          <p className="text-sm text-red-600">{errors.ssh_config.private_key.message}</p>
                        )}
                      </div>
                    )}
                  />
                </div>
              )}
            </div>
          )}

          {/* Telnet配置 */}
          {cliProtocol === 'telnet' && (
            <div className="space-y-4 p-4 bg-blue-50/50 rounded-lg border border-blue-200/50">
              <h4 className="text-md font-medium text-blue-800 flex items-center gap-2">
                <Server className="h-4 w-4" />
                Telnet配置
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Telnet用户名 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    用户名 <span className="text-red-500">*</span>
                  </label>
                  <Controller
                    name="telnet_config.username"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        placeholder="admin"
                        error={errors.telnet_config?.username?.message}
                      />
                    )}
                  />
                </div>

                {/* Telnet端口 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    端口号
                  </label>
                  <Controller
                    name="telnet_config.port"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        type="number"
                        placeholder="23"
                        value={field.value || '23'}
                        onChange={e => field.onChange(parseInt(e.target.value) || 23)}
                        error={errors.telnet_config?.port?.message}
                      />
                    )}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Telnet密码 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    登录密码 <span className="text-red-500">*</span>
                  </label>
                  <Controller
                    name="telnet_config.password"
                    control={control}
                    render={({ field }) => (
                      <div className="relative">
                        <Input
                          {...field}
                          type={showTelnetPassword ? 'text' : 'password'}
                          placeholder="请输入Telnet密码"
                          error={errors.telnet_config?.password?.message}
                        />
                        <button
                          type="button"
                          className="absolute inset-y-0 right-0 pr-3 flex items-center"
                          onClick={() => setShowTelnetPassword(!showTelnetPassword)}
                        >
                          {showTelnetPassword ? (
                            <EyeOff className="h-4 w-4 text-gray-400" />
                          ) : (
                            <Eye className="h-4 w-4 text-gray-400" />
                          )}
                        </button>
                      </div>
                    )}
                  />
                </div>

                {/* Enable密码 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Enable密码
                  </label>
                  <Controller
                    name="telnet_config.enable_password"
                    control={control}
                    render={({ field }) => (
                      <div className="relative">
                        <Input
                          {...field}
                          type={showEnablePassword ? 'text' : 'password'}
                          placeholder="可选：特权模式密码"
                          error={errors.telnet_config?.enable_password?.message}
                        />
                        <button
                          type="button"
                          className="absolute inset-y-0 right-0 pr-3 flex items-center"
                          onClick={() => setShowEnablePassword(!showEnablePassword)}
                        >
                          {showEnablePassword ? (
                            <EyeOff className="h-4 w-4 text-gray-400" />
                          ) : (
                            <Eye className="h-4 w-4 text-gray-400" />
                          )}
                        </button>
                      </div>
                    )}
                  />
                </div>
              </div>

              <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded border border-blue-200">
                <p>⚠️ 注意：Telnet协议传输数据未加密，建议仅在安全网络环境中使用</p>
              </div>
            </div>
          )}

          {/* 无CLI提示 */}
          {cliProtocol === 'none' && (
            <div className="text-center p-6 bg-gray-50 rounded-lg border border-gray-200">
              <Shield className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600">不使用CLI连接</p>
              <p className="text-sm text-gray-500 mt-1">
                设备将仅支持SNMP监控，无法执行命令行操作
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}