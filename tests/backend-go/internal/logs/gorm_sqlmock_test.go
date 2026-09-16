package logs_test

import (
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// newLogsGormDBWithSQLMock 构造以 sqlmock 为底的 GORM 连接，供本包 SQL 契约测试复用。
func newLogsGormDBWithSQLMock(t *testing.T, matcher sqlmock.QueryMatcher) (*gorm.DB, sqlmock.Sqlmock, func()) {
	t.Helper()
	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(matcher))
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	gormDB, err := gorm.Open(postgres.New(postgres.Config{Conn: sqlDB, PreferSimpleProtocol: true}), &gorm.Config{
		SkipDefaultTransaction: true,
		DisableAutomaticPing:   true,
	})
	if err != nil {
		_ = sqlDB.Close()
		t.Fatalf("gorm.Open: %v", err)
	}
	return gormDB, mock, func() { _ = sqlDB.Close() }
}
