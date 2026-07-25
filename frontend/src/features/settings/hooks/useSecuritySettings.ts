'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { securityApi } from '../api/security.api'
import type {
  SessionManagementConfig,
  PasswordPolicyConfig,
  AuthenticationConfig,
} from '../types/security.types'

export function useSecuritySettings() {
  const queryClient = useQueryClient()

  // 获取配置
  const { data, isLoading, error } = useQuery({
    queryKey: ['securitySettings'],
    queryFn: securityApi.getSecuritySettings,
    staleTime: 5 * 60 * 1000, // 5 分钟缓存
  })

  // 本地状态
  const [sessionManagement, setSessionManagement] = useState<SessionManagementConfig>({
    sessionTimeout: 30,
    autoLogoutEnabled: true,
    rememberMeEnabled: true,
    rememberMeDuration: 7,
    maxConcurrentSessions: 3,
    forceLogoutOnPasswordChange: true,
  })

  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicyConfig>({
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    passwordExpireDays: 90,
    passwordHistoryCount: 5,
    preventCommonPasswords: true,
    maxLoginAttempts: 5,
    lockoutDuration: 15,
  })

  const [authentication, setAuthentication] = useState<AuthenticationConfig>({
    mfaEnabled: false,
    mfaMethods: ['totp'],
    mfaRequired: false,
    allowOAuthLogin: false,
    oauthProviders: [],
    ipWhitelistEnabled: false,
    ipWhitelist: [],
  })

  const [isDirty, setIsDirty] = useState(false)

  // 同步服务端数据到本地状态
  useEffect(() => {
    if (data) {
      setSessionManagement(data.sessionManagement)
      setPasswordPolicy(data.passwordPolicy)
      setAuthentication(data.authentication)
      setIsDirty(false)
    }
  }, [data])

  // 保存所有配置
  const saveMutation = useMutation({
    mutationFn: securityApi.saveAll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['securitySettings'] })
      setIsDirty(false)
    },
  })

  // 更新方法
  const updateSessionManagement = useCallback(
    <K extends keyof SessionManagementConfig>(field: K, value: SessionManagementConfig[K]) => {
      setSessionManagement((prev) => ({ ...prev, [field]: value }))
      setIsDirty(true)
    },
    []
  )

  const updatePasswordPolicy = useCallback(<K extends keyof PasswordPolicyConfig>(field: K, value: PasswordPolicyConfig[K]) => {
    setPasswordPolicy((prev) => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }, [])

  const updateAuthentication = useCallback(<K extends keyof AuthenticationConfig>(field: K, value: AuthenticationConfig[K]) => {
    setAuthentication((prev) => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }, [])

  // 保存所有
  const saveAll = useCallback(async () => {
    await saveMutation.mutateAsync({
      sessionManagement,
      passwordPolicy,
      authentication,
    })
  }, [sessionManagement, passwordPolicy, authentication, saveMutation])

  // 重置所有
  const resetAll = useCallback(() => {
    if (data) {
      setSessionManagement(data.sessionManagement)
      setPasswordPolicy(data.passwordPolicy)
      setAuthentication(data.authentication)
      setIsDirty(false)
    }
  }, [data])

  return {
    sessionManagement,
    passwordPolicy,
    authentication,
    isLoading,
    isSaving: saveMutation.isPending,
    isDirty,
    error,
    updateSessionManagement,
    updatePasswordPolicy,
    updateAuthentication,
    saveAll,
    resetAll,
  }
}
