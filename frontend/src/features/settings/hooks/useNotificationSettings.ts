'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationApi } from '../api/notification.api'
import type {
  EmailNotificationConfig,
  SmsNotificationConfig,
} from '../types/notification.types'

export function useNotificationSettings() {
  const queryClient = useQueryClient()

  // 获取配置
  const { data, isLoading, error } = useQuery({
    queryKey: ['notificationSettings'],
    queryFn: notificationApi.getNotificationSettings,
    staleTime: 5 * 60 * 1000, // 5 分钟缓存
  })

  // 本地状态
  const [emailNotification, setEmailNotification] = useState<EmailNotificationConfig>({
    enabled: false,
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPassword: '',
    smtpUseTls: true,
    senderEmail: '',
    senderName: '',
  })

  const [smsNotification, setSmsNotification] = useState<SmsNotificationConfig>({
    enabled: false,
    provider: 'aliyun',
    apiKey: '',
    apiSecret: '',
    signName: '',
    templateCode: '',
  })

  const [isDirty, setIsDirty] = useState(false)

  // 同步服务端数据到本地状态
  useEffect(() => {
    if (data) {
      setEmailNotification(data.emailNotification)
      setSmsNotification(data.smsNotification)
      setIsDirty(false)
    }
  }, [data])

  // 保存所有配置
  const saveMutation = useMutation({
    mutationFn: notificationApi.saveAll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationSettings'] })
      setIsDirty(false)
    },
  })

  // 测试邮件通知
  const testEmailMutation = useMutation({
    mutationFn: notificationApi.testEmailNotification,
  })

  // 测试SMS通知
  const testSmsMutation = useMutation({
    mutationFn: notificationApi.testSmsNotification,
  })

  // 更新方法
  const updateEmailNotification = useCallback(
    (field: keyof EmailNotificationConfig, value: any) => {
      setEmailNotification((prev) => ({ ...prev, [field]: value }))
      setIsDirty(true)
    },
    []
  )

  const updateSmsNotification = useCallback(
    (field: keyof SmsNotificationConfig, value: any) => {
      setSmsNotification((prev) => ({ ...prev, [field]: value }))
      setIsDirty(true)
    },
    []
  )

  // 保存所有
  const saveAll = useCallback(async () => {
    await saveMutation.mutateAsync({
      emailNotification,
      smsNotification,
    })
  }, [emailNotification, smsNotification, saveMutation])

  // 重置所有
  const resetAll = useCallback(() => {
    if (data) {
      setEmailNotification(data.emailNotification)
      setSmsNotification(data.smsNotification)
      setIsDirty(false)
    }
  }, [data])

  // 测试邮件通知
  const testEmailNotification = useCallback(
    async (email: string) => {
      return await testEmailMutation.mutateAsync(email)
    },
    [testEmailMutation]
  )

  // 测试SMS通知
  const testSmsNotification = useCallback(
    async (phone: string) => {
      return await testSmsMutation.mutateAsync(phone)
    },
    [testSmsMutation]
  )

  return {
    emailNotification,
    smsNotification,
    isLoading,
    isSaving: saveMutation.isPending,
    isTesting: testEmailMutation.isPending || testSmsMutation.isPending,
    isDirty,
    error,
    updateEmailNotification,
    updateSmsNotification,
    saveAll,
    resetAll,
    testEmailNotification,
    testSmsNotification,
  }
}
