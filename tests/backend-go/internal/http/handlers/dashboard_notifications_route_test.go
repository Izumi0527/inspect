package handlers_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

func TestDashboardNotificationsRoute_ShouldExist(t *testing.T) {
	e := echo.New()
	api := e.Group("/api/v1")

	h := handlers.DashboardHandler{
		Service: nil,
		Auth:    nil,
	}
	h.Register(api)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/dashboard/notifications?limit=10", nil)
	req.Header.Set(echo.HeaderAuthorization, "Bearer test-token")
	rec := httptest.NewRecorder()

	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusServiceUnavailable)
	}
}
