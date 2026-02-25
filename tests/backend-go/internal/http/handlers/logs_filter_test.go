package handlers_test

import (
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

func TestBuildLogFilter_ShouldIncludeSource(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest("GET", "/api/v1/logs?source=syslog&level=info", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	filter := handlers.BuildLogFilter(c, 0, 100)
	if filter.Source == nil {
		t.Fatalf("filter.Source is nil, want syslog")
	}
	if *filter.Source != "syslog" {
		t.Fatalf("filter.Source=%q, want syslog", *filter.Source)
	}
}

