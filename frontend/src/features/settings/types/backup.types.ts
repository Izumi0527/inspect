// 备份配置
export interface BackupConfig {
  autoBackupEnabled: boolean // 是否启用自动备份
  backupFrequency: 'daily' | 'weekly' | 'monthly' // 备份频率
  backupTime: string // 备份时间（HH:mm格式）
  retentionDays: number // 备份保留天数
  backupPath: string // 备份存储路径
  includeDatabase: boolean // 包含数据库
  includeFiles: boolean // 包含文件
  compressBackup: boolean // 压缩备份
}

// 备份记录
export interface BackupRecord {
  id: string
  fileName: string
  filePath: string
  fileSize: number // 字节
  backupType: 'auto' | 'manual' // 备份类型
  status: 'success' | 'failed' | 'in_progress' // 备份状态
  createdAt: string // ISO 8601格式
  createdBy: string // 创建者
  duration: number // 备份耗时（秒）
  errorMessage?: string // 错误信息（如果失败）
}

// 完整的备份管理响应
export interface BackupManagementResponse {
  config: BackupConfig
  backups: BackupRecord[]
  totalCount: number
  diskUsage: {
    used: number // 已使用空间（字节）
    total: number // 总空间（字节）
    percentage: number // 使用百分比
  }
}

// 更新备份配置请求
export interface UpdateBackupConfigRequest {
  autoBackupEnabled?: boolean
  backupFrequency?: 'daily' | 'weekly' | 'monthly'
  backupTime?: string
  retentionDays?: number
  backupPath?: string
  includeDatabase?: boolean
  includeFiles?: boolean
  compressBackup?: boolean
}

// 创建备份请求
export interface CreateBackupRequest {
  includeDatabase?: boolean
  includeFiles?: boolean
  description?: string
}

// 恢复备份请求
export interface RestoreBackupRequest {
  backupId: string
  restoreDatabase?: boolean
  restoreFiles?: boolean
}

// 备份统计
export interface BackupStats {
  totalBackups: number
  successfulBackups: number
  failedBackups: number
  totalSize: number // 总大小（字节）
  lastBackupTime: string | null
  lastBackupStatus: 'success' | 'failed' | null
}
