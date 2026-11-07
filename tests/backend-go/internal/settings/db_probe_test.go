package settings_test

import (
	"context"
	"errors"
	"testing"
	_ "unsafe"

	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/config"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

//go:linkname collectServiceHealth github.com/your-org/inspect-system/backend-go/internal/settings.(*Service).collectServiceHealth
func collectServiceHealth(s *settings.Service, ctx context.Context) []settings.ServiceHealth

// 设置页「系统健康」的 PostgreSQL 状态必须来自真正发出的 SELECT 1：
// GORM 的 Raw 只拼语句，修复前写成 Raw("SELECT 1").Error 时查询从未发出，恒报 running。
func TestGetSystemHealth_DatabaseProbeFailureReportsError(t *testing.T) {
	db, mock, cleanup := newSettingsGormDBWithSQLMock(t)
	defer cleanup()
	service := settings.NewService(db, nil, config.Config{}, zap.NewNop())

	mock.ExpectQuery(`(?is)^SELECT 1$`).
		WillReturnError(errors.New("connection refused"))

	health, err := service.GetSystemHealth(context.Background())
	if err != nil {
		t.Fatalf("GetSystemHealth() error = %v", err)
	}
	if got := findSystemServiceStatus(health.Services, "PostgreSQL"); got != "error" {
		t.Fatalf("PostgreSQL status = %q，探活失败时应为 error", got)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// 设置页「系统监控」的服务健康同理；探活失败时直接返回，不再查 PostgreSQL 运行时长。
func TestCollectServiceHealth_DatabaseProbeFailureReportsUnhealthy(t *testing.T) {
	db, mock, cleanup := newSettingsGormDBWithSQLMock(t)
	defer cleanup()
	service := settings.NewService(db, nil, config.Config{}, zap.NewNop())

	mock.ExpectQuery(`(?is)^SELECT 1$`).
		WillReturnError(errors.New("connection refused"))

	services := collectServiceHealth(service, context.Background())
	var status string
	for _, item := range services {
		if item.Name == "PostgreSQL" {
			status = item.Status
		}
	}
	if status != "unhealthy" {
		t.Fatalf("PostgreSQL status = %q，探活失败时应为 unhealthy（services=%+v）", status, services)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func findSystemServiceStatus(services []settings.SystemServiceHealth, name string) string {
	for _, item := range services {
		if item.Name == name {
			return item.Status
		}
	}
	return ""
}
