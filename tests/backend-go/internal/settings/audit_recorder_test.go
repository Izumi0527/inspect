package settings_test

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/config"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
	"go.uber.org/zap"
)

// 审计日志写入器：尽力而为落库，字段完整，失败绝不 panic/阻断业务。
func TestRecordAuditLog_ShouldInsertFullEntry(t *testing.T) {
	db, mock, cleanup := newSettingsGormDBWithSQLMock(t)
	defer cleanup()

	service := settings.NewService(db, nil, config.Config{}, zap.NewNop())

	// 该 gorm 配置下单条 Create 不包事务；details 为空时 NULL 直接内联不占参数位
	mock.ExpectExec(`INSERT INTO "audit_logs"`).
		WithArgs(
			sqlmock.AnyArg(), // id (uuid)
			"user-1",         // user_id
			"login",          // action
			"auth",           // resource_type
			nil,              // resource_id（空转 NULL）
			"用户 admin 登录成功",  // description
			"127.0.0.1",      // ip_address
			"UA/1.0",         // user_agent
			"success",        // status
			nil,              // error_message（空转 NULL）
			sqlmock.AnyArg(), // created_at
		).
		WillReturnResult(sqlmock.NewResult(1, 1))

	service.RecordAuditLog(context.Background(), settings.AuditEntry{
		UserID:       "user-1",
		Action:       "login",
		ResourceType: "auth",
		Description:  "用户 admin 登录成功",
		IPAddress:    "127.0.0.1",
		UserAgent:    "UA/1.0",
		Status:       "success",
	})

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("审计日志应完整落库: %v", err)
	}
}

// 写库失败不得向外冒错（更不能 panic），业务请求不受影响。
func TestRecordAuditLog_ShouldSwallowDBError(t *testing.T) {
	db, mock, cleanup := newSettingsGormDBWithSQLMock(t)
	defer cleanup()

	service := settings.NewService(db, nil, config.Config{}, zap.NewNop())

	mock.ExpectExec(`INSERT INTO "audit_logs"`).
		WillReturnError(context.DeadlineExceeded)

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("写库失败不得 panic: %v", r)
		}
	}()

	service.RecordAuditLog(context.Background(), settings.AuditEntry{
		Action:       "create",
		ResourceType: "device",
		Description:  "创建设备",
		Status:       "success",
	})
}
