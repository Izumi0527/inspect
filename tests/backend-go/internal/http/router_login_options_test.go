package http_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/config"
	apphttp "github.com/your-org/inspect-system/backend-go/internal/http"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

// 登录页在拿到 token 之前就要读取“记住我”开关，因此 /auth/login-options 必须绕过全局认证闸。
func TestNewServer_LoginOptionsIsPublic(t *testing.T) {
	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer sqlDB.Close()
	gormDB, err := gorm.Open(postgres.New(postgres.Config{Conn: sqlDB, PreferSimpleProtocol: true}),
		&gorm.Config{SkipDefaultTransaction: true, DisableAutomaticPing: true})
	if err != nil {
		t.Fatalf("gorm: %v", err)
	}
	mock.ExpectQuery(`SELECT key, value, data_type FROM "system_settings" WHERE key IN`).
		WillReturnRows(sqlmock.NewRows([]string{"key", "value", "data_type"}))

	authHandler := &handlers.AuthHandler{Service: auth.NewService(gormDB, config.Config{}, zap.NewNop())}
	server := apphttp.NewServer(config.Config{AppVersion: "test"}, nil, nil, authHandler,
		nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil)

	rec := httptest.NewRecorder()
	server.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/auth/login-options", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("未认证访问 /auth/login-options 状态码 = %d，期望 200 (%s)", rec.Code, rec.Body.String())
	}
}
