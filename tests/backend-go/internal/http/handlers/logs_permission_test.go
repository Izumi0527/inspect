package handlers_test

import (
	"net/http"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

func TestLogsHandler_ReadEndpoints_Permission(t *testing.T) {
	readDeniedAuth, deniedToken := newAuthServiceWithPermissions(t, []string{"monitoring:read"})
	readAllowedAuth, allowedToken := newAuthServiceWithPermissions(t, []string{"system:logs"})

	h := handlers.LogsHandler{Auth: readDeniedAuth}
	ctx := newEchoContext(http.MethodGet, "/api/v1/logs", deniedToken)
	err := h.ListLogs(ctx)
	assertHTTPErrorCode(t, err, http.StatusForbidden)

	h = handlers.LogsHandler{Auth: readAllowedAuth}
	ctx = newEchoContext(http.MethodGet, "/api/v1/logs", allowedToken)
	err = h.ListLogs(ctx)
	assertHTTPErrorCode(t, err, http.StatusServiceUnavailable)
}

func TestLogsHandler_ManageEndpoints_Permission(t *testing.T) {
	readOnlyAuth, readOnlyToken := newAuthServiceWithPermissions(t, []string{"system:logs"})
	manageAuth, manageToken := newAuthServiceWithPermissions(t, []string{"system:logs", "system:logs:manage"})

	h := handlers.LogsHandler{Auth: readOnlyAuth}
	ctx := newEchoContext(http.MethodDelete, "/api/v1/logs/1", readOnlyToken)
	err := h.DeleteLog(ctx)
	assertHTTPErrorCode(t, err, http.StatusForbidden)

	h = handlers.LogsHandler{Auth: manageAuth}
	ctx = newEchoContext(http.MethodDelete, "/api/v1/logs/1", manageToken)
	err = h.DeleteLog(ctx)
	assertHTTPErrorCode(t, err, http.StatusServiceUnavailable)
}

