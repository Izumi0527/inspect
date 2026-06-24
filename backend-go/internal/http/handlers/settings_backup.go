package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

func (h SettingsHandler) GetBackupManagement(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	resp, err := h.Service.GetBackupManagement(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取备份管理数据失败")
	}
	return c.JSON(http.StatusOK, resp)
}

func (h SettingsHandler) GetBackupConfig(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	config, err := h.Service.GetBackupConfig(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取备份配置失败")
	}
	return c.JSON(http.StatusOK, config)
}

func (h SettingsHandler) UpdateBackupConfig(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	config := settings.BackupConfig{
		AutoBackupEnabled: readBoolWithDefault(payload, "autoBackupEnabled", "auto_backup_enabled", false),
		BackupFrequency:   readStringWithDefault(payload, "backupFrequency", "backup_frequency", "daily"),
		BackupTime:        readStringWithDefault(payload, "backupTime", "backup_time", "02:00"),
		RetentionDays:     readIntWithDefault(payload, "retentionDays", "retention_days", 30),
		BackupPath:        readStringWithDefault(payload, "backupPath", "backup_path", "data/backups"),
		IncludeDatabase:   readBoolWithDefault(payload, "includeDatabase", "include_database", true),
		IncludeFiles:      readBoolWithDefault(payload, "includeFiles", "include_files", false),
		CompressBackup:    readBoolWithDefault(payload, "compressBackup", "compress_backup", true),
	}

	user, _ := requirePermission(c, h.Auth, "")
	updatedBy := ""
	if user != nil {
		updatedBy = user.ID
	}

	if err := h.Service.UpdateBackupConfig(c.Request().Context(), config, updatedBy); err != nil {
		var notImpl settings.NotImplementedError
		if errors.As(err, &notImpl) {
			return echo.NewHTTPError(http.StatusNotImplemented, err.Error())
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "更新备份配置失败")
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"success": true, "message": "配置已更新"})
}

func (h SettingsHandler) GetBackupStats(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	stats, err := h.Service.GetBackupStats(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取备份统计失败")
	}
	return c.JSON(http.StatusOK, stats)
}

func (h SettingsHandler) GetBackupHistory(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	page, _ := strconv.Atoi(c.QueryParam("page"))
	pageSize, _ := strconv.Atoi(c.QueryParam("page_size"))

	items, total, err := h.Service.ListBackupHistory(c.Request().Context(), page, pageSize)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取备份历史失败")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"backups":     items,
		"total_count": total,
	})
}

func (h SettingsHandler) CreateBackup(c echo.Context) error {
	return h.createBackupInternal(c)
}

func (h SettingsHandler) CreateBackupAlias(c echo.Context) error {
	return h.createBackupInternal(c)
}

func (h SettingsHandler) createBackupInternal(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	_ = c.Bind(&payload)

	includeDatabase := readBoolWithDefault(payload, "includeDatabase", "include_database", true)
	includeFiles := readBoolWithDefault(payload, "includeFiles", "include_files", false)
	description := readString(payload, "description")
	var descPtr *string
	if strings.TrimSpace(description) != "" {
		descPtr = &description
	}

	user, _ := requirePermission(c, h.Auth, "")
	createdBy := ""
	if user != nil {
		createdBy = user.ID
	}

	record, err := h.Service.CreateBackup(c.Request().Context(), includeDatabase, includeFiles, descPtr, createdBy)
	if err != nil {
		var notImpl settings.NotImplementedError
		if errors.As(err, &notImpl) {
			return echo.NewHTTPError(http.StatusNotImplemented, err.Error())
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, record)
}

func (h SettingsHandler) RestoreBackup(c echo.Context) error {
	return h.restoreBackupInternal(c, "")
}

func (h SettingsHandler) RestoreBackupAlias(c echo.Context) error {
	return h.restoreBackupInternal(c, c.Param("backup_id"))
}

func (h SettingsHandler) restoreBackupInternal(c echo.Context, backupID string) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	_ = c.Bind(&payload)

	if backupID == "" {
		backupID = readString(payload, "backup_id", "backupId")
	}

	restoreDatabase := readBoolWithDefault(payload, "restoreDatabase", "restore_database", false)
	restoreFiles := readBoolWithDefault(payload, "restoreFiles", "restore_files", false)

	if strings.TrimSpace(backupID) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "backup_id is required")
	}

	user, _ := requirePermission(c, h.Auth, "")
	updatedBy := ""
	if user != nil {
		updatedBy = user.ID
	}

	if err := h.Service.RestoreBackup(c.Request().Context(), backupID, restoreDatabase, restoreFiles, updatedBy); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "备份不存在")
		}
		var notImpl settings.NotImplementedError
		if errors.As(err, &notImpl) {
			return echo.NewHTTPError(http.StatusNotImplemented, err.Error())
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, map[string]interface{}{"success": true, "message": "备份恢复完成"})
}

func (h SettingsHandler) DeleteBackup(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	backupID := c.Param("backup_id")
	if strings.TrimSpace(backupID) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "backup_id is required")
	}

	if err := h.Service.DeleteBackup(c.Request().Context(), backupID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, map[string]interface{}{"success": true, "message": "备份已删除"})
}

func (h SettingsHandler) DownloadBackup(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	backupID := c.Param("backup_id")
	if strings.TrimSpace(backupID) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "backup_id is required")
	}

	record, err := h.Service.GetBackupRecord(c.Request().Context(), backupID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "备份不存在")
	}

	if record.FilePath == "" {
		return echo.NewHTTPError(http.StatusNotFound, "备份文件不存在")
	}

	safePath, err := settings.ResolveBackupPath(record.FilePath)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "备份文件不存在")
	}

	return c.Attachment(safePath, record.FileName)
}

func (h SettingsHandler) ValidateBackup(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	backupID := c.Param("backup_id")
	if strings.TrimSpace(backupID) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "backup_id is required")
	}

	valid, issues, err := h.Service.ValidateBackup(c.Request().Context(), backupID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "备份不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "备份校验失败")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{"valid": valid, "issues": issues})
}

func (h SettingsHandler) ImportBackupFile(c echo.Context) error {
	return h.ImportConfig(c)
}

func readBoolWithDefault(payload map[string]interface{}, keyA string, keyB string, fallback bool) bool {
	if value, ok := readBool(payload, keyA, keyB); ok {
		return value
	}
	return fallback
}

func readIntWithDefault(payload map[string]interface{}, keyA string, keyB string, fallback int) int {
	if value, ok := readInt(payload, keyA, keyB); ok {
		return value
	}
	return fallback
}

func readStringWithDefault(payload map[string]interface{}, keyA string, keyB string, fallback string) string {
	if value := readString(payload, keyA, keyB); value != "" {
		return value
	}
	return fallback
}
