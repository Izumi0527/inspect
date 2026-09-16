package settings_test

import (
	"context"
	"strings"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/config"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
	"go.uber.org/zap"
)

// 设备日志轮询间隔（任务 D2）：每次轮询都要 SSH 登录设备并在设备上留下登录日志，
// 间隔必须限定在 1-1440 分钟内，越界值在写库前拒绝（不应发出任何 SQL）。
func TestUpsertSetting_RejectsOutOfRangeLogPollingInterval(t *testing.T) {
	for _, value := range []interface{}{0, 1441, -5} {
		db, mock, cleanup := newSettingsGormDBWithSQLMock(t)
		service := settings.NewService(db, nil, config.Config{}, zap.NewNop())

		_, err := service.UpsertSetting(context.Background(), "logs.polling.interval_minutes", value, "tester")
		if err == nil {
			t.Fatalf("expected error for logs.polling.interval_minutes=%v", value)
		}
		if !strings.Contains(err.Error(), "1-1440") {
			t.Fatalf("error %q should mention range 1-1440", err.Error())
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatalf("unexpected SQL: %v", err)
		}
		cleanup()
	}
}
