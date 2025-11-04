import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { systemConfigApi } from '../api/settings.api'
import { SystemConfig } from '../types'
import { showSuccessToast, showErrorToast } from './utils/toastHandlers'

export const useConfigGroups = () => {
  return useQuery({
    queryKey: ['settings', 'config', 'groups'],
    queryFn: systemConfigApi.getConfigGroups,
    staleTime: 10 * 60 * 1000, // 10分钟缓存
  })
}

export const useSystemConfigs = (category?: string) => {
  return useQuery({
    queryKey: ['settings', 'config', category || 'all'],
    queryFn: () => systemConfigApi.getConfigs(category),
    staleTime: 5 * 60 * 1000,
  })
}

export const useSystemConfig = (key: string) => {
  return useQuery({
    queryKey: ['settings', 'config', 'detail', key],
    queryFn: () => systemConfigApi.getConfig(key),
    enabled: !!key,
  })
}

export const useUpdateConfig = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: SystemConfig['value'] }) =>
      systemConfigApi.updateConfig(key, value),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'config'] })
      showSuccessToast('配置更新成功', data)
    },
    onError: (error: Error) => {
      showErrorToast(error, '配置更新失败')
    },
  })
}

export const useUpdateConfigs = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: systemConfigApi.updateConfigs,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'config'] })
      showSuccessToast('配置批量更新成功', data)
    },
    onError: (error: Error) => {
      showErrorToast(error, '配置批量更新失败')
    },
  })
}

export const useResetConfig = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: systemConfigApi.resetConfig,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'config'] })
      showSuccessToast('配置已重置为默认值', data)
    },
    onError: (error: Error) => {
      showErrorToast(error, '配置重置失败')
    },
  })
}