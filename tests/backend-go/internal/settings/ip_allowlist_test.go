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

func TestIPAllowlistPermits(t *testing.T) {
	entries := []string{"10.0.0.0/8", "192.168.1.9", "fd00::/8", "::1"}

	cases := []struct {
		ip   string
		want bool
	}{
		{"10.1.2.3", true},
		{"192.168.1.9", true},
		{"192.168.1.10", false},
		{"fd00::1234", true},
		{"::1", true},
		{"2001:db8::1", false},
		{"not-an-ip", false},
		{"", false},
	}
	for _, tc := range cases {
		if got := settings.IPAllowlistPermits(entries, tc.ip); got != tc.want {
			t.Errorf("IPAllowlistPermits(%q) = %v, want %v", tc.ip, got, tc.want)
		}
	}
}

func TestIPAllowlistPermits_IgnoresMalformedEntries(t *testing.T) {
	if settings.IPAllowlistPermits([]string{"garbage", "10.0.0.0/99"}, "10.1.1.1") {
		t.Fatalf("非法条目不应匹配任何 IP")
	}
}

func TestValidateIPAllowlistChange_RejectsSelfLockout(t *testing.T) {
	db, mock, cleanup := newSettingsGormDBWithSQLMock(t)
	defer cleanup()
	service := settings.NewService(db, nil, config.Config{}, zap.NewNop())

	payload := map[string]interface{}{
		"security.auth.ip_whitelist_enabled": true,
		"security.auth.ip_whitelist":         []interface{}{"10.0.0.0/8"},
	}
	err := service.ValidateIPAllowlistChange(context.Background(), payload, "192.168.1.9")
	if err == nil {
		t.Fatalf("当前 IP 不在白名单内时应拒绝保存")
	}
	if !strings.Contains(err.Error(), "192.168.1.9") {
		t.Fatalf("错误应指出当前访问 IP，实际 %q", err.Error())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("两键都在载荷中时不应读库: %v", err)
	}
}

func TestValidateIPAllowlistChange_AllowsWhenRequesterListedOrDisabled(t *testing.T) {
	db, _, cleanup := newSettingsGormDBWithSQLMock(t)
	defer cleanup()
	service := settings.NewService(db, nil, config.Config{}, zap.NewNop())

	listed := map[string]interface{}{
		"security.auth.ip_whitelist_enabled": true,
		"security.auth.ip_whitelist":         []interface{}{"192.168.1.0/24"},
	}
	if err := service.ValidateIPAllowlistChange(context.Background(), listed, "192.168.1.9"); err != nil {
		t.Fatalf("当前 IP 命中白名单时应允许: %v", err)
	}

	disabled := map[string]interface{}{
		"security.auth.ip_whitelist_enabled": false,
		"security.auth.ip_whitelist":         []interface{}{"10.0.0.0/8"},
	}
	if err := service.ValidateIPAllowlistChange(context.Background(), disabled, "192.168.1.9"); err != nil {
		t.Fatalf("白名单关闭时应允许: %v", err)
	}

	unrelated := map[string]interface{}{"system.timezone": "Asia/Shanghai"}
	if err := service.ValidateIPAllowlistChange(context.Background(), unrelated, "192.168.1.9"); err != nil {
		t.Fatalf("载荷不含白名单键时应允许: %v", err)
	}
}

// 载荷仅把开关置为 true、未携带列表时，必须用库中现有列表做自锁检查，
// 而不能因为库中开关仍为 false 就跳过。
func TestValidateIPAllowlistChange_UsesStoredListWhenOnlyEnablingSwitch(t *testing.T) {
	db, mock, cleanup := newSettingsGormDBWithSQLMock(t)
	defer cleanup()
	service := settings.NewService(db, nil, config.Config{}, zap.NewNop())

	mock.ExpectQuery(`SELECT \* FROM "system_settings" WHERE key = \$1.*`).
		WithArgs("security.auth.ip_whitelist", sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"id", "key", "value", "data_type"}).
			AddRow(1, "security.auth.ip_whitelist", `["10.0.0.0/8"]`, "json"))

	payload := map[string]interface{}{"security.auth.ip_whitelist_enabled": true}
	err := service.ValidateIPAllowlistChange(context.Background(), payload, "192.168.1.9")
	if err == nil {
		t.Fatalf("库中列表不含当前 IP，仅开启开关也应被拒绝")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
}
