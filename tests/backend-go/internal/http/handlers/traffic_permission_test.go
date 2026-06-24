package handlers_test

import (
	"net/http"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

// TestTrafficHandler_ReadEndpointRequiresMonitoringRead 验证流量读接口需要 monitoring:read：
// 无该权限返回 403；具备该权限则放行（因测试未注入 Service，放行后撞 503）。
func TestTrafficHandler_ReadEndpointRequiresMonitoringRead(t *testing.T) {
	deniedAuth, deniedToken := newAuthServiceWithPermissions(t, []string{"devices:read"})
	allowedAuth, allowedToken := newAuthServiceWithPermissions(t, []string{"monitoring:read"})

	h := handlers.TrafficHandler{Auth: deniedAuth}
	ctx := newEchoContext(http.MethodGet, "/api/v1/traffic/summary", deniedToken)
	assertHTTPErrorCode(t, h.GetTrafficSummary(ctx), http.StatusForbidden)

	h = handlers.TrafficHandler{Auth: allowedAuth}
	ctx = newEchoContext(http.MethodGet, "/api/v1/traffic/summary", allowedToken)
	assertHTTPErrorCode(t, h.GetTrafficSummary(ctx), http.StatusServiceUnavailable)
}

// TestTrafficHandler_WriteEndpointsRequireMonitoringControl 验证流量写接口需要 monitoring:control：
// 仅 monitoring:read 的 viewer 访问写接口返回 403；具备 monitoring:control 则放行（撞 503）。
func TestTrafficHandler_WriteEndpointsRequireMonitoringControl(t *testing.T) {
	readOnlyAuth, readOnlyToken := newAuthServiceWithPermissions(t, []string{"monitoring:read"})
	controlAuth, controlToken := newAuthServiceWithPermissions(t, []string{"monitoring:control"})

	writes := []struct {
		name   string
		method string
		path   string
		invoke func(h handlers.TrafficHandler, c echo.Context) error
	}{
		{"collect", http.MethodPost, "/api/v1/traffic/collect", handlers.TrafficHandler.CollectTrafficData},
		{"baseline", http.MethodPost, "/api/v1/traffic/baseline/calculate", handlers.TrafficHandler.CalculateBaseline},
		{"start-monitoring", http.MethodPost, "/api/v1/traffic/monitoring/start", handlers.TrafficHandler.StartMonitoring},
		{"cleanup", http.MethodDelete, "/api/v1/traffic/data/cleanup", handlers.TrafficHandler.CleanupData},
	}

	for _, w := range writes {
		w := w
		t.Run(w.name+"/deny-read-only", func(t *testing.T) {
			h := handlers.TrafficHandler{Auth: readOnlyAuth}
			ctx := newEchoContext(w.method, w.path, readOnlyToken)
			assertHTTPErrorCode(t, w.invoke(h, ctx), http.StatusForbidden)
		})
		t.Run(w.name+"/allow-control", func(t *testing.T) {
			h := handlers.TrafficHandler{Auth: controlAuth}
			ctx := newEchoContext(w.method, w.path, controlToken)
			assertHTTPErrorCode(t, w.invoke(h, ctx), http.StatusServiceUnavailable)
		})
	}
}
