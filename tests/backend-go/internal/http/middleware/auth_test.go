package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
	mw "github.com/your-org/inspect-system/backend-go/internal/http/middleware"
)

// fakeAuthenticator 按 token 字面量模拟认证结果，便于覆盖各分支。
type fakeAuthenticator struct{}

func (fakeAuthenticator) GetActiveUserFromToken(_ context.Context, token string) (*auth.UserRecord, error) {
	switch token {
	case "valid":
		return &auth.UserRecord{ID: "u1", Username: "admin", Role: "superadmin"}, nil
	case "inactive":
		return nil, auth.ErrUserInactive
	default:
		return nil, auth.ErrTokenInvalid
	}
}

func newAuthTestServer() *echo.Echo {
	e := echo.New()
	api := e.Group("/api/v1")
	public := map[string]struct{}{"/api/v1/auth/login": {}}
	api.Use(mw.Authentication(fakeAuthenticator{}, public))

	// 受保护端点：handler 本身刻意不做任何鉴权，仅依赖全局认证中间件。
	api.GET("/protected", func(c echo.Context) error {
		if _, ok := c.Get(auth.ContextUserKey).(*auth.UserRecord); !ok {
			return c.String(http.StatusInternalServerError, "missing user in context")
		}
		return c.String(http.StatusOK, "ok")
	})
	// 白名单（公开）端点。
	api.POST("/auth/login", func(c echo.Context) error {
		return c.String(http.StatusOK, "login")
	})
	return e
}

func doRequest(e *echo.Echo, method, target, authHeader string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, nil)
	if authHeader != "" {
		req.Header.Set(echo.HeaderAuthorization, authHeader)
	}
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}

// 核心验收：handler 未做鉴权，但缺少 token 时仍被全局中间件拦截为 401。
func TestAuthentication_ProtectedRouteWithoutTokenReturns401(t *testing.T) {
	rec := doRequest(newAuthTestServer(), http.MethodGet, "/api/v1/protected", "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("无 token 访问受保护端点应 401，实际 %d", rec.Code)
	}
}

func TestAuthentication_ProtectedRouteWithValidTokenPasses(t *testing.T) {
	rec := doRequest(newAuthTestServer(), http.MethodGet, "/api/v1/protected", "Bearer valid")
	if rec.Code != http.StatusOK {
		t.Fatalf("有效 token 应通过并 200，实际 %d (%s)", rec.Code, rec.Body.String())
	}
}

func TestAuthentication_InactiveUserReturns400(t *testing.T) {
	rec := doRequest(newAuthTestServer(), http.MethodGet, "/api/v1/protected", "Bearer inactive")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("被禁用用户应 400，实际 %d", rec.Code)
	}
}

func TestAuthentication_InvalidTokenReturns401(t *testing.T) {
	rec := doRequest(newAuthTestServer(), http.MethodGet, "/api/v1/protected", "Bearer garbage")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("无效 token 应 401，实际 %d", rec.Code)
	}
}

func TestAuthentication_WhitelistedRouteBypassesAuth(t *testing.T) {
	rec := doRequest(newAuthTestServer(), http.MethodPost, "/api/v1/auth/login", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("白名单端点应免认证可达，实际 %d", rec.Code)
	}
}
