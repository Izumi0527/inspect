package handlers_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

func TestSettingsGeneralExportImportRoutes_ShouldReturnNotFound(t *testing.T) {
	e := echo.New()
	api := e.Group("/api/v1")

	h := handlers.SettingsHandler{
		Service: nil,
		Auth:    nil,
	}
	h.Register(api)

	t.Run("GET /api/v1/settings/general/export should be 404", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/settings/general/export", nil)
		rec := httptest.NewRecorder()

		e.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("status=%d, want %d", rec.Code, http.StatusNotFound)
		}
	})

	t.Run("POST /api/v1/settings/general/import should be 404", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/general/import", bytes.NewBufferString(`{"config_data":{},"overwrite":true}`))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()

		e.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("status=%d, want %d", rec.Code, http.StatusNotFound)
		}
	})
}

func TestSettingsSystemRestoreRoute_ShouldRemainAvailable(t *testing.T) {
	e := echo.New()
	api := e.Group("/api/v1")

	h := handlers.SettingsHandler{
		Service: nil,
		Auth:    nil,
	}
	h.Register(api)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/system/restore", bytes.NewBufferString(`{"config_data":{},"overwrite":true}`))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()

	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusServiceUnavailable)
	}
}
