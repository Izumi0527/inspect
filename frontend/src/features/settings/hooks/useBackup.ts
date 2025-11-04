import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { backupApi } from '../api/settings.api'
import { showSuccessToast, showErrorToast } from './utils/toastHandlers'

export const useBackups = () => {
  return useQuery({
    queryKey: ['settings', 'backup'],
    queryFn: backupApi.getBackups,
    staleTime: 2 * 60 * 1000,
  })
}

export const useBackup = (id: string) => {
  return useQuery({
    queryKey: ['settings', 'backup', 'detail', id],
    queryFn: () => backupApi.getBackup(id),
    enabled: !!id,
  })
}

export const useCreateBackup = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: backupApi.createBackup,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'backup'] })
      showSuccessToast('备份创建成功', data)
    },
    onError: (error: Error) => {
      showErrorToast(error, '备份创建失败')
    },
  })
}

export const useDeleteBackup = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: backupApi.deleteBackup,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'backup'] })
      showSuccessToast('备份删除成功', data)
    },
    onError: (error: Error) => {
      showErrorToast(error, '备份删除失败')
    },
  })
}

export const useRestoreBackup = () => {
  return useMutation({
    mutationFn: ({ id, options }: { id: string; options?: { overwrite?: boolean; validateOnly?: boolean } }) =>
      backupApi.restoreBackup(id, options),
    onSuccess: (data) => {
      showSuccessToast('备份恢复成功', data)
    },
    onError: (error: Error) => {
      showErrorToast(error, '备份恢复失败')
    },
  })
}