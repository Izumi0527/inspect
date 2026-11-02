package handlers_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
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

	// 日期参数按业务时区解析（handler 未注入 Settings 时回退默认 Asia/Shanghai）：
	// date-only 是本地自然日，不能用 UTC 零点（会错位成本地 08:00）。
	loc := businessLocation()
	expectedStart := time.Date(2026, 3, 1, 0, 0, 0, 0, loc)
	if filter.StartDate == nil || !filter.StartDate.Equal(expectedStart) {
		t.Fatalf("expected start_date=%s, got %v", expectedStart.Format(time.RFC3339Nano), filter.StartDate)
	}

	expectedEnd := time.Date(2026, 3, 2, 0, 0, 0, 0, loc).Add(24*time.Hour - time.Nanosecond)
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

func TestListAlerts_ExcludeSearch_QueryParam(t *testing.T) {
	e := echo.New()
	authService, token := newAuthServiceWithPermissions(t, []string{"alerts:read"})

	t.Run("exclude_search 绑定", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/alerts?exclude_search=NTP,LLDP", nil)
		req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		service := &captureListAlertsService{}
		handler := handlers.AlertsHandler{Service: service, Auth: authService}
		if err := handler.ListAlerts(c); err != nil {
			t.Fatalf("ListAlerts failed: %v", err)
		}
		if service.lastFilter == nil || service.lastFilter.ExcludeSearch != "NTP,LLDP" {
			t.Fatalf("expected ExcludeSearch to be 'NTP,LLDP', got %v", service.lastFilter)
		}
	})

	t.Run("exclude_keyword 兼容回退", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/alerts?exclude_keyword=BGP", nil)
		req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		service := &captureListAlertsService{}
		handler := handlers.AlertsHandler{Service: service, Auth: authService}
		if err := handler.ListAlerts(c); err != nil {
			t.Fatalf("ListAlerts failed: %v", err)
		}
		if service.lastFilter == nil || service.lastFilter.ExcludeSearch != "BGP" {
			t.Fatalf("expected ExcludeSearch to be 'BGP', got %v", service.lastFilter)
		}
	})

	t.Run("exclude_search 优先于 exclude_keyword", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/alerts?exclude_search=Primary&exclude_keyword=Secondary", nil)
		req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		service := &captureListAlertsService{}
		handler := handlers.AlertsHandler{Service: service, Auth: authService}
		if err := handler.ListAlerts(c); err != nil {
			t.Fatalf("ListAlerts failed: %v", err)
		}
		if service.lastFilter == nil || service.lastFilter.ExcludeSearch != "Primary" {
			t.Fatalf("expected ExcludeSearch to be 'Primary', got %v", service.lastFilter)
		}
	})
}

func TestExportAlerts_ExcludeSearch_QueryParam(t *testing.T) {
	e := echo.New()
	authService, token := newAuthServiceWithPermissions(t, []string{"alerts:read"})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/alerts/export?exclude_search=NoiseAlert", nil)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	service := &captureListAlertsService{}
	handler := handlers.AlertsHandler{Service: service, Auth: authService}
	if err := handler.ExportAlerts(c); err != nil {
		t.Fatalf("ExportAlerts failed: %v", err)
	}
	if service.lastFilter == nil || service.lastFilter.ExcludeSearch != "NoiseAlert" {
		t.Fatalf("expected ExcludeSearch in ExportAlerts to be 'NoiseAlert', got %v", service.lastFilter)
	}
}

func TestBulkAlertAction_SelectAllFiltered_ExcludeSearch(t *testing.T) {
	e := echo.New()
	authService, token := newAuthServiceWithPermissions(t, []string{"alerts:update"})

	t.Run("snake_case exclude_search", func(t *testing.T) {
		body := `{"action":"acknowledge","select_all_filtered":true,"exclude_search":"NTP,LLDP"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/alerts/bulk", strings.NewReader(body))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		service := &captureListAlertsService{}
		handler := handlers.AlertsHandler{Service: service, Auth: authService}
		if err := handler.BulkAlertAction(c); err != nil {
			t.Fatalf("BulkAlertAction failed: %v", err)
		}
		if service.lastFilter == nil || service.lastFilter.ExcludeSearch != "NTP,LLDP" {
			t.Fatalf("expected ExcludeSearch in BulkAlertAction to be 'NTP,LLDP', got %v", service.lastFilter)
		}
	})

	t.Run("camelCase excludeSearch", func(t *testing.T) {
		body := `{"action":"acknowledge","selectAllFiltered":true,"excludeSearch":"BGP_FLAP"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/alerts/bulk", strings.NewReader(body))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		service := &captureListAlertsService{}
		handler := handlers.AlertsHandler{Service: service, Auth: authService}
		if err := handler.BulkAlertAction(c); err != nil {
			t.Fatalf("BulkAlertAction failed: %v", err)
		}
		if service.lastFilter == nil || service.lastFilter.ExcludeSearch != "BGP_FLAP" {
			t.Fatalf("expected ExcludeSearch in BulkAlertAction to be 'BGP_FLAP', got %v", service.lastFilter)
		}
	})
}

type captureStatsService struct {
	alertsServiceStub
	lastFilter *alerts.AlertStatisticsFilter
}

func (s *captureStatsService) GetAlertStatistics(_ context.Context, filter alerts.AlertStatisticsFilter) (alerts.AlertStatistics, error) {
	copied := filter
	s.lastFilter = &copied
	return alerts.AlertStatistics{}, nil
}

func TestGetAlertStatistics_ExcludeSearchBinding(t *testing.T) {
	e := echo.New()
	authService, token := newAuthServiceWithPermissions(t, []string{"alerts:read"})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/alerts/statistics?exclude_search=NTP,LLDP", nil)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	service := &captureStatsService{}
	handler := handlers.AlertsHandler{Service: service, Auth: authService}
	if err := handler.GetAlertStatistics(c); err != nil {
		t.Fatalf("GetAlertStatistics failed: %v", err)
	}
	if service.lastFilter == nil || service.lastFilter.ExcludeSearch != "NTP,LLDP" {
		t.Fatalf("expected ExcludeSearch to be 'NTP,LLDP', got %v", service.lastFilter)
	}
}
