import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationApi } from '../api/settings.api'
import { NotificationConfig } from '../types'
import { showSuccessToast, showErrorToast } from './utils/toastHandlers'

export const useNotificationConfigs = () => {
  return useQuery({
    queryKey: ['settings', 'notifications'],
    queryFn: notificationApi.getConfigs,
    staleTime: 5 * 60 * 1000,
  })
}

export const useNotificationConfig = (id: string) => {
  return useQuery({
    queryKey: ['settings', 'notifications', 'detail', id],
    queryFn: () => notificationApi.getConfig(id),
    enabled: !!id,
  })
}

export const useCreateNotificationConfig = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: notificationApi.createConfig,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'notifications'] })
      showSuccessToast('通知配置创建成功', data)
    },
    onError: (error: Error) => {
      showErrorToast(error, '通知配置创建失败')
    },
  })
}

export const useUpdateNotificationConfig = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<NotificationConfig> }) =>
      notificationApi.updateConfig(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'notifications'] })
      showSuccessToast('通知配置更新成功', data)
    },
    onError: (error: Error) => {
      showErrorToast(error, '通知配置更新失败')
    },
  })
}

export const useDeleteNotificationConfig = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: notificationApi.deleteConfig,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'notifications'] })
      showSuccessToast('通知配置已删除', data)
    },
    onError: (error: Error) => {
      showErrorToast(error, '通知配置删除失败')
    },
  })
}

export const useTestNotificationConfig = () => {
  return useMutation({
    mutationFn: ({ id, recipient }: { id: string; recipient?: string }) =>
      notificationApi.testConfig(id, recipient),
    onSuccess: (data) => {
      showSuccessToast('通知测试成功', data)
    },
    onError: (error: Error) => {
      showErrorToast(error, '通知测试失败')
    },
  })
}