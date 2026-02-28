package settings

import (
	"context"
	"fmt"
	"strings"
	"unicode"
)

func (s *Service) validatePasswordPolicy(ctx context.Context, password string) error {
	if !s.isReady() {
		return nil
	}

	value := strings.TrimSpace(password)
	if value == "" {
		return fmt.Errorf("密码不能为空")
	}

	minLength := s.getSettingInt(ctx, "security.password.min_length", 8)
	if minLength > 0 && len([]rune(value)) < minLength {
		return fmt.Errorf("密码长度至少 %d 位", minLength)
	}

	requireUpper := s.getSettingBool(ctx, "security.password.require_uppercase", true)
	requireLower := s.getSettingBool(ctx, "security.password.require_lowercase", true)
	requireNumber := s.getSettingBool(ctx, "security.password.require_numbers", true)
	requireSpecial := s.getSettingBool(ctx, "security.password.require_special_chars", true)
	preventCommon := s.getSettingBool(ctx, "security.password.prevent_common_passwords", true)

	var hasUpper, hasLower, hasNumber, hasSpecial bool
	for _, r := range value {
		switch {
		case unicode.IsUpper(r):
			hasUpper = true
		case unicode.IsLower(r):
			hasLower = true
		case unicode.IsDigit(r):
			hasNumber = true
		case unicode.IsPunct(r) || unicode.IsSymbol(r):
			hasSpecial = true
		}
	}

	if requireUpper && !hasUpper {
		return fmt.Errorf("密码必须包含大写字母")
	}
	if requireLower && !hasLower {
		return fmt.Errorf("密码必须包含小写字母")
	}
	if requireNumber && !hasNumber {
		return fmt.Errorf("密码必须包含数字")
	}
	if requireSpecial && !hasSpecial {
		return fmt.Errorf("密码必须包含特殊字符")
	}

	if preventCommon {
		lower := strings.ToLower(value)
		common := []string{
			"123456", "12345678", "password", "qwerty", "111111", "admin", "123123",
			"letmein", "welcome", "iloveyou", "000000", "666666",
		}
		for _, item := range common {
			if lower == item {
				return fmt.Errorf("密码过于常见，请更换更强的密码")
			}
		}
	}

	return nil
}
