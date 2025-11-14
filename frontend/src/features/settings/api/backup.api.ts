import { httpClient, TokenManager } from '@/lib/api-client'
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
    // 转换 camelCase 为 snake_case
    const snakeCaseData: Record<string, any> = {}
    Object.entries(data).forEach(([key, value]) => {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
      snakeCaseData[snakeKey] = value
    })

    await httpClient.put('/settings/backup/config', snakeCaseData)
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
   * ✅ 修复: 添加 /v1 版本号前缀
   */
  downloadBackup: async (backupId: string, fileName: string): Promise<void> => {
    const response = await fetch(`/api/v1/settings/backup/${backupId}/download`, {
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
    const snakeCaseData = {
      auto_backup_enabled: config.autoBackupEnabled,
      backup_frequency: config.backupFrequency,
      backup_time: config.backupTime,
      retention_days: config.retentionDays,
      backup_path: config.backupPath,
      include_database: config.includeDatabase,
      include_files: config.includeFiles,
      compress_backup: config.compressBackup,
    }

    await httpClient.put('/settings/backup/config', snakeCaseData)
  },
}
