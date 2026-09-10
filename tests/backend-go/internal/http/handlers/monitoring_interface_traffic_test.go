package handlers_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

// 接口流量端点属于监控读接口：缺 monitoring:read 返回 403；有权限但未注入 Writer 撞 503。
func TestMonitoringHandler_DeviceInterfaceTrafficPermission(t *testing.T) {
	deniedAuth, deniedToken := newAuthServiceWithPermissions(t, []string{"monitoring:control"})
	allowedAuth, allowedToken := newAuthServiceWithPermissions(t, []string{"monitoring:read"})

	h := handlers.MonitoringHandler{Auth: deniedAuth}
	ctx := newEchoContext(http.MethodGet, "/api/v1/monitoring/devices/6/interface-traffic", deniedToken)
	ctx.SetParamNames("device_id")
	ctx.SetParamValues("6")
	assertHTTPErrorCode(t, h.GetDeviceInterfaceTraffic(ctx), http.StatusForbidden)

	h = handlers.MonitoringHandler{Auth: allowedAuth}
	ctx = newEchoContext(http.MethodGet, "/api/v1/monitoring/devices/6/interface-traffic", allowedToken)
	ctx.SetParamNames("device_id")
	ctx.SetParamValues("6")
	assertHTTPErrorCode(t, h.GetDeviceInterfaceTraffic(ctx), http.StatusServiceUnavailable)
}

// 路由已注册：经 echo 路由分发命中 handler（未注入 Writer 撞 503），而不是 404。
func TestMonitoringHandler_DeviceInterfaceTrafficRoute_ShouldExist(t *testing.T) {
	allowedAuth, allowedToken := newAuthServiceWithPermissions(t, []string{"monitoring:read"})

	e := echo.New()
	api := e.Group("/api/v1")
	handlers.MonitoringHandler{Auth: allowedAuth}.Register(api)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/monitoring/devices/6/interface-traffic?interface=if6", nil)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+allowedToken)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusServiceUnavailable)
	}
}
