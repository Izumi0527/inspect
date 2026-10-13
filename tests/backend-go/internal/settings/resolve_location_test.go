package settings_test

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/config"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

func expectTimezoneSetting(mock sqlmock.Sqlmock, value string) {
	rows := sqlmock.NewRows([]string{"id", "key", "value", "category", "data_type"})
	if value != "" {
		rows.AddRow(1, "system.timezone", value, "system", "string")
	}
	mock.ExpectQuery(`SELECT \* FROM "system_settings" WHERE key = \$1`).
		WithArgs("system.timezone", sqlmock.AnyArg()).
		WillReturnRows(rows)
}

// ResolveLocation 是「按自然日/周/月切分」查询的时区来源，
// 决定 start_date/end_date 被解释成哪个时区的自然日。
// handler 的 Settings 可能未注入（降级/测试场景），nil 必须安全。
func TestResolveLocation_NilServiceUsesDefault(t *testing.T) {
	var service *settings.Service
	loc := service.ResolveLocation(context.Background())
	if loc.String() != settings.DefaultTimezone {
		t.Fatalf("loc = %q, want %q", loc.String(), settings.DefaultTimezone)
	}
}

// 配置了 system.timezone 时必须采用它：否则「本周」等区间会按错误时区切分。
func TestResolveLocation_UsesConfiguredTimezone(t *testing.T) {
	db, mock, cleanup := newSettingsGormDBWithSQLMock(t)
	defer cleanup()
	service := settings.NewService(db, nil, config.Config{}, zap.NewNop())

	expectTimezoneSetting(mock, "America/New_York")

	loc := service.ResolveLocation(context.Background())
	if loc.String() != "America/New_York" {
		t.Fatalf("loc = %q, want America/New_York", loc.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unexpected SQL: %v", err)
	}
}

// 配置值非法（时区名不存在）时必须回退默认，绝不能落到 UTC 而静默漏数据。
func TestResolveLocation_InvalidTimezoneFallsBackToDefault(t *testing.T) {
	db, mock, cleanup := newSettingsGormDBWithSQLMock(t)
	defer cleanup()
	service := settings.NewService(db, nil, config.Config{}, zap.NewNop())

	expectTimezoneSetting(mock, "Not/AZone")

	loc := service.ResolveLocation(context.Background())
	if loc.String() != settings.DefaultTimezone {
		t.Fatalf("loc = %q, want fallback %q", loc.String(), settings.DefaultTimezone)
	}
}

// 缺配置（查不到行）时同样回退默认。
func TestResolveLocation_MissingSettingFallsBackToDefault(t *testing.T) {
	db, mock, cleanup := newSettingsGormDBWithSQLMock(t)
	defer cleanup()
	service := settings.NewService(db, nil, config.Config{}, zap.NewNop())

	expectTimezoneSetting(mock, "")

	loc := service.ResolveLocation(context.Background())
	if loc.String() != settings.DefaultTimezone {
		t.Fatalf("loc = %q, want fallback %q", loc.String(), settings.DefaultTimezone)
	}
}
