import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { backupApi } from '../api/backup.api'
import type {
  BackupConfig,
  BackupManagementResponse,
  CreateBackupRequest,
  RestoreBackupRequest,
} from '../types/backup.types'

/**
 * 备份管理 Hook
 * 管理备份配置、历史记录、创建、恢复、删除等操作
 */
export function useBackupManagement() {
  const queryClient = useQueryClient()

  // 获取备份管理数据
  const { data, isLoading, error } = useQuery<BackupManagementResponse>({
    queryKey: ['backupManagement'],
    queryFn: backupApi.getBackupManagement,
    staleTime: 1000 * 60 * 5, // 5分钟内数据视为新鲜
  })

  // 本地状态（配置部分）
  const [config, setConfig] = useState<BackupConfig>({
    autoBackupEnabled: false,
    backupFrequency: 'daily',
    backupTime: '02:00',
    retentionDays: 30,
    backupPath: '/data/backups',
    includeDatabase: true,
    includeFiles: false,
    compressBackup: true,
  })

  // 脏数据检查
  const [isDirty, setIsDirty] = useState(false)

  // 同步服务器数据到本地状态
  useEffect(() => {
    if (data?.config) {
      // 当前后端暂未实现文件备份/恢复能力，前端强制关闭该选项，避免产生误导。
      setConfig({ ...data.config, includeFiles: false })
      setIsDirty(false)
    }
  }, [data])

  // 更新配置字段
  const updateConfig = useCallback((field: keyof BackupConfig, value: any) => {
    setConfig((prev) => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }, [])

  // 保存配置 mutation
  const saveMutation = useMutation({
    mutationFn: () => backupApi.saveAll(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backupManagement'] })
      setIsDirty(false)
    },
  })

  // 创建备份 mutation
  const createBackupMutation = useMutation({
    mutationFn: (request: CreateBackupRequest) => backupApi.createBackup(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backupManagement'] })
    },
  })

  // 恢复备份 mutation
  const restoreBackupMutation = useMutation({
    mutationFn: (request: RestoreBackupRequest) => backupApi.restoreBackup(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backupManagement'] })
    },
  })

  // 删除备份 mutation
  const deleteBackupMutation = useMutation({
    mutationFn: (backupId: string) => backupApi.deleteBackup(backupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backupManagement'] })
    },
  })

  // 保存所有配置
  const saveAll = useCallback(async () => {
    await saveMutation.mutateAsync()
  }, [saveMutation])

  // 重置为服务器数据
  const resetAll = useCallback(() => {
    if (data?.config) {
      setConfig({ ...data.config, includeFiles: false })
      setIsDirty(false)
    }
  }, [data])

  // 创建备份
  const createBackup = useCallback(
    async (request: CreateBackupRequest = {}) => {
      await createBackupMutation.mutateAsync(request)
    },
    [createBackupMutation]
  )

  // 恢复备份
  const restoreBackup = useCallback(
    async (request: RestoreBackupRequest) => {
      await restoreBackupMutation.mutateAsync(request)
    },
    [restoreBackupMutation]
  )

  // 删除备份
  const deleteBackup = useCallback(
    async (backupId: string) => {
      await deleteBackupMutation.mutateAsync(backupId)
    },
    [deleteBackupMutation]
  )

  // 下载备份
  const downloadBackup = useCallback(async (backupId: string, fileName: string) => {
    await backupApi.downloadBackup(backupId, fileName)
  }, [])

  return {
    // 数据
    config,
    backups: data?.backups || [],
    totalCount: data?.totalCount || 0,
    diskUsage: data?.diskUsage || { used: 0, total: 0, percentage: 0 },

    // 状态
    isLoading,
    isSaving: saveMutation.isPending,
    isCreating: createBackupMutation.isPending,
    isRestoring: restoreBackupMutation.isPending,
    isDeleting: deleteBackupMutation.isPending,
    isDirty,
    error,

    // 配置更新方法
    updateConfig,

    // 操作方法
    saveAll,
    resetAll,
    createBackup,
    restoreBackup,
    deleteBackup,
    downloadBackup,
  }
}
