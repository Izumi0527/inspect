package handlers_test

import (
	"net/http"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/dashboard"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

// 保存拓扑布局是对共享视图的改动：只读设备权限不够，需要 devices:update。
func TestDashboardHandler_PutTopologyLayoutRequiresDevicesUpdate(t *testing.T) {
	deniedAuth, deniedToken := newAuthServiceWithPermissions(t, []string{"devices:read"})
	allowedAuth, allowedToken := newAuthServiceWithPermissions(t, []string{"devices:update"})

	body := []byte(`{"positions":[{"device_id":1,"x":10,"y":20}],"viewport":{"x":0,"y":0,"k":1}}`)

	h := handlers.DashboardHandler{Service: &dashboard.Service{}, Auth: deniedAuth}
	ctx, _ := newEchoContextWithBody(http.MethodPut, "/api/v1/dashboard/network-topology/layout", deniedToken, body)
	assertHTTPErrorCode(t, h.PutNetworkTopologyLayout(ctx), http.StatusForbidden)

	// 有权限：Service 没有数据库，落到 500 说明已越过鉴权与参数校验
	h = handlers.DashboardHandler{Service: &dashboard.Service{}, Auth: allowedAuth}
	ctx, _ = newEchoContextWithBody(http.MethodPut, "/api/v1/dashboard/network-topology/layout", allowedToken, body)
	assertHTTPErrorCode(t, h.PutNetworkTopologyLayout(ctx), http.StatusInternalServerError)
}

func TestDashboardHandler_PutTopologyLayoutRejectsInvalidPayload(t *testing.T) {
	allowedAuth, allowedToken := newAuthServiceWithPermissions(t, []string{"devices:update"})
	h := handlers.DashboardHandler{Service: &dashboard.Service{}, Auth: allowedAuth}

	ctx, _ := newEchoContextWithBody(http.MethodPut, "/api/v1/dashboard/network-topology/layout", allowedToken, []byte(`{"positions":[{"device_id":0,"x":1,"y":1}]}`))
	assertHTTPErrorCode(t, h.PutNetworkTopologyLayout(ctx), http.StatusBadRequest)

	ctx, _ = newEchoContextWithBody(http.MethodPut, "/api/v1/dashboard/network-topology/layout", allowedToken, []byte(`not json`))
	assertHTTPErrorCode(t, h.PutNetworkTopologyLayout(ctx), http.StatusBadRequest)
}
