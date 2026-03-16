import { API_PREFIX, getApiOrigin, httpClient, TokenManager } from '@/lib/api-client'
import type {
  BackupConfig,
  BackupManagementResponse,
  BackupRecord,
  BackupStats,
  UpdateBackupConfigRequest,
  CreateBackupRequest,
  RestoreBackupRequest,
} from '../types/backup.types'

/**
 * 备份管理 API
 * 提供备份配置、历史记录、创建、恢复、删除、下载等功能
 */
export const backupApi = {
  /**
   * 获取备份管理数据（配置 + 历史记录 + 磁盘使用情况）
   */
  getBackupManagement: async (): Promise<BackupManagementResponse> => {
    const response = await httpClient.get<BackupManagementResponse>('/settings/backup/management')
    return response
  },

  /**
   * 获取备份配置
   */
  getBackupConfig: async (): Promise<BackupConfig> => {
    const response = await httpClient.get<BackupConfig>('/settings/backup/config')
    return response
  },

  /**
   * 更新备份配置
   */
  updateBackupConfig: async (data: UpdateBackupConfigRequest): Promise<void> => {
    // 后端已使用 camelCase，直接发送
    await httpClient.put('/settings/backup/config', data)
  },

  /**
   * 获取备份历史记录
   * @param page 页码（从1开始）
   * @param pageSize 每页数量
   */
  getBackupHistory: async (page: number = 1, pageSize: number = 20): Promise<{
    backups: BackupRecord[]
    totalCount: number
  }> => {
    const response = await httpClient.get<{
      backups: BackupRecord[]
      total_count: number
    }>('/settings/backup/history', {
      params: { page, page_size: pageSize },
    })

    return {
      backups: response.backups,
      totalCount: response.total_count,
    }
  },

  /**
   * 创建备份（手动备份）
   */
  createBackup: async (request: CreateBackupRequest = {}): Promise<BackupRecord> => {
    const snakeCaseData = {
      include_database: request.includeDatabase,
      include_files: request.includeFiles,
      description: request.description,
    }

    const response = await httpClient.post<BackupRecord>('/settings/backup/create', snakeCaseData)
    return response
  },

  /**
   * 恢复备份
   */
  restoreBackup: async (request: RestoreBackupRequest): Promise<void> => {
    const snakeCaseData = {
      backup_id: request.backupId,
      restore_database: request.restoreDatabase,
      restore_files: request.restoreFiles,
    }

    await httpClient.post('/settings/backup/restore', snakeCaseData)
  },

  /**
   * 删除备份
   */
  deleteBackup: async (backupId: string): Promise<void> => {
    await httpClient.delete(`/settings/backup/${backupId}`)
  },

  /**
   * 下载备份文件
   * ✅ 兼容前后端分离部署：使用 NEXT_PUBLIC_API_URL 走后端绝对地址
   */
  downloadBackup: async (backupId: string, fileName: string): Promise<void> => {
    const response = await fetch(`${getApiOrigin()}${API_PREFIX}/settings/backup/${backupId}/download`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${TokenManager.getAccessToken() || ''}`,
      },
    })

    if (!response.ok) {
      throw new Error('下载备份文件失败')
    }

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  },

  /**
   * 获取备份统计信息
   */
  getBackupStats: async (): Promise<BackupStats> => {
    const response = await httpClient.get<{
      total_backups: number
      successful_backups: number
      failed_backups: number
      total_size: number
      last_backup_time: string | null
      last_backup_status: 'success' | 'failed' | null
    }>('/settings/backup/stats')

    return {
      totalBackups: response.total_backups,
      successfulBackups: response.successful_backups,
      failedBackups: response.failed_backups,
      totalSize: response.total_size,
      lastBackupTime: response.last_backup_time,
      lastBackupStatus: response.last_backup_status,
    }
  },

  /**
   * 批量保存所有配置（备份配置）
   */
  saveAll: async (config: BackupConfig): Promise<void> => {
    // 后端已使用 camelCase，直接发送
    await httpClient.put('/settings/backup/config', config)
  },
}
