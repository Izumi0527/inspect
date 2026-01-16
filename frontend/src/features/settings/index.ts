// 主要组件导出
export { SettingsView } from './components/SettingsView'
export { SystemConfiguration } from './components/SystemConfiguration'
export { UserManagement } from './components/UserManagement'
export { SecuritySettings } from './components/SecuritySettings'
export { AuditLogs } from './components/AuditLogs'
export { BackupRestore } from './components/BackupRestore'
export { NotificationSettings } from './components/NotificationSettings'
export { SystemMonitoring } from './components/SystemMonitoring'

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
