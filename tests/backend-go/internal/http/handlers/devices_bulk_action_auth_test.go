package handlers_test

import (
	"net/http"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

func TestDevicesHandler_BulkAction_ShouldRequireLoginBeforePayloadValidation(t *testing.T) {
	authService, _ := newAuthServiceWithPermissions(t, []string{"devices:read"})

	h := handlers.DevicesHandler{
		Service: &devices.Service{},
		Auth:    authService,
	}

	// 未带 token：应先返回 401，而不是 400 action/device_ids 缺失。
	ctx := newEchoContext(http.MethodPost, "/api/v1/devices/bulk-action", "")
	err := h.BulkAction(ctx)
	assertHTTPErrorCode(t, err, http.StatusUnauthorized)
}

