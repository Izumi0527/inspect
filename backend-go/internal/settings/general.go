package settings

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"
)

type categoryMetadata struct {
	ID          string
	Name        string
	DisplayName string
	Description string
	Icon        string
	Order       int
}

func settingsCategoryMetadata() map[string]categoryMetadata {
	return map[string]categoryMetadata{
		"system": {
			ID:          "system",
			Name:        "system",
			DisplayName: "系统设置",
			Description: "基础系统配置",
			Icon:        "Settings",
			Order:       1,
		},
		"notification": {
			ID:          "notification",
			Name:        "notification",
			DisplayName: "通知设置",
			Description: "通知相关配置",
			Icon:        "Bell",
			Order:       2,
		},
		"email": {
			ID:          "email",
			Name:        "email",
			DisplayName: "邮件设置",
			Description: "SMTP邮件服务器配置",
			Icon:        "Mail",
			Order:       3,
		},
		"inspection": {
			ID:          "inspection",
			Name:        "inspection",
			DisplayName: "巡检设置",
			Description: "设备巡检相关配置",
			Icon:        "Search",
			Order:       4,
		},
		"report": {
			ID:          "report",
			Name:        "report",
			DisplayName: "报表设置",
			Description: "报表导出相关配置",
			Icon:        "FileText",
			Order:       5,
		},
		"security": {
			ID:          "security",
			Name:        "security",
			DisplayName: "安全设置",
			Description: "安全策略配置",
			Icon:        "Shield",
			Order:       6,
		},
		"backup": {
			ID:          "backup",
			Name:        "backup",
			DisplayName: "备份设置",
			Description: "系统备份相关配置",
			Icon:        "Database",
			Order:       7,
		},
		"user_preference": {
			ID:          "user_preference",
			Name:        "user_preference",
			DisplayName: "用户偏好",
			Description: "用户个人偏好设置",
			Icon:        "User",
			Order:       8,
		},
	}
}

func (s *Service) ListSettings(ctx context.Context, category string) ([]SettingItem, error) {
	if !s.isReady() {
		return nil, fmt.Errorf("database not initialized")
	}

	query := s.db.WithContext(ctx).Model(&SystemSetting{})
	if strings.TrimSpace(category) != "" {
		query = query.Where("category = ?", strings.TrimSpace(category))
	}

	var rows []SystemSetting
	if err := query.Order("key").Find(&rows).Error; err != nil {
		return nil, err
	}

	items := make([]SettingItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, buildSettingItem(row))
	}

	return items, nil
}

func (s *Service) GetSetting(ctx context.Context, key string) (*SettingItem, error) {
	if !s.isReady() {
		return nil, fmt.Errorf("database not initialized")
	}
	value := strings.TrimSpace(key)
	if value == "" {
		return nil, gorm.ErrRecordNotFound
	}

	var row SystemSetting
	if err := s.db.WithContext(ctx).
		Where("key = ?", value).
		Take(&row).Error; err != nil {
		return nil, err
	}

	item := buildSettingItem(row)
	return &item, nil
}

func (s *Service) UpsertSetting(ctx context.Context, key string, value interface{}, updatedBy string) (*SettingItem, error) {
	if !s.isReady() {
		return nil, fmt.Errorf("database not initialized")
	}
	cleanKey := strings.TrimSpace(key)
	if cleanKey == "" {
		return nil, fmt.Errorf("key is required")
	}

	var setting SystemSetting
	err := s.db.WithContext(ctx).
		Where("key = ?", cleanKey).
		Take(&setting).Error
	if err != nil && !errorsIsRecordNotFound(err) {
		return nil, err
	}

	dataType := strings.TrimSpace(setting.DataType)
	if dataType == "" {
		dataType = inferDataType(value)
	}
	formatted, err := formatSettingValue(value, dataType)
	if err != nil {
		return nil, err
	}

	valueToStore := interface{}(nil)
	if formatted != nil {
		valueToStore = *formatted
	}

	now := time.Now().UTC()
	if errorsIsRecordNotFound(err) {
		setting = SystemSetting{
			Key:         cleanKey,
			Category:    normalizeCategoryFromKey(cleanKey),
			Level:       "system",
			Description: nil,
			DataType:    dataType,
			IsRequired:  false,
			IsEncrypted: false,
			IsReadonly:  false,
			Value:       formatted,
			UpdatedBy:   emptyToNil(updatedBy),
			CreatedAt:   &now,
			UpdatedAt:   &now,
		}
		if err := s.db.WithContext(ctx).Create(&setting).Error; err != nil {
			return nil, err
		}
	} else {
		if setting.IsReadonly {
			return nil, fmt.Errorf("setting is readonly")
		}
		updates := map[string]interface{}{
			"value":      valueToStore,
			"data_type":  dataType,
			"updated_at": now,
		}
		if trimmed := strings.TrimSpace(updatedBy); trimmed != "" {
			updates["updated_by"] = trimmed
		}
		if err := s.db.WithContext(ctx).
			Model(&SystemSetting{}).
			Where("key = ?", cleanKey).
			Updates(updates).Error; err != nil {
			return nil, err
		}
	}

	return s.GetSetting(ctx, cleanKey)
}

func (s *Service) BulkUpdateSettings(ctx context.Context, settings map[string]interface{}, updatedBy string) (BulkUpdateResponse, error) {
	if !s.isReady() {
		return BulkUpdateResponse{}, fmt.Errorf("database not initialized")
	}
	if settings == nil {
		return BulkUpdateResponse{}, fmt.Errorf("settings is required")
	}

	updatedCount := 0
	failedKeys := make([]string, 0)

	for key, value := range settings {
		if _, err := s.UpsertSetting(ctx, key, value, updatedBy); err != nil {
			failedKeys = append(failedKeys, key)
			continue
		}
		updatedCount++
	}

	message := fmt.Sprintf("成功更新 %d 个配置项", updatedCount)
	if len(failedKeys) > 0 {
		message = fmt.Sprintf("成功更新 %d 个配置项，失败 %d 个", updatedCount, len(failedKeys))
	}

	return BulkUpdateResponse{
		UpdatedCount: updatedCount,
		FailedKeys:   failedKeys,
		Message:      message,
	}, nil
}

func (s *Service) ResetSetting(ctx context.Context, key string, updatedBy string) (bool, error) {
	if !s.isReady() {
		return false, fmt.Errorf("database not initialized")
	}
	cleanKey := strings.TrimSpace(key)
	if cleanKey == "" {
		return false, fmt.Errorf("key is required")
	}

	var setting SystemSetting
	if err := s.db.WithContext(ctx).Where("key = ?", cleanKey).Take(&setting).Error; err != nil {
		return false, err
	}

	if setting.DefaultValue == nil {
		return false, nil
	}
	updates := map[string]interface{}{
		"value":      *setting.DefaultValue,
		"updated_at": time.Now().UTC(),
	}
	if trimmed := strings.TrimSpace(updatedBy); trimmed != "" {
		updates["updated_by"] = trimmed
	}

	if err := s.db.WithContext(ctx).Model(&SystemSetting{}).Where("key = ?", cleanKey).Updates(updates).Error; err != nil {
		return false, err
	}

	return true, nil
}

func (s *Service) ExportConfig(ctx context.Context) (ExportConfigResponse, error) {
	items, err := s.ListSettings(ctx, "")
	if err != nil {
		return ExportConfigResponse{}, err
	}

	config := make(map[string]interface{})
	for _, item := range items {
		config[item.Key] = map[string]interface{}{
			"value":       item.Value,
			"category":    item.Category,
			"type":        item.Type,
			"description": item.Description,
		}
	}

	return ExportConfigResponse{
		ConfigData: config,
		ExportTime: time.Now().UTC(),
		TotalCount: len(config),
	}, nil
}

func (s *Service) ImportConfig(ctx context.Context, configData map[string]interface{}, overwrite bool, updatedBy string) (ImportConfigResponse, error) {
	if !s.isReady() {
		return ImportConfigResponse{}, fmt.Errorf("database not initialized")
	}

	imported := 0
	skipped := 0
	failed := make([]string, 0)

	for key, raw := range configData {
		if !overwrite {
			if _, err := s.GetSetting(ctx, key); err == nil {
				skipped++
				continue
			}
		}

		value := raw
		if payload, ok := raw.(map[string]interface{}); ok {
			if inner, exists := payload["value"]; exists {
				value = inner
			}
		}

		if _, err := s.UpsertSetting(ctx, key, value, updatedBy); err != nil {
			failed = append(failed, key)
			continue
		}
		imported++
	}

	message := fmt.Sprintf("成功导入 %d 个配置项", imported)
	if skipped > 0 {
		message += fmt.Sprintf("，跳过 %d 个", skipped)
	}
	if len(failed) > 0 {
		message += fmt.Sprintf("，失败 %d 个", len(failed))
	}

	return ImportConfigResponse{
		ImportedCount: imported,
		SkippedCount:  skipped,
		FailedKeys:    failed,
		Message:       message,
	}, nil
}

func (s *Service) ListSettingGroups(ctx context.Context, includeConfigs bool) ([]SettingGroup, error) {
	metadata := settingsCategoryMetadata()
	keys := make([]string, 0, len(metadata))
	for key := range metadata {
		keys = append(keys, key)
	}

	sort.Slice(keys, func(i, j int) bool {
		return metadata[keys[i]].Order < metadata[keys[j]].Order
	})

	groups := make([]SettingGroup, 0, len(keys))
	for _, key := range keys {
		meta := metadata[key]
		group := SettingGroup{
			ID:          meta.ID,
			Name:        meta.Name,
			DisplayName: meta.DisplayName,
			Description: meta.Description,
			Icon:        meta.Icon,
			Order:       meta.Order,
			Configs:     []SettingDetails{},
		}

		if includeConfigs {
			items, err := s.ListSettings(ctx, key)
			if err != nil {
				return nil, err
			}
			for _, item := range items {
				var rule *string
				switch value := item.Validation.(type) {
				case *string:
					rule = value
				case string:
					rule = &value
				}
				group.Configs = append(group.Configs, SettingDetails{
					ID:          generateSettingID(item.Key),
					Key:         item.Key,
					Value:       item.Value,
					Category:    key,
					Type:        item.Type,
					Label:       generateSettingLabel(item.Key),
					Description: item.Description,
					Required:    item.Required,
					Readonly:    isSettingReadonly(item.Key),
					Validation:  parseValidationRule(rule, item.Type),
					UpdatedAt:   item.UpdatedAt,
					UpdatedBy:   item.UpdatedBy,
				})
			}
		}

		groups = append(groups, group)
	}

	return groups, nil
}

func (s *Service) GetSystemInfo(ctx context.Context) (SystemInfoResponse, error) {
	appName := s.getSettingValue(ctx, "system.application_name", "网络设备巡检系统")
	version := s.getSettingValue(ctx, "system.version", "1.0.0")
	timezone := s.getSettingValue(ctx, "system.timezone", "Asia/Shanghai")

	var lastBackup *time.Time
	var backup SystemBackup
	if err := s.db.WithContext(ctx).
		Where("status = ?", "completed").
		Order("created_at desc").
		Take(&backup).Error; err == nil {
		lastBackup = backup.CreatedAt
	}

	return SystemInfoResponse{
		ApplicationName: appName,
		Version:         version,
		Timezone:        timezone,
		LastBackup:      lastBackup,
	}, nil
}

func (s *Service) getSettingValue(ctx context.Context, key string, fallback string) string {
	item, err := s.GetSetting(ctx, key)
	if err != nil || item == nil {
		return fallback
	}
	if item.Value == nil {
		return fallback
	}
	if text, ok := item.Value.(string); ok && strings.TrimSpace(text) != "" {
		return text
	}
	return fallback
}

func buildSettingItem(row SystemSetting) SettingItem {
	dataType := strings.TrimSpace(row.DataType)
	if dataType == "" {
		dataType = "string"
	}

	item := SettingItem{
		Key:         row.Key,
		Value:       parseSettingValue(row.Value, dataType),
		Category:    row.Category,
		Type:        dataType,
		Label:       safeString(row.Description),
		Description: row.Description,
		Required:    row.IsRequired,
		Readonly:    row.IsReadonly,
		UpdatedAt:   row.UpdatedAt,
		UpdatedBy:   row.UpdatedBy,
	}

	if row.ValidationRule != nil {
		item.Validation = row.ValidationRule
	}

	return item
}

func emptyToNil(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func errorsIsRecordNotFound(err error) bool {
	return err != nil && errors.Is(err, gorm.ErrRecordNotFound)
}
