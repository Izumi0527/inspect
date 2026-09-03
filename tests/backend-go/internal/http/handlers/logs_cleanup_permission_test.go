package handlers_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/logs"
)

// 清理端点属于日志管理操作，但系统设置（system:config）也提供入口，
// 因此两种权限任一持有即应放行（到达服务检查层表现为 503，因 Service 未注入）。
func TestLogsHandler_Cleanup_AcceptsConfigOrManagePermission(t *testing.T) {
	cases := []struct {
		name        string
		permissions []string
		wantStatus  int
	}{
		{"system:config 可清理", []string{"system:config"}, http.StatusServiceUnavailable},
		{"system:logs:manage 可清理", []string{"system:logs:manage"}, http.StatusServiceUnavailable},
		{"两者皆有可清理", []string{"system:logs", "system:logs:manage", "system:config"}, http.StatusServiceUnavailable},
		{"无关权限拒绝", []string{"monitoring:read"}, http.StatusForbidden},
		{"仅只读日志权限拒绝", []string{"system:logs"}, http.StatusForbidden},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			auth, token := newAuthServiceWithPermissions(t, tc.permissions)
			h := handlers.LogsHandler{Auth: auth}
			ctx := newEchoContext(http.MethodPost, "/api/v1/logs/cleanup", token)
			err := h.CleanupDeviceLogs(ctx)
			assertHTTPErrorCode(t, err, tc.wantStatus)
		})
	}
}

// batch-collect 的 device_ids 上限应与导出端点一致（200），超大列表直接 400。
func TestLogsHandler_BatchCollect_RejectsTooManyDeviceIDs(t *testing.T) {
	auth, token := newAuthServiceWithPermissions(t, []string{"system:logs:manage"})
	// Service 非空即可通过服务检查；非法载荷在到达业务层之前被拒绝。
	h := handlers.LogsHandler{Auth: auth, Service: logs.NewService(nil, nil)}

	ids := make([]string, 0, 201)
	for i := 1; i <= 201; i++ {
		ids = append(ids, fmt.Sprintf("%d", i))
	}
	body := []byte(`{"device_ids":[` + strings.Join(ids, ",") + `]}`)

	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/logs/batch-collect", token, body)
	err := h.BatchCollectLogs(ctx)
	assertHTTPErrorCode(t, err, http.StatusBadRequest)
}

// 上限内（200 台）的请求应通过载荷校验，到达业务层后因无 DB 返回 500。
func TestLogsHandler_BatchCollect_AcceptsLimitBoundaryDeviceIDs(t *testing.T) {
	auth, token := newAuthServiceWithPermissions(t, []string{"system:logs:manage"})
	h := handlers.LogsHandler{Auth: auth, Service: logs.NewService(nil, nil)}

	ids := make([]string, 0, 200)
	for i := 1; i <= 200; i++ {
		ids = append(ids, fmt.Sprintf("%d", i))
	}
	body := []byte(`{"device_ids":[` + strings.Join(ids, ",") + `]}`)

	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/logs/batch-collect", token, body)
	err := h.BatchCollectLogs(ctx)
	assertHTTPErrorCode(t, err, http.StatusInternalServerError)
}

// 非法 JSON 载荷应返回 400，而非静默按默认值处理。
func TestLogsHandler_BatchCollect_RejectsInvalidJSON(t *testing.T) {
	auth, token := newAuthServiceWithPermissions(t, []string{"system:logs:manage"})
	h := handlers.LogsHandler{Auth: auth, Service: logs.NewService(nil, nil)}

	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/logs/batch-collect", token, []byte(`{invalid`))
	err := h.BatchCollectLogs(ctx)
	assertHTTPErrorCode(t, err, http.StatusBadRequest)
}
