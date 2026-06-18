package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
	mw "github.com/your-org/inspect-system/backend-go/internal/http/middleware"
)

func pwdBoolPtr(b bool) *bool { return &b }

// pwdUserInjector 模拟全局认证中间件：按请求头 X-Test-User 把不同用户写入上下文，
// 以便单独验证 EnforcePasswordChange 闸的分支（force / normal / 无用户）。
func pwdUserInjector(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		switch c.Request().Header.Get("X-Test-User") {
		case "force":
			c.Set(auth.ContextUserKey, &auth.UserRecord{ID: "u1", Username: "admin", ForcePasswordChange: pwdBoolPtr(true)})
		case "normal":
			c.Set(auth.ContextUserKey, &auth.UserRecord{ID: "u2", Username: "bob", ForcePasswordChange: pwdBoolPtr(false)})
		default:
			// 不注入用户（模拟公开端点场景）。
		}
		return next(c)
	}
}

func newPwdChangeTestServer() *echo.Echo {
	e := echo.New()
	api := e.Group("/api/v1")
	exempt := map[string]struct{}{"/api/v1/auth/change-password": {}}
	api.Use(pwdUserInjector)
	api.Use(mw.EnforcePasswordChange(exempt))

	api.GET("/devices", func(c echo.Context) error { return c.String(http.StatusOK, "ok") })
	api.POST("/auth/change-password", func(c echo.Context) error { return c.String(http.StatusOK, "changed") })
	return e
}

func doPwdRequest(e *echo.Echo, method, target, testUser string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, nil)
	if testUser != "" {
		req.Header.Set("X-Test-User", testUser)
	}
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}

// 核心验收：被标记 force_password_change 的用户访问业务端点应被拒（403），且可被前端识别。
func TestEnforcePasswordChange_ForceUserBlockedOnBusinessRoute(t *testing.T) {
	rec := doPwdRequest(newPwdChangeTestServer(), http.MethodGet, "/api/v1/devices", "force")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("强制改密用户访问业务端点应 403，实际 %d (%s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), mw.PasswordChangeRequiredType) {
		t.Fatalf("响应应包含可识别类型 %q，实际 body=%s", mw.PasswordChangeRequiredType, rec.Body.String())
	}
}

// 豁免端点（改密本身）即便用户处于强制改密状态也必须可达，否则无法完成改密。
func TestEnforcePasswordChange_ForceUserAllowedOnExemptRoute(t *testing.T) {
	rec := doPwdRequest(newPwdChangeTestServer(), http.MethodPost, "/api/v1/auth/change-password", "force")
	if rec.Code != http.StatusOK {
		t.Fatalf("强制改密用户访问改密端点应放行 200，实际 %d (%s)", rec.Code, rec.Body.String())
	}
}

// 普通用户不受闸影响。
func TestEnforcePasswordChange_NormalUserPasses(t *testing.T) {
	rec := doPwdRequest(newPwdChangeTestServer(), http.MethodGet, "/api/v1/devices", "normal")
	if rec.Code != http.StatusOK {
		t.Fatalf("普通用户应正常访问业务端点 200，实际 %d", rec.Code)
	}
}

// 未注入用户（公开端点场景）时，闸放行交由后续链路处理。
func TestEnforcePasswordChange_NoUserPassesThrough(t *testing.T) {
	rec := doPwdRequest(newPwdChangeTestServer(), http.MethodGet, "/api/v1/devices", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("无用户上下文时闸应放行，实际 %d", rec.Code)
	}
}
