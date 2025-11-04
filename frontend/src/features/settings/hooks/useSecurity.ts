import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
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

export const useLDAPConfig = () => {
  return useQuery({
    queryKey: ['settings', 'security', 'ldap'],
    queryFn: securityApi.getLDAPConfig,
    staleTime: 10 * 60 * 1000,
  })
}

export const useTestLDAPConnection = () => {
  return useMutation({
    mutationFn: securityApi.testLDAPConnection,
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`LDAP连接成功，发现 ${data.users || 0} 个用户`)
      } else {
        toast.error(data.message || 'LDAP连接失败')
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'LDAP连接测试失败')
    },
  })
}

export const useUpdateLDAPConfig = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: securityApi.updateLDAPConfig,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'security', 'ldap'] })
      showSuccessToast('LDAP配置更新成功', data)
    },
    onError: (error: Error) => {
      showErrorToast(error, 'LDAP配置更新失败')
    },
  })
}

export const useSyncLDAPUsers = () => {
  return useMutation({
    mutationFn: securityApi.syncLDAPUsers,
    onSuccess: (data) => {
      toast.success(`同步完成，共更新 ${data.imported + data.updated} 个用户`)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'LDAP同步失败')
    },
  })
}