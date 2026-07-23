package handlers_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/labstack/echo/v4"
	"go.uber.org/zap"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/config"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

type fakeAuditRecorder struct {
	mu      sync.Mutex
	entries []settings.AuditEntry
}

func (f *fakeAuditRecorder) RecordAuditLog(_ context.Context, entry settings.AuditEntry) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.entries = append(f.entries, entry)
}

// 登录失败（用户名或密码错误）必须留审计痕迹：这是安全审计的核心场景。
func TestLogin_FailedAttemptShouldRecordAudit(t *testing.T) {
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	// 用户不存在：users 查询返回空 → AuthenticateUser 返回 (nil, nil) → 401
	mock.ExpectQuery(`SELECT .+ FROM "users" WHERE username`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "username"}))

	recorder := &fakeAuditRecorder{}
	handler := handlers.AuthHandler{
		Service: auth.NewService(gormDB, config.Config{}, zap.NewNop()),
		Audit:   recorder,
	}

	e := echo.New()
	handler.Register(e.Group("/api/v1"))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login",
		strings.NewReader(`{"username":"ghost","password":"wrong"}`))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want 401", rec.Code)
	}

	if len(recorder.entries) != 1 {
		t.Fatalf("登录失败应记 1 条审计，实际 %d", len(recorder.entries))
	}
	entry := recorder.entries[0]
	if entry.Action != "login" || entry.Status != "failed" {
		t.Fatalf("action=%q status=%q, want login/failed", entry.Action, entry.Status)
	}
	if !strings.Contains(entry.Description, "ghost") {
		t.Fatalf("描述应包含尝试的用户名，实际 %q", entry.Description)
	}
	if entry.UserID != "" {
		t.Fatalf("失败登录不应关联用户 ID，实际 %q", entry.UserID)
	}
}

// Audit 未注入（nil）时登录流程不受影响。
func TestLogin_NilAuditRecorderIsSafe(t *testing.T) {
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	mock.ExpectQuery(`SELECT .+ FROM "users" WHERE username`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "username"}))

	handler := handlers.AuthHandler{
		Service: auth.NewService(gormDB, config.Config{}, zap.NewNop()),
	}

	e := echo.New()
	handler.Register(e.Group("/api/v1"))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login",
		strings.NewReader(`{"username":"ghost","password":"wrong"}`))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("nil Audit 不应影响登录流程，status=%d", rec.Code)
	}
}

// 无 token 的登出解析不出用户，不记录审计（避免无主噪音记录）。
func TestLogout_WithoutTokenRecordsNothing(t *testing.T) {
	gormDB, _, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	recorder := &fakeAuditRecorder{}
	handler := handlers.AuthHandler{
		Service: auth.NewService(gormDB, config.Config{}, zap.NewNop()),
		Audit:   recorder,
	}

	e := echo.New()
	handler.Register(e.Group("/api/v1"))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d, want 200", rec.Code)
	}
	if len(recorder.entries) != 0 {
		t.Fatalf("无用户会话的登出不应记审计，实际 %d 条", len(recorder.entries))
	}
}
