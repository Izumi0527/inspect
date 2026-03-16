package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

type fixedAlertStatsService struct {
	alertsServiceStub
	stats  alerts.AlertStatistics
	recent []alerts.AlertWithDevice
}

func (s fixedAlertStatsService) GetAlertStatistics(_ context.Context) (alerts.AlertStatistics, error) {
	return s.stats, nil
}

func (s fixedAlertStatsService) GetRecentAlerts(_ context.Context, limit int) ([]alerts.AlertWithDevice, error) {
	if limit <= 0 {
		return []alerts.AlertWithDevice{}, nil
	}
	if len(s.recent) == 0 {
		return []alerts.AlertWithDevice{}, nil
	}
	if len(s.recent) > limit {
		return s.recent[:limit], nil
	}
	return s.recent, nil
}

func TestGetAlertStatistics_ContractTrendsAndRecentShape(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/alerts/statistics", nil)
	authService, token := newAuthServiceWithPermissions(t, []string{"alerts:read"})
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	now := time.Date(2026, 3, 15, 12, 0, 0, 0, time.UTC)
	service := fixedAlertStatsService{
		stats: alerts.AlertStatistics{
			Total:        10,
			Critical:     2,
			Warning:      3,
			Info:         5,
			Active:       4,
			Acknowledged: 1,
			Resolved:     5,
			ByCategory:   map[string]int{"security": 2},
			ByDevice:     map[string]int{"设备A": 3},
		},
		recent: []alerts.AlertWithDevice{
			{
				Alert: alerts.Alert{
					ID:        1,
					DeviceID:  1,
					Title:     "最近告警",
					Message:   "message",
					Category:  "security",
					Severity:  "critical",
					Status:    "open",
					CreatedAt: &now,
				},
			},
		},
	}

	handler := handlers.AlertsHandler{
		Service: service,
		Auth:    authService,
	}

	if err := handler.GetAlertStatistics(c); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", rec.Code, rec.Body.String())
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("invalid json: %v, body=%s", err, rec.Body.String())
	}

	trends, ok := payload["trends"].(map[string]interface{})
	if !ok {
		t.Fatalf("trends should be object, got %T", payload["trends"])
	}

	for _, key := range []string{"today", "yesterday", "change"} {
		if _, ok := trends[key]; !ok {
			t.Fatalf("missing trends.%s", key)
		}
	}

	recent, ok := payload["recent"].([]interface{})
	if !ok {
		t.Fatalf("recent should be array, got %T", payload["recent"])
	}
	if len(recent) == 0 {
		t.Fatalf("recent should not be empty")
	}

	first, ok := recent[0].(map[string]interface{})
	if !ok {
		t.Fatalf("recent[0] should be object, got %T", recent[0])
	}
	requiredFields := []string{"id", "title", "timestamp", "severity", "device"}
	for _, key := range requiredFields {
		if _, ok := first[key]; !ok {
			t.Fatalf("recent[0] missing field: %s", key)
		}
	}
}
