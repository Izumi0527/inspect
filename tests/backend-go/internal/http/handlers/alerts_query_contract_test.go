package handlers_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

type captureListAlertsService struct {
	alertsServiceStub
	lastFilter *alerts.ListAlertsFilter
}

func (s *captureListAlertsService) ListAlerts(_ context.Context, filter alerts.ListAlertsFilter) ([]alerts.AlertWithDevice, int64, error) {
	copied := filter
	s.lastFilter = &copied
	return []alerts.AlertWithDevice{}, 0, nil
}

func containsString(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}

func containsInt(list []int, value int) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}

func TestListAlerts_QueryParsingAndDateOnlyEndDate(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/alerts?status=active,resolved&status[]=acknowledged&severity=warning&severity[]=critical&category=security&category[]=performance&device_ids=1&device_ids[]=2&device_id=3&start_date=2026-03-01&end_date=2026-03-02&page=2&page_size=50&search=abc&sort_by=timestamp&sort_order=asc",
		nil,
	)
	authService, token := newAuthServiceWithPermissions(t, []string{"alerts:read"})
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	service := &captureListAlertsService{}
	handler := handlers.AlertsHandler{
		Service: service,
		Auth:    authService,
	}

	if err := handler.ListAlerts(c); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", rec.Code, rec.Body.String())
	}

	if service.lastFilter == nil {
		t.Fatalf("expected ListAlerts to be called and capture filter")
	}
	filter := *service.lastFilter

	if filter.Page != 2 {
		t.Fatalf("expected page=2, got %d", filter.Page)
	}
	if filter.PageSize != 50 {
		t.Fatalf("expected page_size=50, got %d", filter.PageSize)
	}

	for _, status := range []string{"active", "resolved", "acknowledged"} {
		if !containsString(filter.Statuses, status) {
			t.Fatalf("expected statuses to contain %q, got %v", status, filter.Statuses)
		}
	}
	for _, severity := range []string{"warning", "critical"} {
		if !containsString(filter.Severities, severity) {
			t.Fatalf("expected severities to contain %q, got %v", severity, filter.Severities)
		}
	}
	for _, category := range []string{"security", "performance"} {
		if !containsString(filter.Categories, category) {
			t.Fatalf("expected categories to contain %q, got %v", category, filter.Categories)
		}
	}
	for _, deviceID := range []int{1, 2, 3} {
		if !containsInt(filter.DeviceIDs, deviceID) {
			t.Fatalf("expected device_ids to contain %d, got %v", deviceID, filter.DeviceIDs)
		}
	}

	expectedStart := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	if filter.StartDate == nil || !filter.StartDate.Equal(expectedStart) {
		t.Fatalf("expected start_date=%s, got %v", expectedStart.Format(time.RFC3339Nano), filter.StartDate)
	}

	expectedEnd := time.Date(2026, 3, 2, 0, 0, 0, 0, time.UTC).Add(24*time.Hour - time.Nanosecond)
	if filter.EndDate == nil || !filter.EndDate.Equal(expectedEnd) {
		t.Fatalf("expected end_date=%s, got %v", expectedEnd.Format(time.RFC3339Nano), filter.EndDate)
	}

	if filter.Search != "abc" {
		t.Fatalf("expected search=abc, got %q", filter.Search)
	}
	if filter.SortBy != "timestamp" {
		t.Fatalf("expected sort_by=timestamp, got %q", filter.SortBy)
	}
	if filter.SortOrder != "asc" {
		t.Fatalf("expected sort_order=asc, got %q", filter.SortOrder)
	}
}
