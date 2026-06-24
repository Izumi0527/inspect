package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/authcookie"
	mw "github.com/your-org/inspect-system/backend-go/internal/http/middleware"
)

func newCSRFTestServer() *echo.Echo {
	e := echo.New()
	api := e.Group("/api/v1")
	exempt := map[string]struct{}{"/api/v1/auth/login": {}}
	api.Use(mw.CSRFProtection(exempt))

	api.POST("/devices", func(c echo.Context) error { return c.String(http.StatusOK, "ok") })
	api.GET("/devices", func(c echo.Context) error { return c.String(http.StatusOK, "ok") })
	api.POST("/auth/login", func(c echo.Context) error { return c.String(http.StatusOK, "login") })
	return e
}

// doCSRFRequest 发起一次请求，可选注入 access_token cookie、csrf cookie 与 CSRF 请求头。
func doCSRFRequest(e *echo.Echo, method, target, accessCookie, csrfCookie, csrfHeader string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, nil)
	if accessCookie != "" {
		req.AddCookie(&http.Cookie{Name: authcookie.AccessTokenCookie, Value: accessCookie})
	}
	if csrfCookie != "" {
		req.AddCookie(&http.Cookie{Name: authcookie.CSRFCookie, Value: csrfCookie})
	}
	if csrfHeader != "" {
		req.Header.Set(authcookie.CSRFHeader, csrfHeader)
	}
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}

// Cookie 认证 + double-submit 匹配：放行。
func TestCSRF_CookieAuthMatchingTokenPasses(t *testing.T) {
	rec := doCSRFRequest(newCSRFTestServer(), http.MethodPost, "/api/v1/devices", "access-1", "tok123", "tok123")
	if rec.Code != http.StatusOK {
		t.Fatalf("匹配的 CSRF token 应放行 200，实际 %d (%s)", rec.Code, rec.Body.String())
	}
}

// Cookie 认证 + header 不匹配：拒绝 403。
func TestCSRF_CookieAuthMismatchedTokenRejected(t *testing.T) {
	rec := doCSRFRequest(newCSRFTestServer(), http.MethodPost, "/api/v1/devices", "access-1", "tok123", "wrong")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("不匹配的 CSRF token 应 403，实际 %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), mw.CSRFErrorType) {
		t.Fatalf("响应应包含可识别类型 %q，实际 body=%s", mw.CSRFErrorType, rec.Body.String())
	}
}

// Cookie 认证 + 缺 header：拒绝 403。
func TestCSRF_CookieAuthMissingHeaderRejected(t *testing.T) {
	rec := doCSRFRequest(newCSRFTestServer(), http.MethodPost, "/api/v1/devices", "access-1", "tok123", "")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("缺少 CSRF header 应 403，实际 %d", rec.Code)
	}
}

// Cookie 认证但缺 csrf cookie：拒绝 403。
// 这是 P2-1 fail-closed 的核心——不再因 csrf cookie 缺失而放行。
func TestCSRF_CookieAuthMissingCsrfCookieRejected(t *testing.T) {
	rec := doCSRFRequest(newCSRFTestServer(), http.MethodPost, "/api/v1/devices", "access-1", "", "")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("Cookie 认证缺少 csrf cookie 应 403，实际 %d", rec.Code)
	}
}

// 纯 Bearer/非浏览器客户端（无 access cookie）：放行。
func TestCSRF_BearerOnlyPassesThrough(t *testing.T) {
	rec := doCSRFRequest(newCSRFTestServer(), http.MethodPost, "/api/v1/devices", "", "", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("无 access cookie 时应放行 200，实际 %d", rec.Code)
	}
}

// 无 access cookie 时即便残留不匹配的 csrf cookie 也放行（CSRF 仅约束 Cookie 认证）。
func TestCSRF_NoAccessCookieNotEnforced(t *testing.T) {
	rec := doCSRFRequest(newCSRFTestServer(), http.MethodPost, "/api/v1/devices", "", "tok123", "wrong")
	if rec.Code != http.StatusOK {
		t.Fatalf("无 access cookie 应不强制 CSRF，实际 %d", rec.Code)
	}
}

// 安全方法(GET)不校验 CSRF。
func TestCSRF_SafeMethodSkipped(t *testing.T) {
	rec := doCSRFRequest(newCSRFTestServer(), http.MethodGet, "/api/v1/devices", "access-1", "tok123", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET 应跳过 CSRF 校验，实际 %d", rec.Code)
	}
}

// 豁免端点(登录引导)即便是 Cookie 认证也放行。
func TestCSRF_ExemptPathSkipped(t *testing.T) {
	rec := doCSRFRequest(newCSRFTestServer(), http.MethodPost, "/api/v1/auth/login", "access-1", "tok123", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("豁免端点应放行 200，实际 %d", rec.Code)
	}
}
