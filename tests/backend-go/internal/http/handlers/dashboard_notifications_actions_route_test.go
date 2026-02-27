package handlers_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

func TestDashboardNotificationsReadRoute_ShouldExist(t *testing.T) {
	e := echo.New()
	api := e.Group("/api/v1")

	h := handlers.DashboardHandler{
		Service: nil,
		Auth:    nil,
	}
	h.Register(api)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/dashboard/notifications/read", bytes.NewBufferString(`{"ids":["alert-1"]}`))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	req.Header.Set(echo.HeaderAuthorization, "Bearer test-token")
	rec := httptest.NewRecorder()

	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusServiceUnavailable)
	}
}

func TestDashboardNotificationsDismissRoute_ShouldExist(t *testing.T) {
	e := echo.New()
	api := e.Group("/api/v1")

	h := handlers.DashboardHandler{
		Service: nil,
		Auth:    nil,
	}
	h.Register(api)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/dashboard/notifications/dismiss", bytes.NewBufferString(`{"ids":["alert-1"]}`))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	req.Header.Set(echo.HeaderAuthorization, "Bearer test-token")
	rec := httptest.NewRecorder()

	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusServiceUnavailable)
	}
}
