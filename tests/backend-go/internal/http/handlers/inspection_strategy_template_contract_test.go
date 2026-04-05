package handlers_test

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"go.uber.org/zap"
)

func TestCreateStrategy_ShouldRejectWhenTemplateMissing(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:create"})
	h := handlers.InspectionHandler{
		Service: &inspection.Service{},
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	body := []byte(`{"name":"策略A","type":"manual","devices":[1],"templates":[],"enabled":true}`)
	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/strategies", token, body)

	err := h.CreateStrategy(ctx)
	if err == nil {
		t.Fatalf("CreateStrategy should reject empty templates")
	}

	httpErr, ok := err.(*echo.HTTPError)
	if !ok {
		t.Fatalf("error type = %T, want *echo.HTTPError", err)
	}
	if httpErr.Code != http.StatusBadRequest {
		t.Fatalf("http code = %d, want %d", httpErr.Code, http.StatusBadRequest)
	}
}

func TestUpdateStrategy_ShouldRejectWhenTemplateMissing(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:update"})
	h := handlers.InspectionHandler{
		Service: &inspection.Service{},
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	body := []byte(`{"templates":[]}`)
	ctx, _ := newEchoContextWithBody(http.MethodPut, "/api/v1/inspection/strategies/1", token, body)
	ctx.SetParamNames("id")
	ctx.SetParamValues("1")

	err := h.UpdateStrategy(ctx)
	assertTemplateValidationBadRequest(t, err)
}

func TestUpdateStrategy_ShouldRejectWhenMultipleTemplates(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:update"})
	h := handlers.InspectionHandler{
		Service: &inspection.Service{},
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	body := []byte(`{"templates":[1,2]}`)
	ctx, _ := newEchoContextWithBody(http.MethodPut, "/api/v1/inspection/strategies/1", token, body)
	ctx.SetParamNames("id")
	ctx.SetParamValues("1")

	err := h.UpdateStrategy(ctx)
	assertTemplateValidationBadRequest(t, err)
}

func TestTriggerStrategy_ShouldRejectWhenTemplateMissing(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:execute"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	now := time.Now().UTC()
	mock.ExpectQuery(`SELECT .* FROM "inspection_strategies" WHERE id = \$1.*`).
		WithArgs(1, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id",
			"name",
			"description",
			"type",
			"cron",
			"devices",
			"templates",
			"enabled",
			"last_run_time",
			"next_run_time",
			"created_at",
			"updated_at",
		}).AddRow(
			1,
			"策略A",
			nil,
			inspection.StrategyManual,
			nil,
			[]byte(`[100]`),
			[]byte(`[]`),
			true,
			nil,
			nil,
			now,
			now,
		))

	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/strategies/1/trigger", token, nil)
	ctx.SetParamNames("id")
	ctx.SetParamValues("1")

	err := h.TriggerStrategy(ctx)
	if err == nil {
		t.Fatalf("TriggerStrategy should reject empty templates")
	}

	httpErr, ok := err.(*echo.HTTPError)
	if !ok {
		t.Fatalf("error type = %T, want *echo.HTTPError", err)
	}
	if httpErr.Code != http.StatusBadRequest {
		t.Fatalf("http code = %d, want %d", httpErr.Code, http.StatusBadRequest)
	}

	message := ""
	switch v := httpErr.Message.(type) {
	case string:
		message = v
	case error:
		message = v.Error()
	}
	if !strings.Contains(message, "模板") {
		t.Fatalf("message = %q, want contains 模板", message)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func assertTemplateValidationBadRequest(t *testing.T, err error) {
	t.Helper()

	if err == nil {
		t.Fatalf("expected template validation error")
	}

	httpErr, ok := err.(*echo.HTTPError)
	if !ok {
		t.Fatalf("error type = %T, want *echo.HTTPError", err)
	}
	if httpErr.Code != http.StatusBadRequest {
		t.Fatalf("http code = %d, want %d", httpErr.Code, http.StatusBadRequest)
	}

	message := ""
	switch v := httpErr.Message.(type) {
	case string:
		message = v
	case error:
		message = v.Error()
	}
	if !strings.Contains(message, "模板") {
		t.Fatalf("message = %q, want contains 模板", message)
	}
}
