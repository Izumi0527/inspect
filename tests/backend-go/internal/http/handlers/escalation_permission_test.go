package handlers_test

import (
	"net/http"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

// 读接口需 alerts:read：无则 403，有则放行（无 Service 时撞 503）。
func TestEscalationHandler_ReadEndpointsRequireAlertsRead(t *testing.T) {
	deniedAuth, deniedToken := newAuthServiceWithPermissions(t, []string{"devices:read"})
	allowedAuth, allowedToken := newAuthServiceWithPermissions(t, []string{"alerts:read"})

	reads := []struct {
		name   string
		method string
		path   string
		invoke func(h handlers.EscalationHandler, c echo.Context) error
	}{
		{"list-rules", http.MethodGet, "/api/v1/escalation/rules", handlers.EscalationHandler.ListRules},
		{"get-status", http.MethodGet, "/api/v1/escalation/status/a1", handlers.EscalationHandler.GetStatus},
		{"statistics", http.MethodGet, "/api/v1/escalation/statistics", handlers.EscalationHandler.GetStatistics},
	}
	for _, r := range reads {
		r := r
		t.Run(r.name+"/deny", func(t *testing.T) {
			h := handlers.EscalationHandler{Auth: deniedAuth}
			assertHTTPErrorCode(t, r.invoke(h, newEchoContext(r.method, r.path, deniedToken)), http.StatusForbidden)
		})
		t.Run(r.name+"/allow", func(t *testing.T) {
			h := handlers.EscalationHandler{Auth: allowedAuth}
			assertHTTPErrorCode(t, r.invoke(h, newEchoContext(r.method, r.path, allowedToken)), http.StatusServiceUnavailable)
		})
	}
}

// 写接口需 alerts:update：仅 alerts:read 的用户 403，具备 alerts:update 则放行（撞 503）。
func TestEscalationHandler_WriteEndpointsRequireAlertsUpdate(t *testing.T) {
	readOnlyAuth, readOnlyToken := newAuthServiceWithPermissions(t, []string{"alerts:read"})
	updateAuth, updateToken := newAuthServiceWithPermissions(t, []string{"alerts:update"})

	writes := []struct {
		name   string
		method string
		path   string
		invoke func(h handlers.EscalationHandler, c echo.Context) error
	}{
		{"create", http.MethodPost, "/api/v1/escalation/rules", handlers.EscalationHandler.CreateRule},
		{"update", http.MethodPut, "/api/v1/escalation/rules/r1", handlers.EscalationHandler.UpdateRule},
		{"delete", http.MethodDelete, "/api/v1/escalation/rules/r1", handlers.EscalationHandler.DeleteRule},
		{"cancel", http.MethodPost, "/api/v1/escalation/cancel/a1", handlers.EscalationHandler.CancelEscalation},
		{"test", http.MethodPost, "/api/v1/escalation/test/a1", handlers.EscalationHandler.TestEscalation},
	}
	for _, w := range writes {
		w := w
		t.Run(w.name+"/deny-read-only", func(t *testing.T) {
			h := handlers.EscalationHandler{Auth: readOnlyAuth}
			assertHTTPErrorCode(t, w.invoke(h, newEchoContext(w.method, w.path, readOnlyToken)), http.StatusForbidden)
		})
		t.Run(w.name+"/allow-update", func(t *testing.T) {
			h := handlers.EscalationHandler{Auth: updateAuth}
			assertHTTPErrorCode(t, w.invoke(h, newEchoContext(w.method, w.path, updateToken)), http.StatusServiceUnavailable)
		})
	}
}
