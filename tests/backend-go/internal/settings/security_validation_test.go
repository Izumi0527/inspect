package settings_test

import (
	"context"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/config"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
	"go.uber.org/zap"
)

// 安全策略数字项越界时，UpsertSetting 必须在写库前拒绝（不应发出任何 SQL）。
func TestUpsertSetting_RejectsOutOfRangeSecurityNumbers(t *testing.T) {
	cases := []struct {
		key   string
		value interface{}
		want  string
	}{
		{"security.session.timeout", 0, "5-1440"},
		{"security.session.remember_me_duration", 91, "1-90"},
		{"security.session.max_concurrent_sessions", 11, "1-10"},
		{"security.password.min_length", 33, "6-32"},
		{"security.password.password_expire_days", -1, "0-365"},
		{"security.password.password_history_count", 21, "0-20"},
		{"security.password.max_login_attempts", 2, "3-10"},
		{"security.password.lockout_duration", 4, "5-1440"},
	}

	for _, tc := range cases {
		t.Run(tc.key, func(t *testing.T) {
			db, mock, cleanup := newSettingsGormDBWithSQLMock(t)
			defer cleanup()
			service := settings.NewService(db, nil, config.Config{}, zap.NewNop())

			_, err := service.UpsertSetting(context.Background(), tc.key, tc.value, "tester")
			if err == nil {
				t.Fatalf("expected error for %s=%v", tc.key, tc.value)
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("error %q should mention range %s", err.Error(), tc.want)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("unexpected SQL: %v", err)
			}
		})
	}
}

// IP 白名单必须是合法 IP / CIDR 的数组，非法条目在写库前拒绝。
func TestUpsertSetting_RejectsInvalidIPWhitelistEntries(t *testing.T) {
	cases := []struct {
		name  string
		value interface{}
	}{
		{"not-an-array", "192.168.1.1"},
		{"garbage-entry", []interface{}{"192.168.1.1", "not-an-ip"}},
		{"bad-cidr", []interface{}{"10.0.0.0/99"}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db, mock, cleanup := newSettingsGormDBWithSQLMock(t)
			defer cleanup()
			service := settings.NewService(db, nil, config.Config{}, zap.NewNop())

			_, err := service.UpsertSetting(context.Background(), "security.auth.ip_whitelist", tc.value, "tester")
			if err == nil {
				t.Fatalf("expected error for %v", tc.value)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("unexpected SQL: %v", err)
			}
		})
	}
}

// 启动时清理旧前端写入、后端从未消费的 MFA/OAuth 配置行；幂等，无残留时也不报错。
func TestPurgeLegacySecuritySettings_DeletesUnconsumedKeys(t *testing.T) {
	db, mock, cleanup := newSettingsGormDBWithSQLMock(t)
	defer cleanup()
	service := settings.NewService(db, nil, config.Config{}, zap.NewNop())

	mock.ExpectExec(`DELETE FROM "system_settings" WHERE key IN`).
		WithArgs(
			"security.auth.mfa_enabled",
			"security.auth.mfa_methods",
			"security.auth.mfa_required",
			"security.auth.allow_oauth_login",
			"security.auth.oauth_providers",
		).
		WillReturnResult(sqlmock.NewResult(0, 5))

	removed, err := service.PurgeLegacySecuritySettings(context.Background())
	if err != nil {
		t.Fatalf("PurgeLegacySecuritySettings: %v", err)
	}
	if removed != 5 {
		t.Fatalf("removed = %d, want 5", removed)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
}
