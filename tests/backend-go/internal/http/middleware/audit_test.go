package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
	mw "github.com/your-org/inspect-system/backend-go/internal/http/middleware"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

type fakeAuditSink struct {
	mu      sync.Mutex
	entries []settings.AuditEntry
}

func (f *fakeAuditSink) RecordAuditLog(_ context.Context, entry settings.AuditEntry) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.entries = append(f.entries, entry)
}

func (f *fakeAuditSink) all() []settings.AuditEntry {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]settings.AuditEntry{}, f.entries...)
}

func newAuditTestServer(sink *fakeAuditSink) *echo.Echo {
	e := echo.New()
	api := e.Group("/api/v1")
	api.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		// 模拟认证中间件注入用户
		return func(c echo.Context) error {
			c.Set(auth.ContextUserKey, &auth.UserRecord{ID: "u-1", Username: "admin"})
			return next(c)
		}
	})
	api.Use(mw.AuditTrail(sink))

	ok := func(c echo.Context) error { return c.JSON(http.StatusOK, map[string]string{"ok": "1"}) }
	api.POST("/devices", ok)
	api.PUT("/devices/:id", ok)
	api.DELETE("/devices/:id", ok)
	api.POST("/templates/import", ok)
	api.GET("/templates/:id/export", ok)
	api.POST("/settings/audit/logs/export", ok)
	api.PUT("/settings/general/settings/:key", ok)
	api.GET("/devices", ok)
	api.POST("/devices/batch-probe", ok)
	api.POST("/auth/refresh", ok)
	api.POST("/alerts/:id/acknowledge", func(c echo.Context) error {
		return echo.NewHTTPError(http.StatusInternalServerError, "boom")
	})
	return e
}

func doReq(e *echo.Echo, method, path string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}

func TestAuditTrail_MutatingRequestsAreRecorded(t *testing.T) {
	sink := &fakeAuditSink{}
	e := newAuditTestServer(sink)

	cases := []struct {
		method, path   string
		wantAction     string
		wantResource   string
		wantResourceID string
	}{
		{http.MethodPost, "/api/v1/devices", "create", "device", ""},
		{http.MethodPut, "/api/v1/devices/42", "update", "device", "42"},
		{http.MethodDelete, "/api/v1/devices/42", "delete", "device", "42"},
		{http.MethodPost, "/api/v1/templates/import", "import", "inspection_template", ""},
		{http.MethodPost, "/api/v1/settings/audit/logs/export", "export", "setting", ""},
		{http.MethodPut, "/api/v1/settings/general/settings/system.timezone", "config_change", "setting", ""},
	}

	for _, tc := range cases {
		sink.entries = nil
		rec := doReq(e, tc.method, tc.path)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s %s status=%d", tc.method, tc.path, rec.Code)
		}
		entries := sink.all()
		if len(entries) != 1 {
			t.Fatalf("%s %s 应记 1 条审计，实际 %d", tc.method, tc.path, len(entries))
		}
		got := entries[0]
		if got.Action != tc.wantAction || got.ResourceType != tc.wantResource {
			t.Fatalf("%s %s => action=%q resource=%q, want %q/%q",
				tc.method, tc.path, got.Action, got.ResourceType, tc.wantAction, tc.wantResource)
		}
		if got.ResourceID != tc.wantResourceID {
			t.Fatalf("%s %s => resourceID=%q, want %q", tc.method, tc.path, got.ResourceID, tc.wantResourceID)
		}
		if got.UserID != "u-1" || got.Status != "success" {
			t.Fatalf("user/status 不符: %+v", got)
		}
	}
}

func TestAuditTrail_ExcludedRoutesAndReadsAreNotRecorded(t *testing.T) {
	sink := &fakeAuditSink{}
	e := newAuditTestServer(sink)

	doReq(e, http.MethodGet, "/api/v1/devices")                 // 读操作
	doReq(e, http.MethodGet, "/api/v1/templates/1/export")      // GET 导出也应记录？——GET 不拦截，导出走 GET 的由业务层考虑
	doReq(e, http.MethodPost, "/api/v1/devices/batch-probe")    // 探测排除
	doReq(e, http.MethodPost, "/api/v1/auth/refresh")           // auth 排除

	if entries := sink.all(); len(entries) != 0 {
		t.Fatalf("读操作/排除路由不应记审计，实际 %d 条: %+v", len(entries), entries)
	}
}

func TestAuditTrail_FailedResponseRecordsFailedStatus(t *testing.T) {
	sink := &fakeAuditSink{}
	e := newAuditTestServer(sink)

	rec := doReq(e, http.MethodPost, "/api/v1/alerts/7/acknowledge")
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status=%d, want 500", rec.Code)
	}

	entries := sink.all()
	if len(entries) != 1 {
		t.Fatalf("失败请求也应留痕，实际 %d", len(entries))
	}
	if entries[0].Status != "failed" || entries[0].ResourceType != "alert" {
		t.Fatalf("应记 failed/alert，实际 %+v", entries[0])
	}
}

func TestAuditTrail_NilRecorderPassesThrough(t *testing.T) {
	e := echo.New()
	api := e.Group("/api/v1")
	api.Use(mw.AuditTrail(nil))
	api.POST("/devices", func(c echo.Context) error { return c.NoContent(http.StatusOK) })

	if rec := doReq(e, http.MethodPost, "/api/v1/devices"); rec.Code != http.StatusOK {
		t.Fatalf("nil recorder 应直通，status=%d", rec.Code)
	}
}
