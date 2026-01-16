package handlers

import (
	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

type SettingsHandler struct {
	Service *settings.Service
	Auth    *auth.Service
}

func (h SettingsHandler) Register(group *echo.Group) {
	group.GET("/settings/health", h.GetSettingsHealth)

	group.GET("/settings/general", h.GetGeneralConfigs)
	group.GET("/settings/general/stats", h.GetGeneralStats)
	group.GET("/settings/general/settings", h.GetAllSettings)
	group.GET("/settings/general/settings/:key", h.GetSetting)
	group.PUT("/settings/general/settings/:key", h.UpdateSetting)
	group.POST("/settings/general/settings/bulk", h.BulkUpdateSettings)
	group.POST("/settings/general/settings/:key/reset", h.ResetSetting)
	group.GET("/settings/general/categories", h.GetSettingCategories)
	group.GET("/settings/general/export", h.ExportConfig)
	group.POST("/settings/general/import", h.ImportConfig)
	group.GET("/settings/general/info", h.GetSystemInfo)

	group.PUT("/settings/general/:key", h.UpdateSettingAlias)
	group.POST("/settings/general/bulk", h.BulkUpdateSettingsAlias)

	group.GET("/settings/notifications", h.GetNotificationConfigs)
	group.GET("/settings/notifications/", h.GetNotificationConfigs)
	group.GET("/settings/notifications/stats", h.GetNotificationStats)
	group.POST("/settings/notifications/test-email", h.TestEmail)
	group.POST("/settings/notifications/test-sms", h.TestSMS)
	group.POST("/settings/notifications/test-webhook", h.TestWebhook)

	group.GET("/settings/security", h.GetSecurityConfigs)
	group.GET("/settings/security/", h.GetSecurityConfigs)
	group.GET("/settings/security/stats", h.GetSecurityStats)
	group.GET("/settings/security/sessions", h.GetSessions)

	group.GET("/settings/license", h.GetLicense)

	group.GET("/settings/backup/management", h.GetBackupManagement)
	group.GET("/settings/backup/config", h.GetBackupConfig)
	group.PUT("/settings/backup/config", h.UpdateBackupConfig)
	group.GET("/settings/backup/stats", h.GetBackupStats)
	group.GET("/settings/backup/history", h.GetBackupHistory)
	group.POST("/settings/backup/create", h.CreateBackup)
	group.POST("/settings/backup/restore", h.RestoreBackup)
	group.DELETE("/settings/backup/:backup_id", h.DeleteBackup)
	group.GET("/settings/backup/:backup_id/download", h.DownloadBackup)

	group.POST("/settings/backup/:backup_id/restore", h.RestoreBackupAlias)
	group.POST("/settings/backup/:backup_id/validate", h.ValidateBackup)
	group.POST("/settings/backup", h.CreateBackupAlias)

	group.GET("/settings/monitoring/current", h.GetCurrentMonitoring)
	group.GET("/settings/monitoring/history", h.GetMonitoringHistory)

	group.GET("/settings/audit/logs", h.GetAuditLogs)
	group.GET("/settings/audit/logs/:log_id", h.GetAuditLog)
	group.GET("/settings/audit/stats", h.GetAuditStats)
	group.DELETE("/settings/audit/cleanup", h.CleanupAuditLogs)
	group.POST("/settings/audit/logs/export", h.ExportAuditLogs)

	group.GET("/settings/users", h.GetUsers)
	group.GET("/settings/users/stats", h.GetUserStats)
	group.GET("/settings/users/:user_id", h.GetUser)
	group.POST("/settings/users", h.CreateUser)
	group.PUT("/settings/users/:user_id", h.UpdateUser)
	group.DELETE("/settings/users/:user_id", h.DeleteUser)
	group.POST("/settings/users/:user_id/change-password", h.ChangeUserPassword)
	group.POST("/settings/users/:user_id/activate", h.ActivateUser)
	group.POST("/settings/users/:user_id/deactivate", h.DeactivateUser)
	group.POST("/settings/users/:user_id/lock", h.LockUser)
	group.POST("/settings/users/:user_id/unlock", h.UnlockUser)
	group.POST("/settings/users/batch", h.BatchUsers)
	group.POST("/settings/users/bulk", h.BatchUsersAlias)
	group.POST("/settings/users/bulk-operation", h.BatchUsersLegacy)
	group.POST("/settings/users/import", h.ImportUsers)
	group.GET("/settings/users/:user_id/permissions", h.GetUserPermissions)

	group.GET("/settings/roles", h.GetRoles)
	group.GET("/settings/roles/:role_id", h.GetRole)
	group.POST("/settings/roles", h.CreateRole)
	group.PUT("/settings/roles/:role_id", h.UpdateRole)
	group.DELETE("/settings/roles/:role_id", h.DeleteRole)
	group.POST("/settings/roles/:role_id/permissions", h.AssignRolePermissions)
	group.GET("/settings/permissions", h.GetPermissions)

	group.GET("/system/info", h.GetSystemInfo)
	group.GET("/system/settings", h.GetAllSettings)
	group.PUT("/system/settings", h.SystemSettingsUpdate)
	group.POST("/system/backup", h.CreateBackupAlias)
	group.POST("/system/restore", h.ImportBackupFile)
}
