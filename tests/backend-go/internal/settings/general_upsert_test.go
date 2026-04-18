package settings_test

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/config"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestUpsertSetting_ShouldCreateWhenSettingMissing(t *testing.T) {
	db, mock, cleanup := newSettingsGormDBWithSQLMock(t)
	defer cleanup()

	service := settings.NewService(db, nil, config.Config{}, zap.NewNop())
	key := "system.application_name"
	value := "网络设备巡检系统"
	updatedBy := "df0f7d0f-baca-464e-900b-875ccec0196c"
	now := time.Now().UTC()

	mock.ExpectQuery(`SELECT \* FROM "system_settings" WHERE key = \$1.*`).
		WithArgs(key, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id",
			"key",
			"value",
			"category",
			"level",
			"description",
			"data_type",
			"is_required",
			"is_encrypted",
			"is_readonly",
			"validation_rule",
			"default_value",
			"min_value",
			"max_value",
			"allowed_values",
			"updated_by",
			"created_at",
			"updated_at",
		}))
	mock.ExpectQuery(`INSERT INTO "system_settings".*RETURNING "id"`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(1))
	mock.ExpectQuery(`SELECT \* FROM "system_settings" WHERE key = \$1.*`).
		WithArgs(key, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id",
			"key",
			"value",
			"category",
			"level",
			"description",
			"data_type",
			"is_required",
			"is_encrypted",
			"is_readonly",
			"validation_rule",
			"default_value",
			"min_value",
			"max_value",
			"allowed_values",
			"updated_by",
			"created_at",
			"updated_at",
		}).AddRow(
			1,
			key,
			value,
			"system",
			"system",
			nil,
			"string",
			false,
			false,
			false,
			nil,
			nil,
			nil,
			nil,
			nil,
			updatedBy,
			now,
			now,
		))

	item, err := service.UpsertSetting(context.Background(), key, value, updatedBy)
	if err != nil {
		t.Fatalf("UpsertSetting() error = %v", err)
	}
	if item == nil {
		t.Fatalf("UpsertSetting() returned nil item")
	}
	if item.Key != key {
		t.Fatalf("item.Key = %q, want %q", item.Key, key)
	}
	if item.Value != value {
		t.Fatalf("item.Value = %v, want %q", item.Value, value)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func newSettingsGormDBWithSQLMock(t *testing.T) (*gorm.DB, sqlmock.Sqlmock, func()) {
	t.Helper()

	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}

	gormDB, err := gorm.Open(postgres.New(postgres.Config{
		Conn:                 sqlDB,
		PreferSimpleProtocol: true,
	}), &gorm.Config{
		SkipDefaultTransaction: true,
		DisableAutomaticPing:   true,
	})
	if err != nil {
		_ = sqlDB.Close()
		t.Fatalf("gorm.Open: %v", err)
	}

	cleanup := func() {
		_ = sqlDB.Close()
	}
	return gormDB, mock, cleanup
}
