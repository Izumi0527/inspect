// 主要组件导出
export { SettingsView } from './components/SettingsView'
export { GeneralSettings as SystemConfiguration } from './components/general/GeneralSettings'
export { UserManagement } from './components/users/UserManagement'
export { SecuritySettings } from './components/security/SecuritySettings'
export { AuditLogs } from './components/audit/AuditLogs'
export { BackupManagement as BackupRestore } from './components/backup/BackupManagement'
export { NotificationSettings } from './components/notifications/NotificationSettings'
export { MonitoringDashboard as SystemMonitoring } from './components/monitoring/MonitoringDashboard'

// API服务导出
export {
  systemConfigApi,
  userManagementApi,
  roleManagementApi,
  auditLogApi,
  backupApi,
  systemMonitoringApi,
  notificationApi,
  securityApi
} from './api/settings.api'

// Hooks导出
export {
  useConfigGroups,
  useSystemConfigs,
  useSystemConfig,
  useUpdateConfig,
  useUpdateConfigs,
  useResetConfig,
  useUsers,
  useUser,
  useRoles,
  useRole,
  usePermissions,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  useAuditLogs,
  useAuditLog,
  useExportAuditLogs,
  useCleanupAuditLogs,
  useBackups,
  useBackup,
  useCreateBackup,
  useDeleteBackup,
  useRestoreBackup,
  useSystemMetrics,
  useSystemHealth,
  useSystemInfo,
  useRestartService,
  useClearCache,
  useNotificationConfigs,
  useNotificationConfig,
  useCreateNotificationConfig,
  useUpdateNotificationConfig,
  useDeleteNotificationConfig,
  useTestNotificationConfig,
  useSecuritySettings,
  useUpdateSecuritySettings,
  useSettingsFilters,
  useSettingsEditor
} from './hooks'

// 类型定义导出
export type {
  SystemConfig,
  User,
  Role,
  Permission,
  AuditLog,
  Backup,
  BackupInclude,
  SystemMetrics,
  NotificationConfig,
  EmailConfig,
  SMSConfig,
  WebhookConfig,
  DingtalkConfig,
  WechatConfig,
  SecurityConfig,
  DatabaseConfig,
  CacheConfig,
  SystemInfo,
  License,
  SettingsApiResponse,
  SettingsGroup,
  OperationLog,
  SystemHealth,
  ImportExportConfig
} from './types'
