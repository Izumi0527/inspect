package handlers_test

import (
	"net/http"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

// scheduler 任务调度读写接口统一改为 system:config 驱动（移除 role==admin 硬编码）：
// 无该权限 403；具备则放行（无 Service 时撞 503）。
func TestSchedulerHandler_AllEndpointsRequireSystemConfig(t *testing.T) {
	deniedAuth, deniedToken := newAuthServiceWithPermissions(t, []string{"monitoring:read"})
	allowedAuth, allowedToken := newAuthServiceWithPermissions(t, []string{"system:config"})

	endpoints := []struct {
		name   string
		method string
		path   string
		invoke func(h handlers.SchedulerHandler, c echo.Context) error
	}{
		{"stats", http.MethodGet, "/api/v1/scheduler/stats", handlers.SchedulerHandler.GetStats},
		{"list", http.MethodGet, "/api/v1/scheduler/tasks", handlers.SchedulerHandler.ListTasks},
		{"get", http.MethodGet, "/api/v1/scheduler/tasks/t1", handlers.SchedulerHandler.GetTask},
		{"create", http.MethodPost, "/api/v1/scheduler/tasks", handlers.SchedulerHandler.CreateTask},
		{"enable", http.MethodPost, "/api/v1/scheduler/tasks/t1/enable", handlers.SchedulerHandler.EnableTask},
		{"disable", http.MethodPost, "/api/v1/scheduler/tasks/t1/disable", handlers.SchedulerHandler.DisableTask},
		{"delete", http.MethodDelete, "/api/v1/scheduler/tasks/t1", handlers.SchedulerHandler.DeleteTask},
	}
	for _, e := range endpoints {
		e := e
		t.Run(e.name+"/deny", func(t *testing.T) {
			h := handlers.SchedulerHandler{Auth: deniedAuth}
			assertHTTPErrorCode(t, e.invoke(h, newEchoContext(e.method, e.path, deniedToken)), http.StatusForbidden)
		})
		t.Run(e.name+"/allow", func(t *testing.T) {
			h := handlers.SchedulerHandler{Auth: allowedAuth}
			assertHTTPErrorCode(t, e.invoke(h, newEchoContext(e.method, e.path, allowedToken)), http.StatusServiceUnavailable)
		})
	}
}
