
import React, { useEffect, useMemo, useState } from 'react'
import {
  Shield,
  Lock,
  Key,
  Globe,
  RefreshCw,
  Save,
  Server
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Badge,
  Input,
  TextArea,
  LoadingOverlay,
  PageLoading
} from '@/components/atoms'
import {
  useSecuritySettings,
  useUpdateSecuritySettings,
  useLDAPConfig,
  useUpdateLDAPConfig,
  useTestLDAPConnection,
  useSyncLDAPUsers
} from '../hooks'
import type { SecurityConfig, LDAPConfig } from '../types'

const cloneSecurityConfig = (config: SecurityConfig): SecurityConfig =>
  JSON.parse(JSON.stringify(config))

const cloneLDAPConfig = (config: LDAPConfig): LDAPConfig =>
  JSON.parse(JSON.stringify(config))

interface ToggleProps {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  ariaLabel?: string
}

const Toggle: React.FC<ToggleProps> = ({ checked, onChange, disabled, ariaLabel }) => (
  <button
    type="button"
    aria-pressed={checked}
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={() => {
      if (!disabled) {
        onChange(!checked)
      }
    }}
    className={`relative h-6 w-11 rounded-full border transition-colors duration-200 ${checked ? 'bg-blue-500 border-blue-500' : 'bg-gray-200 border-gray-200'} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
  >
    <span
      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
        checked ? 'translate-x-5' : 'translate-x-0.5'
      }`}
    />
  </button>
)

export const SecuritySettings: React.FC = () => {
  const {
    data: securityConfig,
    isLoading: securityLoading,
    isFetching: securityFetching
  } = useSecuritySettings()
  const updateSecurity = useUpdateSecuritySettings()

  const {
    data: ldapConfig,
    isLoading: ldapLoading,
    isFetching: ldapFetching
  } = useLDAPConfig()
  const updateLDAP = useUpdateLDAPConfig()
  const testLDAP = useTestLDAPConnection()
  const syncLDAP = useSyncLDAPUsers()

  const [securityForm, setSecurityForm] = useState<SecurityConfig | null>(null)
  const [ldapForm, setLdapForm] = useState<LDAPConfig | null>(null)
  const [ldapBaseline, setLdapBaseline] = useState<LDAPConfig | null>(null)

  useEffect(() => {
    if (securityConfig) {
      setSecurityForm(cloneSecurityConfig(securityConfig))
    }
  }, [securityConfig])

  useEffect(() => {
    if (ldapConfig) {
      const cloned = cloneLDAPConfig(ldapConfig)
      cloned.bindPassword = ''
      setLdapForm(cloned)
      setLdapBaseline(cloned)
    }
  }, [ldapConfig])

  const isSecurityDirty = useMemo(() => {
    if (!securityConfig || !securityForm) {
      return false
    }
    return JSON.stringify(securityConfig) !== JSON.stringify(securityForm)
  }, [securityConfig, securityForm])

  const isLdapDirty = useMemo(() => {
    if (!ldapBaseline || !ldapForm) {
      return false
    }
    return JSON.stringify(ldapBaseline) !== JSON.stringify(ldapForm)
  }, [ldapBaseline, ldapForm])

  const setPasswordPolicyValue = <K extends keyof SecurityConfig['passwordPolicy']>(
    key: K,
    value: SecurityConfig['passwordPolicy'][K]
  ) => {
    setSecurityForm(prev =>
      prev
        ? {
            ...prev,
            passwordPolicy: {
              ...prev.passwordPolicy,
              [key]: value
            }
          }
        : prev
    )
  }

  const setSessionPolicyValue = <K extends keyof SecurityConfig['sessionPolicy']>(
    key: K,
    value: SecurityConfig['sessionPolicy'][K]
  ) => {
    setSecurityForm(prev =>
      prev
        ? {
            ...prev,
            sessionPolicy: {
              ...prev.sessionPolicy,
              [key]: value
            }
          }
        : prev
    )
  }

  const setLoginPolicyValue = <K extends keyof SecurityConfig['loginPolicy']>(
    key: K,
    value: SecurityConfig['loginPolicy'][K]
  ) => {
    setSecurityForm(prev =>
      prev
        ? {
            ...prev,
            loginPolicy: {
              ...prev.loginPolicy,
              [key]: value
            }
          }
        : prev
    )
  }
  const setRateLimitingValue = <K extends keyof SecurityConfig['apiSecurity']['rateLimiting']>(
    key: K,
    value: SecurityConfig['apiSecurity']['rateLimiting'][K]
  ) => {
    setSecurityForm(prev =>
      prev
        ? {
            ...prev,
            apiSecurity: {
              ...prev.apiSecurity,
              rateLimiting: {
                ...prev.apiSecurity.rateLimiting,
                [key]: value
              }
            }
          }
        : prev
    )
  }

  const setCorsValue = <K extends keyof SecurityConfig['apiSecurity']['cors']>(
    key: K,
    value: SecurityConfig['apiSecurity']['cors'][K]
  ) => {
    setSecurityForm(prev =>
      prev
        ? {
            ...prev,
            apiSecurity: {
              ...prev.apiSecurity,
              cors: {
                ...prev.apiSecurity.cors,
                [key]: value
              }
            }
          }
        : prev
    )
  }

  const setIpWhitelistValue = <K extends keyof SecurityConfig['ipWhitelist']>(
    key: K,
    value: SecurityConfig['ipWhitelist'][K]
  ) => {
    setSecurityForm(prev =>
      prev
        ? {
            ...prev,
            ipWhitelist: {
              ...prev.ipWhitelist,
              [key]: value
            }
          }
        : prev
    )
  }

  const setLdapValue = <K extends keyof LDAPConfig>(key: K, value: LDAPConfig[K]) => {
    setLdapForm(prev =>
      prev
        ? {
            ...prev,
            [key]: value
          }
        : prev
    )
  }

  const handleSaveSecurity = () => {
    if (!securityForm) {
      return
    }
    updateSecurity.mutate(securityForm)
  }

  const handleResetSecurity = () => {
    if (securityConfig) {
      setSecurityForm(cloneSecurityConfig(securityConfig))
    }
  }

  const handleSaveLDAP = () => {
    if (!ldapForm) {
      return
    }
    const payload: Partial<LDAPConfig> = { ...ldapForm }
    if (!payload.bindPassword) {
      delete payload.bindPassword
    }
    updateLDAP.mutate(payload)
  }

  const handleResetLDAP = () => {
    if (ldapBaseline) {
      setLdapForm(cloneLDAPConfig(ldapBaseline))
    }
  }

  const handleTestLDAP = () => {
    if (!ldapForm) {
      return
    }
    testLDAP.mutate(ldapForm)
  }

  const handleSyncLDAP = () => {
    syncLDAP.mutate()
  }

  if (securityLoading && !securityForm) {
    return <PageLoading message="正在加载安全配置..." />
  }

  const securityOverlayActive = updateSecurity.isPending || securityFetching
  const securityOverlayMessage = updateSecurity.isPending
    ? '正在保存安全配置...'
    : '正在刷新安全配置...'

  const ldapOverlayActive = updateLDAP.isPending || ldapFetching
  const ldapOverlayMessage = updateLDAP.isPending
    ? '正在保存LDAP配置...'
    : '正在刷新LDAP配置...'

  const whitelistText = securityForm?.ipWhitelist.addresses.join('\n') ?? ''
  const corsOriginsText = securityForm?.apiSecurity.cors.origins.join('\n') ?? ''

  return (
    <div className="space-y-6">
      <LoadingOverlay isLoading={securityOverlayActive} message={securityOverlayMessage}>
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>安全策略</CardTitle>
                <CardDescription>配置密码复杂度、登录防护与访问控制策略</CardDescription>
              </div>
            </div>
            <Badge variant={isSecurityDirty ? 'warning' : 'outline'}>
              {isSecurityDirty ? '存在未保存的修改' : '配置已同步'}
            </Badge>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="space-y-4 rounded-xl border border-gray-200/70 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                    <Key className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">密码策略</p>
                    <p className="text-xs text-gray-500">设定密码复杂度与有效期要求</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-gray-500">最小长度</label>
                    <Input
                      type="number"
                      min={4}
                      value={securityForm?.passwordPolicy.minLength ?? ''}
                      onChange={event => {
                        const value = Number(event.target.value)
                        if (!Number.isNaN(value)) {
                          setPasswordPolicyValue('minLength', value)
                        }
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">密码轮换周期（天）</label>
                    <Input
                      type="number"
                      min={0}
                      value={securityForm?.passwordPolicy.maxAge ?? ''}
                      onChange={event => {
                        const value = Number(event.target.value)
                        if (!Number.isNaN(value)) {
                          setPasswordPolicyValue('maxAge', value)
                        }
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">历史记录数量</label>
                    <Input
                      type="number"
                      min={0}
                      value={securityForm?.passwordPolicy.history ?? ''}
                      onChange={event => {
                        const value = Number(event.target.value)
                        if (!Number.isNaN(value)) {
                          setPasswordPolicyValue('history', value)
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700">必须包含大写字母</p>
                      <p className="text-xs text-gray-500">强制用户设置包含 A-Z 大写字符的密码</p>
                    </div>
                    <Toggle
                      ariaLabel="切换大写字母要求"
                      checked={securityForm?.passwordPolicy.requireUppercase ?? false}
                      onChange={value => setPasswordPolicyValue('requireUppercase', value)}
                      disabled={!securityForm || updateSecurity.isPending}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700">必须包含小写字母</p>
                      <p className="text-xs text-gray-500">确保密码包含 a-z 小写字符</p>
                    </div>
                    <Toggle
                      ariaLabel="切换小写字母要求"
                      checked={securityForm?.passwordPolicy.requireLowercase ?? false}
                      onChange={value => setPasswordPolicyValue('requireLowercase', value)}
                      disabled={!securityForm || updateSecurity.isPending}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700">必须包含数字</p>
                      <p className="text-xs text-gray-500">提高密码复杂度</p>
                    </div>
                    <Toggle
                      ariaLabel="切换数字要求"
                      checked={securityForm?.passwordPolicy.requireNumbers ?? false}
                      onChange={value => setPasswordPolicyValue('requireNumbers', value)}
                      disabled={!securityForm || updateSecurity.isPending}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700">必须包含特殊字符</p>
                      <p className="text-xs text-gray-500">例如 ! @ # 等符号</p>
                    </div>
                    <Toggle
                      ariaLabel="切换符号要求"
                      checked={securityForm?.passwordPolicy.requireSymbols ?? false}
                      onChange={value => setPasswordPolicyValue('requireSymbols', value)}
                      disabled={!securityForm || updateSecurity.isPending}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 rounded-xl border border-gray-200/70 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                    <Lock className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">登录与会话</p>
                    <p className="text-xs text-gray-500">限制登录尝试与会话时长</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-gray-500">连续失败次数上限</label>
                    <Input
                      type="number"
                      min={1}
                      value={securityForm?.loginPolicy.maxAttempts ?? ''}
                      onChange={event => {
                        const value = Number(event.target.value)
                        if (!Number.isNaN(value)) {
                          setLoginPolicyValue('maxAttempts', value)
                        }
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">锁定时长（分钟）</label>
                    <Input
                      type="number"
                      min={0}
                      value={securityForm?.loginPolicy.lockoutDuration ?? ''}
                      onChange={event => {
                        const value = Number(event.target.value)
                        if (!Number.isNaN(value)) {
                          setLoginPolicyValue('lockoutDuration', value)
                        }
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">会话超时（分钟）</label>
                    <Input
                      type="number"
                      min={5}
                      value={securityForm?.sessionPolicy.timeout ?? ''}
                      onChange={event => {
                        const value = Number(event.target.value)
                        if (!Number.isNaN(value)) {
                          setSessionPolicyValue('timeout', value)
                        }
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">最大并发会话</label>
                    <Input
                      type="number"
                      min={1}
                      value={securityForm?.sessionPolicy.maxConcurrent ?? ''}
                      onChange={event => {
                        const value = Number(event.target.value)
                        if (!Number.isNaN(value)) {
                          setSessionPolicyValue('maxConcurrent', value)
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700">强制登出旧会话</p>
                      <p className="text-xs text-gray-500">新登录后立即失效其他会话</p>
                    </div>
                    <Toggle
                      ariaLabel="切换强制登出"
                      checked={securityForm?.sessionPolicy.forceLogout ?? false}
                      onChange={value => setSessionPolicyValue('forceLogout', value)}
                      disabled={!securityForm || updateSecurity.isPending}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700">登录需要验证码</p>
                      <p className="text-xs text-gray-500">在高风险时段启用额外校验</p>
                    </div>
                    <Toggle
                      ariaLabel="切换验证码"
                      checked={securityForm?.loginPolicy.requireCaptcha ?? false}
                      onChange={value => setLoginPolicyValue('requireCaptcha', value)}
                      disabled={!securityForm || updateSecurity.isPending}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700">启用双因素认证</p>
                      <p className="text-xs text-gray-500">使用短信或令牌提升账户安全</p>
                    </div>
                    <Toggle
                      ariaLabel="切换双因素"
                      checked={securityForm?.loginPolicy.twoFactorAuth ?? false}
                      onChange={value => setLoginPolicyValue('twoFactorAuth', value)}
                      disabled={!securityForm || updateSecurity.isPending}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-4 rounded-xl border border-gray-200/70 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                    <Globe className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">IP 白名单</p>
                    <p className="text-xs text-gray-500">限制可访问系统的网络来源</p>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                  <div>
                    <p className="text-sm font-medium text-gray-700">启用白名单校验</p>
                    <p className="text-xs text-gray-500">仅允许列表中的 IP 地址访问</p>
                  </div>
                  <Toggle
                    ariaLabel="切换白名单启用状态"
                    checked={securityForm?.ipWhitelist.enabled ?? false}
                    onChange={value => setIpWhitelistValue('enabled', value)}
                    disabled={!securityForm || updateSecurity.isPending}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>IP 地址列表（每行一个）</span>
                    <Badge variant="outline" size="sm">
                      {securityForm?.ipWhitelist.addresses.length ?? 0} 个地址
                    </Badge>
                  </div>
                  <TextArea
                    rows={4}
                    placeholder="例如：192.168.0.0/24"
                    value={whitelistText}
                    onChange={event => {
                      const addresses = event.target.value
                        .split(/\r?\n/)
                        .map(item => item.trim())
                        .filter(Boolean)
                      setIpWhitelistValue('addresses', addresses)
                    }}
                    disabled={!securityForm || updateSecurity.isPending}
                  />
                  <p className="mt-2 text-xs text-gray-500">支持单个 IP 或 CIDR 网段</p>
                </div>
              </div>

              <div className="space-y-4 rounded-xl border border-gray-200/70 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-purple-50 p-2 text-purple-600">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">接口安全</p>
                    <p className="text-xs text-gray-500">配置限流与跨域策略</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700">启用请求限流</p>
                      <p className="text-xs text-gray-500">防止暴力请求冲击接口</p>
                    </div>
                    <Toggle
                      ariaLabel="切换限流"
                      checked={securityForm?.apiSecurity.rateLimiting.enabled ?? false}
                      onChange={value => setRateLimitingValue('enabled', value)}
                      disabled={!securityForm || updateSecurity.isPending}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-gray-500">时间窗口（秒）</label>
                      <Input
                        type="number"
                        min={1}
                        value={securityForm?.apiSecurity.rateLimiting.window ?? ''}
                        onChange={event => {
                          const value = Number(event.target.value)
                          if (!Number.isNaN(value)) {
                            setRateLimitingValue('window', value)
                          }
                        }}
                        disabled={!securityForm?.apiSecurity.rateLimiting.enabled}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">允许请求数</label>
                      <Input
                        type="number"
                        min={1}
                        value={securityForm?.apiSecurity.rateLimiting.requests ?? ''}
                        onChange={event => {
                          const value = Number(event.target.value)
                          if (!Number.isNaN(value)) {
                            setRateLimitingValue('requests', value)
                          }
                        }}
                        disabled={!securityForm?.apiSecurity.rateLimiting.enabled}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700">启用 CORS 控制</p>
                      <p className="text-xs text-gray-500">限制允许访问的前端来源</p>
                    </div>
                    <Toggle
                      ariaLabel="切换CORS"
                      checked={securityForm?.apiSecurity.cors.enabled ?? false}
                      onChange={value => setCorsValue('enabled', value)}
                      disabled={!securityForm || updateSecurity.isPending}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>允许的域名（每行一个）</span>
                      <Badge variant="outline" size="sm">
                        {securityForm?.apiSecurity.cors.origins.length ?? 0} 个域
                      </Badge>
                    </div>
                    <TextArea
                      rows={4}
                      placeholder="例如：https://console.example.com"
                      value={corsOriginsText}
                      onChange={event => {
                        const origins = event.target.value
                          .split(/\r?\n/)
                          .map(item => item.trim())
                          .filter(Boolean)
                        setCorsValue('origins', origins)
                      }}
                      disabled={!securityForm?.apiSecurity.cors.enabled}
                    />
                    <p className="mt-2 text-xs text-gray-500">留空表示仅允许同源请求</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetSecurity}
              disabled={!isSecurityDirty || updateSecurity.isPending}
            >
              <RefreshCw className="mr-2 h-4 w-4" />恢复当前配置
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveSecurity}
              disabled={!isSecurityDirty || updateSecurity.isPending}
            >
              <Save className="mr-2 h-4 w-4" />保存安全策略
            </Button>
          </CardFooter>
        </Card>
      </LoadingOverlay>

      <LoadingOverlay isLoading={ldapOverlayActive} message={ldapOverlayMessage}>
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-slate-50 p-3 text-slate-600">
                <Server className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>LDAP 目录服务</CardTitle>
                <CardDescription>配置企业目录同步与认证集成</CardDescription>
              </div>
            </div>
            <Badge variant={ldapForm?.enabled ? 'success' : 'outline'}>
              {ldapForm?.enabled ? '已启用' : '未启用'}
            </Badge>
          </CardHeader>

          <CardContent className="space-y-6">
            {ldapLoading && !ldapForm ? (
              <PageLoading message="正在加载 LDAP 配置..." />
            ) : ldapForm ? (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700">启用 LDAP 集成</p>
                      <p className="text-xs text-gray-500">关闭后将停止同步与认证</p>
                    </div>
                    <Toggle
                      ariaLabel="切换LDAP启用状态"
                      checked={ldapForm.enabled}
                      onChange={value => setLdapValue('enabled', value)}
                      disabled={updateLDAP.isPending}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700">启用 SSL 加密</p>
                      <p className="text-xs text-gray-500">建议在公网上启用安全连接</p>
                    </div>
                    <Toggle
                      ariaLabel="切换LDAP SSL"
                      checked={ldapForm.ssl}
                      onChange={value => setLdapValue('ssl', value)}
                      disabled={updateLDAP.isPending}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs text-gray-500">LDAP 服务器地址</label>
                    <Input
                      placeholder="ldap.example.com"
                      value={ldapForm.server}
                      onChange={event => setLdapValue('server', event.target.value)}
                      disabled={updateLDAP.isPending}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">端口</label>
                    <Input
                      type="number"
                      min={1}
                      value={ldapForm.port}
                      onChange={event => {
                        const value = Number(event.target.value)
                        if (!Number.isNaN(value)) {
                          setLdapValue('port', value)
                        }
                      }}
                      disabled={updateLDAP.isPending}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Base DN</label>
                    <Input
                      placeholder="dc=example,dc=com"
                      value={ldapForm.baseDN}
                      onChange={event => setLdapValue('baseDN', event.target.value)}
                      disabled={updateLDAP.isPending}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Bind DN</label>
                    <Input
                      placeholder="cn=admin,dc=example,dc=com"
                      value={ldapForm.bindDN}
                      onChange={event => setLdapValue('bindDN', event.target.value)}
                      disabled={updateLDAP.isPending}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Bind 密码</label>
                    <Input
                      type="password"
                      placeholder="输入新密码以更新"
                      value={ldapForm.bindPassword}
                      onChange={event => setLdapValue('bindPassword', event.target.value)}
                      disabled={updateLDAP.isPending}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">超时时间（秒）</label>
                    <Input
                      type="number"
                      min={1}
                      value={ldapForm.timeout}
                      onChange={event => {
                        const value = Number(event.target.value)
                        if (!Number.isNaN(value)) {
                          setLdapValue('timeout', value)
                        }
                      }}
                      disabled={updateLDAP.isPending}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="text-xs text-gray-500">用户筛选条件</label>
                    <Input
                      placeholder="(objectClass=person)"
                      value={ldapForm.userFilter}
                      onChange={event => setLdapValue('userFilter', event.target.value)}
                      disabled={updateLDAP.isPending}
                    />
                    <p className="mt-1 text-xs text-gray-500">用于筛选需要同步的条目</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <label className="text-xs text-gray-500">用户名属性</label>
                      <Input
                        placeholder="uid"
                        value={ldapForm.usernameAttribute}
                        onChange={event => setLdapValue('usernameAttribute', event.target.value)}
                        disabled={updateLDAP.isPending}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">邮箱属性</label>
                      <Input
                        placeholder="mail"
                        value={ldapForm.emailAttribute}
                        onChange={event => setLdapValue('emailAttribute', event.target.value)}
                        disabled={updateLDAP.isPending}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">姓名属性</label>
                      <Input
                        placeholder="cn"
                        value={ldapForm.fullNameAttribute}
                        onChange={event => setLdapValue('fullNameAttribute', event.target.value)}
                        disabled={updateLDAP.isPending}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestLDAP}
                    disabled={!ldapForm.enabled || testLDAP.isPending || updateLDAP.isPending}
                  >
                    <Shield className="mr-2 h-4 w-4" />测试连接
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSyncLDAP}
                    disabled={!ldapForm.enabled || syncLDAP.isPending}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />同步用户
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                未能获取 LDAP 配置信息，请检查后端服务状态。
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetLDAP}
              disabled={!isLdapDirty || updateLDAP.isPending}
            >
              <RefreshCw className="mr-2 h-4 w-4" />恢复当前配置
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveLDAP}
              disabled={!isLdapDirty || updateLDAP.isPending}
            >
              <Save className="mr-2 h-4 w-4" />保存 LDAP 配置
            </Button>
          </CardFooter>
        </Card>
      </LoadingOverlay>
    </div>
  )
}
