package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

type mockBulkAlertService struct {
	alertsServiceStub
	alertsList   []alerts.AlertWithDevice
	acknowledged []int
	resolved     []int
	deleted      []int
	lastFilter   *alerts.ListAlertsFilter
}

func (m *mockBulkAlertService) ListAlerts(_ context.Context, filter alerts.ListAlertsFilter) ([]alerts.AlertWithDevice, int64, error) {
	copied := filter
	m.lastFilter = &copied
	return m.alertsList, int64(len(m.alertsList)), nil
}

func (m *mockBulkAlertService) AcknowledgeAlert(_ context.Context, alertID int, _ alerts.Operator, _ *string, _ *string) error {
	m.acknowledged = append(m.acknowledged, alertID)
	return nil
}

func (m *mockBulkAlertService) ResolveAlert(_ context.Context, alertID int, _ alerts.Operator, _ *string, _ *string) error {
	m.resolved = append(m.resolved, alertID)
	return nil
}

func (m *mockBulkAlertService) DeleteAlert(_ context.Context, alertID int) error {
	m.deleted = append(m.deleted, alertID)
	return nil
}

func TestBulkAlertAction_ExplicitIDs_Success(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"alerts:update", "alerts:delete"})
	mockSvc := &mockBulkAlertService{}
	h := handlers.AlertsHandler{
		Service: mockSvc,
		Auth:    authSvc,
	}

	payload := map[string]interface{}{
		"alert_ids": []string{"10", "20"},
		"action":    "acknowledge",
	}
	body, _ := json.Marshal(payload)
	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/alerts/bulk", token, body)

	if err := h.BulkAlertAction(ctx); err != nil {
		t.Fatalf("BulkAlertAction failed: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", rec.Code, rec.Body.String())
	}

	if len(mockSvc.acknowledged) != 2 || mockSvc.acknowledged[0] != 10 || mockSvc.acknowledged[1] != 20 {
		t.Fatalf("unexpected acknowledged alert IDs: %v", mockSvc.acknowledged)
	}
}

func TestBulkAlertAction_SelectAllFiltered_WithExcludes(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"alerts:update", "alerts:delete"})
	mockSvc := &mockBulkAlertService{
		alertsList: []alerts.AlertWithDevice{
			{Alert: alerts.Alert{ID: 101, Status: "active", Severity: "critical"}},
			{Alert: alerts.Alert{ID: 102, Status: "active", Severity: "critical"}},
			{Alert: alerts.Alert{ID: 103, Status: "active", Severity: "critical"}},
		},
	}
	h := handlers.AlertsHandler{
		Service: mockSvc,
		Auth:    authSvc,
	}

	payload := map[string]interface{}{
		"action":              "delete",
		"select_all_filtered": true,
		"exclude_ids":         []string{"102"},
		"status":              "active",
		"severity":            "critical",
		"search":              "switch",
	}
	body, _ := json.Marshal(payload)
	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/alerts/bulk", token, body)

	if err := h.BulkAlertAction(ctx); err != nil {
		t.Fatalf("BulkAlertAction failed: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", rec.Code, rec.Body.String())
	}

	// 102 was excluded, so only 101 and 103 deleted
	if len(mockSvc.deleted) != 2 || mockSvc.deleted[0] != 101 || mockSvc.deleted[1] != 103 {
		t.Fatalf("unexpected deleted alert IDs: %v", mockSvc.deleted)
	}

	var resp struct {
		Success      bool `json:"success"`
		Processed    int  `json:"processed"`
		UpdatedCount int  `json:"updatedCount"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if !resp.Success || resp.Processed != 2 || resp.UpdatedCount != 2 {
		t.Fatalf("unexpected response: %+v", resp)
	}
}

func TestBulkAlertAction_SelectAllFiltered_EmptyMatch(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"alerts:update"})
	mockSvc := &mockBulkAlertService{
		alertsList: []alerts.AlertWithDevice{},
	}
	h := handlers.AlertsHandler{
		Service: mockSvc,
		Auth:    authSvc,
	}

	payload := map[string]interface{}{
		"action":            "acknowledge",
		"selectAllFiltered": true,
		"status":            "resolved",
	}
	body, _ := json.Marshal(payload)
	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/alerts/bulk", token, body)

	if err := h.BulkAlertAction(ctx); err != nil {
		t.Fatalf("BulkAlertAction failed: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Success      bool `json:"success"`
		Processed    int  `json:"processed"`
		UpdatedCount int  `json:"updatedCount"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if !resp.Success || resp.Processed != 0 || resp.UpdatedCount != 0 {
		t.Fatalf("unexpected empty match response: %+v", resp)
	}
}

func TestBulkAlertAction_ExplicitIDs_Empty(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"alerts:update"})
	mockSvc := &mockBulkAlertService{}
	h := handlers.AlertsHandler{
		Service: mockSvc,
		Auth:    authSvc,
	}

	payload := map[string]interface{}{
		"action":    "acknowledge",
		"alert_ids": []string{},
	}
	body, _ := json.Marshal(payload)
	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/alerts/bulk", token, body)

	err := h.BulkAlertAction(ctx)
	assertHTTPErrorCode(t, err, http.StatusBadRequest)
}
