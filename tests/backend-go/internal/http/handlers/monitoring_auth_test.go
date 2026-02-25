package handlers_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

func TestMonitoringHandler_ReadEndpointPermission(t *testing.T) {
	readDeniedAuth, deniedToken := newAuthServiceWithPermissions(t, []string{"monitoring:control"})
	readAllowedAuth, allowedToken := newAuthServiceWithPermissions(t, []string{"monitoring:read"})

	h := handlers.MonitoringHandler{Auth: readDeniedAuth}
	ctx := newEchoContext(http.MethodGet, "/api/v1/monitoring/availability", deniedToken)
	err := h.GetAvailability(ctx)
	assertHTTPErrorCode(t, err, http.StatusForbidden)

	h = handlers.MonitoringHandler{Auth: readAllowedAuth}
	ctx = newEchoContext(http.MethodGet, "/api/v1/monitoring/availability", allowedToken)
	err = h.GetAvailability(ctx)
	assertHTTPErrorCode(t, err, http.StatusServiceUnavailable)
}

func TestMonitoringHandler_ControlEndpointPermission(t *testing.T) {
	readOnlyAuth, readOnlyToken := newAuthServiceWithPermissions(t, []string{"monitoring:read"})
	controlAuth, controlToken := newAuthServiceWithPermissions(t, []string{"monitoring:control"})

	h := handlers.MonitoringHandler{Auth: readOnlyAuth}
	ctx := newEchoContext(http.MethodPost, "/api/v1/monitoring/start", readOnlyToken)
	err := h.StartMonitoringService(ctx)
	assertHTTPErrorCode(t, err, http.StatusForbidden)

	h = handlers.MonitoringHandler{Auth: controlAuth}
	ctx = newEchoContext(http.MethodPost, "/api/v1/monitoring/start", controlToken)
	err = h.StartMonitoringService(ctx)
	assertHTTPErrorCode(t, err, http.StatusServiceUnavailable)
}

func TestMonitoringHandler_ExportEndpointPermission(t *testing.T) {
	readOnlyAuth, readOnlyToken := newAuthServiceWithPermissions(t, []string{"monitoring:read"})
	exportAuth, exportToken := newAuthServiceWithPermissions(t, []string{"monitoring:export"})

	h := handlers.MonitoringHandler{Auth: readOnlyAuth}
	ctx := newEchoContext(http.MethodPost, "/api/v1/monitoring/reports/export", readOnlyToken)
	err := h.ExportMonitoringReport(ctx)
	assertHTTPErrorCode(t, err, http.StatusForbidden)

	h = handlers.MonitoringHandler{Auth: exportAuth}
	ctx = newEchoContext(http.MethodPost, "/api/v1/monitoring/reports/export", exportToken)
	err = h.ExportMonitoringReport(ctx)
	assertHTTPErrorCode(t, err, http.StatusServiceUnavailable)

	ctx = newEchoContext(http.MethodGet, "/api/v1/monitoring/reports/download/demo.csv", exportToken)
	ctx.SetParamNames("filename")
	ctx.SetParamValues("demo.csv")
	err = h.DownloadMonitoringReport(ctx)
	assertHTTPErrorCode(t, err, http.StatusServiceUnavailable)
}

func newEchoContext(method string, path string, token string) echo.Context {
	e := echo.New()
	req := httptest.NewRequest(method, path, nil)
	if token != "" {
		req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	return e.NewContext(req, rec)
}

func assertHTTPErrorCode(t *testing.T, err error, want int) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected http error %d, got nil", want)
	}
	httpErr, ok := err.(*echo.HTTPError)
	if !ok {
		t.Fatalf("expected *echo.HTTPError, got %T", err)
	}
	if httpErr.Code != want {
		t.Fatalf("status = %d, want %d", httpErr.Code, want)
	}
}

type fakePermissionService struct {
	permissions []string
}

func (s fakePermissionService) GetActiveUserFromToken(_ context.Context, _ string) (*auth.UserRecord, error) {
	return &auth.UserRecord{
		Username: "tester",
		Role:     "viewer",
	}, nil
}

func (s fakePermissionService) GetPermissionsByRole(_ context.Context, _ string) ([]string, error) {
	return append([]string{}, s.permissions...), nil
}

func newAuthServiceWithPermissions(t *testing.T, permissions []string) (handlers.PermissionService, string) {
	t.Helper()
	return fakePermissionService{permissions: permissions}, "test-token"
}
