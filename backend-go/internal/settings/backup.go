package settings

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
)

func (s *Service) GetBackupConfig(ctx context.Context) (BackupConfig, error) {
	cfg := BackupConfig{
		AutoBackupEnabled: s.getSettingBool(ctx, "backup.auto_backup_enabled", false),
		BackupFrequency:   s.getSettingString(ctx, "backup.frequency", "daily"),
		BackupTime:        s.getSettingString(ctx, "backup.time", "02:00"),
		RetentionDays:     s.getSettingInt(ctx, "backup.retention_days", 30),
		BackupPath:        s.getSettingString(ctx, "backup.path", filepath.ToSlash(filepath.Clean("data/backups"))),
		IncludeDatabase:   s.getSettingBool(ctx, "backup.include_database", true),
		// 当前版本未实现文件备份/恢复能力：对外强制回显为 false，避免误导。
		IncludeFiles:      false,
		CompressBackup:    s.getSettingBool(ctx, "backup.compress_backup", true),
	}
	return cfg, nil
}

func (s *Service) UpdateBackupConfig(ctx context.Context, cfg BackupConfig, updatedBy string) error {
	// 当前版本未实现文件备份/恢复能力：禁止写入“假能力”配置，避免后续误用。
	if cfg.IncludeFiles {
		return NotImplementedError{Message: "暂不支持文件备份/恢复：当前版本仅支持系统配置(settings)与可选数据库快照"}
	}

	updates := map[string]interface{}{
		"backup.auto_backup_enabled": cfg.AutoBackupEnabled,
		"backup.frequency":           cfg.BackupFrequency,
		"backup.time":                cfg.BackupTime,
		"backup.retention_days":      cfg.RetentionDays,
		"backup.path":                cfg.BackupPath,
		"backup.include_database":    cfg.IncludeDatabase,
		"backup.include_files":       false,
		"backup.compress_backup":     cfg.CompressBackup,
	}

	_, err := s.BulkUpdateSettings(ctx, updates, updatedBy)
	return err
}

func (s *Service) GetBackupManagement(ctx context.Context) (BackupManagementResponse, error) {
	config, err := s.GetBackupConfig(ctx)
	if err != nil {
		return BackupManagementResponse{}, err
	}

	backups, total, err := s.listBackupRecords(ctx, 1, 20)
	if err != nil {
		return BackupManagementResponse{}, err
	}

	diskUsage := s.getDiskUsage(config.BackupPath)

	return BackupManagementResponse{
		Config:     config,
		Backups:    backups,
		TotalCount: total,
		DiskUsage:  diskUsage,
	}, nil
}

func (s *Service) ListBackupHistory(ctx context.Context, page int, pageSize int) ([]BackupRecord, int, error) {
	return s.listBackupRecords(ctx, page, pageSize)
}

func (s *Service) GetBackupRecord(ctx context.Context, backupID string) (BackupRecord, error) {
	if !s.isReady() {
		return BackupRecord{}, fmt.Errorf("database not initialized")
	}
	id, err := strconv.Atoi(strings.TrimSpace(backupID))
	if err != nil || id <= 0 {
		return BackupRecord{}, gorm.ErrRecordNotFound
	}

	var record SystemBackup
	if err := s.db.WithContext(ctx).Where("id = ?", id).Take(&record).Error; err != nil {
		return BackupRecord{}, err
	}
	return buildBackupRecord(record), nil
}

func (s *Service) ValidateBackup(ctx context.Context, backupID string) (bool, []string, error) {
	if !s.isReady() {
		return false, nil, fmt.Errorf("database not initialized")
	}

	id := strings.TrimSpace(backupID)
	if id == "" {
		return false, nil, gorm.ErrRecordNotFound
	}
	parsedID, err := strconv.Atoi(id)
	if err != nil || parsedID <= 0 {
		return false, nil, gorm.ErrRecordNotFound
	}

	var record SystemBackup
	if err := s.db.WithContext(ctx).Where("id = ?", parsedID).Take(&record).Error; err != nil {
		return false, nil, err
	}

	issues := make([]string, 0)
	filePath := ""
	if record.FilePath != nil {
		filePath = strings.TrimSpace(*record.FilePath)
	}
	if filePath == "" {
		issues = append(issues, "备份文件路径为空")
		return false, issues, nil
	}

	if _, err := os.Stat(filePath); err != nil {
		issues = append(issues, "备份文件不存在")
		return false, issues, nil
	}

	payload, err := readJSONFile(filePath)
	if err != nil {
		issues = append(issues, "备份文件解析失败")
	} else {
		if _, ok := payload["settings"]; !ok {
			issues = append(issues, "备份数据缺少 settings")
		}
	}

	if record.FileChecksum != nil && strings.TrimSpace(*record.FileChecksum) != "" {
		checksum, err := fileChecksum(filePath)
		if err != nil {
			issues = append(issues, "备份文件校验失败")
		} else if !strings.EqualFold(strings.TrimSpace(*record.FileChecksum), checksum) {
			issues = append(issues, "备份文件校验码不匹配")
		}
	}

	return len(issues) == 0, issues, nil
}

func (s *Service) CreateBackup(ctx context.Context, includeDatabase bool, includeFiles bool, description *string, createdBy string) (BackupRecord, error) {
	if !s.isReady() {
		return BackupRecord{}, fmt.Errorf("database not initialized")
	}
	if includeFiles {
		return BackupRecord{}, NotImplementedError{Message: "暂不支持文件备份：当前仅支持备份系统配置(settings)与可选数据库快照"}
	}

	cfg, _ := s.GetBackupConfig(ctx)
	backupDir := cfg.BackupPath
	if strings.TrimSpace(backupDir) == "" {
		backupDir = "data/backups"
	}

	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		return BackupRecord{}, err
	}

	now := time.Now().UTC()
	backupName := fmt.Sprintf("settings_backup_%s", now.Format("20060102_150405"))
	fileName := fmt.Sprintf("%s.json", backupName)
	filePath := filepath.Join(backupDir, fileName)

	record := SystemBackup{
		BackupName:      backupName,
		BackupType:      "manual",
		Description:     description,
		IncludeDatabase: includeDatabase,
		IncludeSettings: true,
		IncludeLogs:     false,
		IncludeFiles:    includeFiles,
		Status:          "running",
		Progress:        0,
		StartedAt:       &now,
		CreatedBy:       emptyToNil(createdBy),
		CreatedAt:       &now,
		UpdatedAt:       &now,
		RetentionDays:   cfg.RetentionDays,
		AutoDelete:      true,
	}

	if err := s.db.WithContext(ctx).Create(&record).Error; err != nil {
		return BackupRecord{}, err
	}

	payload, err := s.buildBackupPayload(ctx, includeDatabase)
	if err != nil {
		return s.failBackupRecord(ctx, record, err)
	}

	if err := writeJSONFile(filePath, payload); err != nil {
		return s.failBackupRecord(ctx, record, err)
	}

	fileInfo, err := os.Stat(filePath)
	if err != nil {
		return s.failBackupRecord(ctx, record, err)
	}

	checksum, err := fileChecksum(filePath)
	if err != nil {
		return s.failBackupRecord(ctx, record, err)
	}

	completed := time.Now().UTC()
	size := fileInfo.Size()
	record.FilePath = &filePath
	record.FileSize = &size
	record.FileChecksum = &checksum
	record.Status = "completed"
	record.Progress = 100
	record.CompletedAt = &completed
	elapsed := int(completed.Sub(now).Seconds())
	record.DurationSeconds = &elapsed
	record.UpdatedAt = &completed

	if err := s.db.WithContext(ctx).Save(&record).Error; err != nil {
		return BackupRecord{}, err
	}

	return buildBackupRecord(record), nil
}

func (s *Service) RestoreBackup(ctx context.Context, backupID string, restoreDatabase bool, restoreFiles bool, updatedBy string) error {
	if !s.isReady() {
		return fmt.Errorf("database not initialized")
	}

	idText := strings.TrimSpace(backupID)
	if idText == "" {
		return gorm.ErrRecordNotFound
	}
	parsedID, err := strconv.Atoi(idText)
	if err != nil || parsedID <= 0 {
		return gorm.ErrRecordNotFound
	}

	// 当前版本仅支持恢复系统配置(settings)。数据库/文件恢复属于高风险能力，未完成前禁止“静默忽略”。
	if restoreDatabase {
		return NotImplementedError{Message: "暂不支持恢复数据库：当前仅支持恢复系统配置(settings)"}
	}
	if restoreFiles {
		return NotImplementedError{Message: "暂不支持恢复文件：当前仅支持恢复系统配置(settings)"}
	}

	var record SystemBackup
	if err := s.db.WithContext(ctx).Where("id = ?", parsedID).Take(&record).Error; err != nil {
		return err
	}
	if record.FilePath == nil || strings.TrimSpace(*record.FilePath) == "" {
		return fmt.Errorf("backup file not found")
	}

	payload, err := readJSONFile(*record.FilePath)
	if err != nil {
		return err
	}

	settingsData, _ := payload["settings"].(map[string]interface{})
	if settingsData == nil {
		return fmt.Errorf("backup payload missing settings")
	}

	resp, err := s.ImportConfig(ctx, settingsData, true, updatedBy)
	if err != nil {
		return err
	}

	if len(resp.FailedKeys) > 0 {
		return fmt.Errorf("恢复系统配置失败：%d 个配置项导入失败", len(resp.FailedKeys))
	}

	return nil
}

func (s *Service) DeleteBackup(ctx context.Context, backupID string) error {
	if !s.isReady() {
		return fmt.Errorf("database not initialized")
	}

	var record SystemBackup
	if err := s.db.WithContext(ctx).Where("id = ?", backupID).Take(&record).Error; err != nil {
		return err
	}

	if record.FilePath != nil {
		_ = os.Remove(*record.FilePath)
	}

	result := s.db.WithContext(ctx).Where("id = ?", backupID).Delete(&SystemBackup{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (s *Service) GetBackupStats(ctx context.Context) (BackupStats, error) {
	if !s.isReady() {
		return BackupStats{}, fmt.Errorf("database not initialized")
	}

	stats := BackupStats{}

	var total int64
	_ = s.db.WithContext(ctx).Model(&SystemBackup{}).Count(&total).Error
	stats.TotalBackups = int(total)

	var success int64
	_ = s.db.WithContext(ctx).Model(&SystemBackup{}).Where("status = ?", "completed").Count(&success).Error
	stats.SuccessfulBackups = int(success)

	var failed int64
	_ = s.db.WithContext(ctx).Model(&SystemBackup{}).Where("status = ?", "failed").Count(&failed).Error
	stats.FailedBackups = int(failed)

	rows := make([]SystemBackup, 0)
	_ = s.db.WithContext(ctx).
		Where("status = ?", "completed").
		Order("created_at desc").
		Limit(1).
		Find(&rows).Error
	if len(rows) > 0 {
		last := rows[0]
		if last.CreatedAt != nil {
			text := last.CreatedAt.Format(time.RFC3339)
			stats.LastBackupTime = &text
		}
		status := mapBackupStatus(last.Status)
		stats.LastBackupStatus = &status
	}

	stats.TotalSize = s.totalBackupSize(ctx)

	return stats, nil
}

func (s *Service) listBackupRecords(ctx context.Context, page int, pageSize int) ([]BackupRecord, int, error) {
	if !s.isReady() {
		return nil, 0, fmt.Errorf("database not initialized")
	}
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}

	base := s.db.WithContext(ctx).Model(&SystemBackup{})
	var total int64
	if err := base.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var rows []SystemBackup
	if err := base.Order("created_at desc").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&rows).Error; err != nil {
		return nil, 0, err
	}

	result := make([]BackupRecord, 0, len(rows))
	for _, row := range rows {
		result = append(result, buildBackupRecord(row))
	}

	return result, int(total), nil
}

func (s *Service) totalBackupSize(ctx context.Context) int64 {
	var rows []SystemBackup
	_ = s.db.WithContext(ctx).Model(&SystemBackup{}).Where("file_size IS NOT NULL").Find(&rows).Error
	var total int64
	for _, row := range rows {
		if row.FileSize != nil {
			total += *row.FileSize
		}
	}
	return total
}

func (s *Service) buildBackupPayload(ctx context.Context, includeDatabase bool) (map[string]interface{}, error) {
	payload := map[string]interface{}{}
	settings, err := s.ExportConfig(ctx)
	if err != nil {
		return nil, err
	}
	payload["settings"] = settings.ConfigData
	payload["created_at"] = time.Now().UTC().Format(time.RFC3339)
	payload["version"] = s.cfg.AppVersion
	payload["backup_type"] = "settings"

	if includeDatabase {
		payload["database"] = s.exportDatabaseSnapshot(ctx)
	}

	return payload, nil
}

func (s *Service) exportDatabaseSnapshot(ctx context.Context) map[string]interface{} {
	data := map[string]interface{}{}

	var users []User
	_ = s.db.WithContext(ctx).
		Select("id, username, email, full_name, role, is_active, last_login_at, created_at").
		Find(&users).Error
	data["users"] = users

	var roles []Role
	_ = s.db.WithContext(ctx).Select("id, name, display_name, description, is_built_in, created_at").Find(&roles).Error
	data["roles"] = roles

	var perms []Permission
	_ = s.db.WithContext(ctx).Select("id, name, display_name, description, module, action, resource").Find(&perms).Error
	data["permissions"] = perms

	return data
}

func (s *Service) failBackupRecord(ctx context.Context, record SystemBackup, err error) (BackupRecord, error) {
	message := err.Error()
	record.Status = "failed"
	record.ErrorMessage = &message
	now := time.Now().UTC()
	record.UpdatedAt = &now
	_ = s.db.WithContext(ctx).Save(&record).Error
	return BackupRecord{}, err
}

func buildBackupRecord(record SystemBackup) BackupRecord {
	fileName := record.BackupName
	if record.FilePath != nil {
		fileName = filepath.Base(*record.FilePath)
	}

	filePath := ""
	if record.FilePath != nil {
		filePath = *record.FilePath
	}

	fileSize := int64(0)
	if record.FileSize != nil {
		fileSize = *record.FileSize
	}

	createdAt := ""
	if record.CreatedAt != nil {
		createdAt = record.CreatedAt.Format(time.RFC3339)
	}

	createdBy := "system"
	if record.CreatedBy != nil {
		createdBy = *record.CreatedBy
	}

	duration := 0
	if record.DurationSeconds != nil {
		duration = *record.DurationSeconds
	}

	return BackupRecord{
		ID:           fmt.Sprintf("%d", record.ID),
		FileName:     fileName,
		FilePath:     filePath,
		FileSize:     fileSize,
		BackupType:   mapBackupType(record.BackupType),
		Status:       mapBackupStatus(record.Status),
		CreatedAt:    createdAt,
		CreatedBy:    createdBy,
		Duration:     duration,
		ErrorMessage: record.ErrorMessage,
	}
}

func mapBackupType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "manual":
		return "manual"
	default:
		return "auto"
	}
}

func mapBackupStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "completed":
		return "success"
	case "failed", "cancelled":
		return "failed"
	default:
		return "in_progress"
	}
}

func (s *Service) getDiskUsage(path string) DiskUsage {
	if strings.TrimSpace(path) == "" {
		return DiskUsage{}
	}
	usage, err := diskUsage(path)
	if err != nil {
		return DiskUsage{}
	}
	percentage := 0.0
	if usage.Total > 0 {
		percentage = float64(usage.Used) / float64(usage.Total) * 100
	}
	return DiskUsage{
		Used:       usage.Used,
		Total:      usage.Total,
		Percentage: roundFloat(percentage, 2),
	}
}

func (s *Service) getSettingBool(ctx context.Context, key string, fallback bool) bool {
	item, err := s.GetSetting(ctx, key)
	if err != nil || item == nil || item.Value == nil {
		return fallback
	}
	if value, ok := item.Value.(bool); ok {
		return value
	}
	if value, ok := item.Value.(string); ok {
		if parsed, err := strconv.ParseBool(strings.TrimSpace(value)); err == nil {
			return parsed
		}
	}
	return fallback
}

func (s *Service) getSettingString(ctx context.Context, key string, fallback string) string {
	item, err := s.GetSetting(ctx, key)
	if err != nil || item == nil || item.Value == nil {
		return fallback
	}
	if value, ok := item.Value.(string); ok {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return fallback
}

func (s *Service) getSettingInt(ctx context.Context, key string, fallback int) int {
	item, err := s.GetSetting(ctx, key)
	if err != nil || item == nil || item.Value == nil {
		return fallback
	}
	if value, ok := item.Value.(int64); ok {
		return int(value)
	}
	if value, ok := item.Value.(int); ok {
		return value
	}
	if value, ok := item.Value.(float64); ok {
		return int(value)
	}
	if value, ok := item.Value.(string); ok {
		if parsed, err := strconv.Atoi(strings.TrimSpace(value)); err == nil {
			return parsed
		}
	}
	return fallback
}

func writeJSONFile(path string, payload map[string]interface{}) error {
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	return encoder.Encode(payload)
}

func readJSONFile(path string) (map[string]interface{}, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	decoder := json.NewDecoder(file)
	payload := map[string]interface{}{}
	if err := decoder.Decode(&payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func fileChecksum(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()

	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}

	return hex.EncodeToString(hash.Sum(nil)), nil
}
