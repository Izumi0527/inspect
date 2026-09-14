package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"

	mw "github.com/your-org/inspect-system/backend-go/internal/http/middleware"
)

type fakeIPAllowlistPolicy struct {
	enabled bool
	entries []string
}

func (f fakeIPAllowlistPolicy) IPAllowlist(context.Context) (bool, []string) {
	return f.enabled, f.entries
}

func newIPAllowlistServer(policy fakeIPAllowlistPolicy) *echo.Echo {
	e := echo.New()
	api := e.Group("/api/v1")
	api.Use(mw.IPAllowlist(policy))
	api.GET("/devices", func(c echo.Context) error { return c.String(http.StatusOK, "ok") })
	api.POST("/auth/login", func(c echo.Context) error { return c.String(http.StatusOK, "login") })
	return e
}

func doIPRequest(e *echo.Echo, method, target, remoteAddr string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, nil)
	req.RemoteAddr = remoteAddr
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}

func TestIPAllowlist_BlocksUnlistedClientEvenOnLogin(t *testing.T) {
	e := newIPAllowlistServer(fakeIPAllowlistPolicy{enabled: true, entries: []string{"10.0.0.0/8"}})

	rec := doIPRequest(e, http.MethodPost, "/api/v1/auth/login", "192.168.1.9:51000")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("白名单外 IP 应 403，实际 %d (%s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "IPNotAllowed") {
		t.Fatalf("响应应带机器可读类型 IPNotAllowed，实际 %s", rec.Body.String())
	}
}

func TestIPAllowlist_PermitsListedClient(t *testing.T) {
	e := newIPAllowlistServer(fakeIPAllowlistPolicy{enabled: true, entries: []string{"10.0.0.0/8", "192.168.1.9"}})

	if rec := doIPRequest(e, http.MethodGet, "/api/v1/devices", "10.20.30.40:1234"); rec.Code != http.StatusOK {
		t.Fatalf("CIDR 命中应放行，实际 %d", rec.Code)
	}
	if rec := doIPRequest(e, http.MethodGet, "/api/v1/devices", "192.168.1.9:1234"); rec.Code != http.StatusOK {
		t.Fatalf("单 IP 命中应放行，实际 %d", rec.Code)
	}
}

func TestIPAllowlist_DisabledOrEmptyListPassesEveryone(t *testing.T) {
	disabled := newIPAllowlistServer(fakeIPAllowlistPolicy{enabled: false, entries: []string{"10.0.0.0/8"}})
	if rec := doIPRequest(disabled, http.MethodGet, "/api/v1/devices", "192.168.1.9:1234"); rec.Code != http.StatusOK {
		t.Fatalf("白名单关闭时应放行，实际 %d", rec.Code)
	}

	empty := newIPAllowlistServer(fakeIPAllowlistPolicy{enabled: true, entries: nil})
	if rec := doIPRequest(empty, http.MethodGet, "/api/v1/devices", "192.168.1.9:1234"); rec.Code != http.StatusOK {
		t.Fatalf("白名单为空时应放行（避免全员自锁），实际 %d", rec.Code)
	}
}

func TestIPAllowlist_PreflightAlwaysPasses(t *testing.T) {
	e := newIPAllowlistServer(fakeIPAllowlistPolicy{enabled: true, entries: []string{"10.0.0.0/8"}})
	rec := doIPRequest(e, http.MethodOptions, "/api/v1/devices", "192.168.1.9:1234")
	if rec.Code == http.StatusForbidden {
		t.Fatalf("CORS 预检不应被白名单拦截")
	}
}
