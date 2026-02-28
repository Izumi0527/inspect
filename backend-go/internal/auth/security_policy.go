package auth

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"
)

type securityPolicy struct {
	SessionTimeoutMinutes       int
	AutoLogoutEnabled           bool
	RememberMeEnabled           bool
	RememberMeDurationDays      int
	MaxConcurrentSessions       int
	ForceLogoutOnPasswordChange bool
	MaxLoginAttempts            int
	LockoutDurationMinutes      int
	PasswordMinLength           int
}

func (s *Service) loadSecurityPolicy(ctx context.Context) securityPolicy {
	// 合理默认值（与前端默认保持一致）
	policy := securityPolicy{
		SessionTimeoutMinutes:       30,
		AutoLogoutEnabled:           true,
		RememberMeEnabled:           true,
		RememberMeDurationDays:      7,
		MaxConcurrentSessions:       3,
		ForceLogoutOnPasswordChange: true,
		MaxLoginAttempts:            5,
		LockoutDurationMinutes:      15,
		PasswordMinLength:           8,
	}

	if !s.isReady() {
		return policy
	}

	keys := []string{
		"security.session.timeout",
		"security.session.auto_logout_enabled",
		"security.session.remember_me_enabled",
		"security.session.remember_me_duration",
		"security.session.max_concurrent_sessions",
		"security.session.force_logout_on_password_change",
		"security.password.min_length",
		"security.password.max_login_attempts",
		"security.password.lockout_duration",
	}
	settings := s.getSettingValues(ctx, keys)

	policy.SessionTimeoutMinutes = clampInt(getSettingIntFromMap(settings, "security.session.timeout", policy.SessionTimeoutMinutes), 5, 1440)
	policy.AutoLogoutEnabled = getSettingBoolFromMap(settings, "security.session.auto_logout_enabled", policy.AutoLogoutEnabled)
	policy.RememberMeEnabled = getSettingBoolFromMap(settings, "security.session.remember_me_enabled", policy.RememberMeEnabled)
	policy.RememberMeDurationDays = clampInt(getSettingIntFromMap(settings, "security.session.remember_me_duration", policy.RememberMeDurationDays), 1, 90)
	policy.MaxConcurrentSessions = clampInt(getSettingIntFromMap(settings, "security.session.max_concurrent_sessions", policy.MaxConcurrentSessions), 1, 10)
	policy.ForceLogoutOnPasswordChange = getSettingBoolFromMap(settings, "security.session.force_logout_on_password_change", policy.ForceLogoutOnPasswordChange)

	policy.PasswordMinLength = clampInt(getSettingIntFromMap(settings, "security.password.min_length", policy.PasswordMinLength), 6, 128)
	policy.MaxLoginAttempts = clampInt(getSettingIntFromMap(settings, "security.password.max_login_attempts", policy.MaxLoginAttempts), 1, 20)
	policy.LockoutDurationMinutes = clampInt(getSettingIntFromMap(settings, "security.password.lockout_duration", policy.LockoutDurationMinutes), 1, 1440)

	return policy
}

type settingRow struct {
	Key      string  `gorm:"column:key"`
	Value    *string `gorm:"column:value"`
	DataType string  `gorm:"column:data_type"`
}

func (s *Service) getSettingValues(ctx context.Context, keys []string) map[string]string {
	result := make(map[string]string)
	if !s.isReady() {
		return result
	}
	if len(keys) == 0 {
		return result
	}
	normalizedKeys := make([]string, 0, len(keys))
	for _, key := range keys {
		k := strings.TrimSpace(key)
		if k == "" {
			continue
		}
		normalizedKeys = append(normalizedKeys, k)
	}
	if len(normalizedKeys) == 0 {
		return result
	}

	rows := make([]settingRow, 0, len(normalizedKeys))
	if err := s.db.WithContext(ctx).
		Table("system_settings").
		Select("key, value, data_type").
		Where("key IN ?", normalizedKeys).
		Find(&rows).Error; err != nil {
		return result
	}

	for _, row := range rows {
		if row.Value == nil {
			continue
		}
		value := strings.TrimSpace(*row.Value)
		if value == "" {
			continue
		}
		result[row.Key] = value
	}

	return result
}

func getSettingIntFromMap(settings map[string]string, key string, fallback int) int {
	val, ok := settings[key]
	if !ok {
		return fallback
	}
	if parsed, err := strconv.Atoi(strings.TrimSpace(val)); err == nil {
		return parsed
	}
	// 兼容 json number
	var num float64
	if json.Unmarshal([]byte(val), &num) == nil {
		return int(num)
	}
	return fallback
}

func getSettingBoolFromMap(settings map[string]string, key string, fallback bool) bool {
	val, ok := settings[key]
	if !ok {
		return fallback
	}
	if parsed, err := strconv.ParseBool(strings.TrimSpace(val)); err == nil {
		return parsed
	}
	return fallback
}

func clampInt(value int, min int, max int) int {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func (s *Service) onLoginFailed(ctx context.Context, userID string, policy securityPolicy) error {
	if !s.isReady() {
		return nil
	}
	id := strings.TrimSpace(userID)
	if id == "" {
		return nil
	}

	type row struct {
		LoginAttempts *int       `gorm:"column:login_attempts"`
		LockedUntil   *time.Time `gorm:"column:locked_until"`
	}

	var current row
	_ = s.db.WithContext(ctx).
		Table("users").
		Select("login_attempts, locked_until").
		Where("id = ?", id).
		Take(&current).Error

	attempts := 0
	if current.LoginAttempts != nil {
		attempts = *current.LoginAttempts
	}
	attempts++

	updates := map[string]interface{}{
		"login_attempts": attempts,
		"updated_at":     time.Now().UTC(),
	}
	if attempts >= policy.MaxLoginAttempts {
		lockUntil := time.Now().UTC().Add(time.Duration(policy.LockoutDurationMinutes) * time.Minute)
		updates["locked_until"] = lockUntil
	}

	return s.db.WithContext(ctx).
		Table("users").
		Where("id = ?", id).
		Updates(updates).Error
}

func (s *Service) onLoginSucceeded(ctx context.Context, userID string) error {
	if !s.isReady() {
		return nil
	}
	id := strings.TrimSpace(userID)
	if id == "" {
		return nil
	}

	updates := map[string]interface{}{
		"login_attempts": 0,
		"locked_until":   nil,
		"updated_at":     time.Now().UTC(),
	}
	return s.db.WithContext(ctx).
		Table("users").
		Where("id = ?", id).
		Updates(updates).Error
}
