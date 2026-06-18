package auth_test

import (
	"context"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"go.uber.org/zap/zaptest/observer"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/config"
)

// TestAuthenticateUser_LogsWhenLockoutAccountingFails 验证：登录失败计数/锁定记账
// 在 DB 出错时不再被静默吞掉，而是记录 WARN 日志（C1）。
func TestAuthenticateUser_LogsWhenLockoutAccountingFails(t *testing.T) {
	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer func() { _ = sqlDB.Close() }()

	gormDB, err := gorm.Open(postgres.New(postgres.Config{
		Conn:                 sqlDB,
		PreferSimpleProtocol: true,
	}), &gorm.Config{SkipDefaultTransaction: true, DisableAutomaticPing: true})
	if err != nil {
		t.Fatalf("gorm.Open: %v", err)
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("bcrypt: %v", err)
	}

	// 仅 mock 取用户查询返回有效用户；后续 settings 查询与记账 SELECT/UPDATE 不 mock，
	// sqlmock 将对其返回错误——其中记账 UPDATE 失败正是要验证“被记录而非吞掉”的场景。
	rows := sqlmock.NewRows([]string{
		"id", "username", "email", "full_name", "avatar", "role", "is_active",
		"hashed_password", "last_login_at", "login_attempts", "locked_until",
		"created_at", "updated_at",
	}).AddRow("u1", "admin", "a@b.c", nil, nil, "superadmin", true,
		string(hashed), nil, 0, nil, nil, nil)
	mock.ExpectQuery(`SELECT .* FROM "users" WHERE username = \$1`).WillReturnRows(rows)

	observed, logs := observer.New(zapcore.WarnLevel)
	svc := auth.NewService(gormDB, config.Config{}, zap.New(observed))

	user, authErr := svc.AuthenticateUser(context.Background(), "admin", "wrong-password")
	if authErr != nil {
		t.Fatalf("登录失败应返回 (nil,nil)，实际 err=%v", authErr)
	}
	if user != nil {
		t.Fatalf("错误口令不应返回用户")
	}

	found := false
	for _, entry := range logs.All() {
		if entry.Level == zapcore.WarnLevel && strings.Contains(entry.Message, "记账失败") {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("记账失败应记录含“记账失败”的 WARN 日志，实际日志: %+v", logs.All())
	}
}
