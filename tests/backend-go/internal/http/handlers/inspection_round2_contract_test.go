package handlers_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"go.uber.org/zap"
)

func TestStartTask_ShouldLoadTemplateAndDispatchExecution(t *testing.T) {
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
	templateID := 200
	mock.ExpectQuery(`SELECT .* FROM "inspections" WHERE id = \$1.*`).
		WithArgs(1, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "template_id", "schedule_id", "name", "trigger", "status", "scheduled_at",
			"started_at", "completed_at", "duration", "total_checks", "passed_checks", "failed_checks",
			"warning_checks", "skipped_checks", "error_message", "error_details", "timeout", "retry_count",
			"max_retries", "created_by", "created_at", "updated_at",
		}).AddRow(
			1, 101, templateID, nil, "任务A", inspection.TriggerManual, inspection.StatusPending, nil,
			nil, nil, nil, 0, 0, 0, 0, 0, nil, []byte(`{}`), nil, nil, nil, "tester", now, now,
		))
	mock.ExpectQuery(`SELECT .* FROM "inspection_templates" WHERE id = \$1.*`).
		WithArgs(templateID, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "name", "description", "category", "device_types", "check_items", "is_default", "is_active", "created_at", "updated_at",
		}).AddRow(
			templateID, "模板A", nil, nil, []byte(`["switch"]`), []byte(`[{"name":"ICMP检查","type":"icmp","category":"connectivity"}]`), false, true, now, now,
		))

	// goroutine 内的 executeInspection 会先再次读取巡检记录；让它立即返回未找到以停止后续 DB 写入。
	mock.ExpectQuery(`SELECT .* FROM "inspections" WHERE id = \$1.*`).
		WithArgs(1, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "template_id", "schedule_id", "name", "trigger", "status",
		}))

	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/tasks/1/start", token, nil)
	ctx.SetParamNames("id")
	ctx.SetParamValues("1")

	if err := h.StartTask(ctx); err != nil {
		t.Fatalf("StartTask: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, want %d", rec.Code, http.StatusOK)
	}

	deadline := time.Now().Add(500 * time.Millisecond)
	for {
		if err := mock.ExpectationsWereMet(); err == nil {
			break
		} else if time.Now().After(deadline) {
			t.Fatalf("sqlmock expectations not met: %v", err)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestGetTaskResults_ShouldReturnNotFoundWhenTaskMissing(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:read"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	mock.ExpectQuery(`SELECT .* FROM "inspections" WHERE id = \$1.*`).
		WithArgs(99, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "template_id", "schedule_id", "name", "trigger", "status",
		}))

	ctx, _ := newEchoContextWithBody(http.MethodGet, "/api/v1/inspection/tasks/99/results", token, nil)
	ctx.SetParamNames("id")
	ctx.SetParamValues("99")

	err := h.GetTaskResults(ctx)
	httpErr, ok := err.(*echo.HTTPError)
	if !ok {
		t.Fatalf("error type = %T, want *echo.HTTPError", err)
	}
	if httpErr.Code != http.StatusNotFound {
		t.Fatalf("http code = %d, want %d", httpErr.Code, http.StatusNotFound)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestListExecutions_ShouldFilterByStartedAtOrCreatedAtFallback(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:read"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	start := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	endExclusive := time.Date(2026, 4, 7, 0, 0, 0, 0, time.UTC)

	mock.ExpectQuery(`SELECT count\(\*\) FROM "inspections".*COALESCE\(started_at, created_at\) >= \$1.*COALESCE\(started_at, created_at\) < \$2`).
		WithArgs(start, endExclusive).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`SELECT .* FROM "inspections".*COALESCE\(started_at, created_at\) >= \$1.*COALESCE\(started_at, created_at\) < \$2.*ORDER BY COALESCE\(started_at, created_at\) DESC`).
		WithArgs(start, endExclusive, 10).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "template_id", "schedule_id", "name", "trigger", "status", "created_at", "updated_at",
		}))

	ctx, rec := newEchoContextWithBody(
		http.MethodGet,
		"/api/v1/inspection/executions?start_date=2026-04-01&end_date=2026-04-06&page=1&page_size=10",
		token,
		nil,
	)

	if err := h.ListExecutions(ctx); err != nil {
		t.Fatalf("ListExecutions: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, want %d", rec.Code, http.StatusOK)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
