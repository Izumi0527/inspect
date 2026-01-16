import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { securityApi } from '../api/settings.api'
import { showSuccessToast, showErrorToast } from './utils/toastHandlers'

export const useSecuritySettings = () => {
  return useQuery({
    queryKey: ['settings', 'security'],
    queryFn: securityApi.getSecuritySettings,
    staleTime: 10 * 60 * 1000,
  })
}

export const useUpdateSecuritySettings = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: securityApi.updateSecuritySettings,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'security'] })
      showSuccessToast('安全设置更新成功', data)
    },
    onError: (error: Error) => {
      showErrorToast(error, '安全设置更新失败')
    },
  })
}
