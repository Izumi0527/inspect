package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/config"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

type loginOptionsBody struct {
	RememberMeEnabled bool `json:"remember_me_enabled"`
}

func doLoginOptions(t *testing.T, mock sqlmock.Sqlmock, e *echo.Echo) loginOptionsBody {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/login-options", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d, want 200 (%s)", rec.Code, rec.Body.String())
	}
	var body loginOptionsBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	return body
}

// 登录页无 token 即可读取“记住我”开关，值来自安全策略 security.session.remember_me_enabled。
func TestLoginOptions_ReflectsRememberMePolicy(t *testing.T) {
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	mock.ExpectQuery(`SELECT key, value, data_type FROM "system_settings" WHERE key IN`).
		WillReturnRows(sqlmock.NewRows([]string{"key", "value", "data_type"}).
			AddRow("security.session.remember_me_enabled", "false", "boolean"))

	e := echo.New()
	handlers.AuthHandler{Service: auth.NewService(gormDB, config.Config{}, zap.NewNop())}.Register(e.Group("/api/v1"))

	if body := doLoginOptions(t, mock, e); body.RememberMeEnabled {
		t.Fatalf("策略关闭时 remember_me_enabled 应为 false")
	}
}

func TestLoginOptions_DefaultsToEnabledWhenUnset(t *testing.T) {
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	mock.ExpectQuery(`SELECT key, value, data_type FROM "system_settings" WHERE key IN`).
		WillReturnRows(sqlmock.NewRows([]string{"key", "value", "data_type"}))

	e := echo.New()
	handlers.AuthHandler{Service: auth.NewService(gormDB, config.Config{}, zap.NewNop())}.Register(e.Group("/api/v1"))

	if body := doLoginOptions(t, mock, e); !body.RememberMeEnabled {
		t.Fatalf("未配置时应沿用默认值 true")
	}
}
