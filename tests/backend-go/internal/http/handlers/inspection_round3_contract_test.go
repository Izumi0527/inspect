package handlers_test

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"go.uber.org/zap"
)

func TestImportTemplate_ShouldReadFullJSONFile(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:create"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	mock.ExpectQuery(`SELECT \* FROM "inspection_templates" WHERE name = \$1.*`).
		WithArgs("导入模板A", sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "name", "description", "category", "device_types", "check_items", "is_default", "is_active", "created_at", "updated_at",
		}))
	mock.ExpectQuery(`INSERT INTO "inspection_templates".*RETURNING "id"`).
		WithArgs(
			"导入模板A",
			nil,
			nil,
			sqlmock.AnyArg(),
			sqlmock.AnyArg(),
			false,
			true,
			sqlmock.AnyArg(),
			sqlmock.AnyArg(),
		).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(123))

	body := []byte(`{
  "Name":"导入模板A",
  "DeviceTypes":["switch"],
  "CheckItems":[
    {
      "id":"ping-1",
      "name":"Ping检查",
      "type":"ping",
      "config":{},
      "enabled":true
    }
  ],
  "IsActive":true
}`)
	ctx, rec := newMultipartEchoContext(t, http.MethodPost, "/api/v1/inspection/templates/import", token, "file", "template.json", body)

	if err := h.ImportTemplate(ctx); err != nil {
		t.Fatalf("ImportTemplate: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, want %d", rec.Code, http.StatusOK)
	}
	if !strings.Contains(rec.Body.String(), "导入模板成功") {
		t.Fatalf("response body = %s, want contains 导入模板成功", rec.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestCreateStrategy_ShouldRejectWhenTemplateEntityNotFound(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:create"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	mock.ExpectQuery(`SELECT .* FROM "inspection_templates" WHERE id = \$1.*`).
		WithArgs(999, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "name", "description", "category", "device_types", "check_items", "is_default", "is_active", "created_at", "updated_at",
		}))

	body := []byte(`{"name":"策略A","type":"manual","devices":[1],"templates":[999],"enabled":true}`)
	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/strategies", token, body)

	err := h.CreateStrategy(ctx)
	assertTemplateValidationBadRequest(t, err)
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestUpdateStrategy_ShouldRejectWhenTemplateEntityNotFound(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:update"})
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
			"id", "name", "description", "type", "cron", "devices", "templates", "enabled", "last_run_time", "next_run_time", "created_at", "updated_at",
		}).AddRow(
			1, "策略A", nil, inspection.StrategyManual, nil, []byte(`[1]`), []byte(`[10]`), true, nil, nil, now, now,
		))
	mock.ExpectQuery(`SELECT .* FROM "inspection_templates" WHERE id = \$1.*`).
		WithArgs(999, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "name", "description", "category", "device_types", "check_items", "is_default", "is_active", "created_at", "updated_at",
		}))

	body := []byte(`{"templates":[999]}`)
	ctx, _ := newEchoContextWithBody(http.MethodPut, "/api/v1/inspection/strategies/1", token, body)
	ctx.SetParamNames("id")
	ctx.SetParamValues("1")

	err := h.UpdateStrategy(ctx)
	assertTemplateValidationBadRequest(t, err)
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestTriggerStrategy_ShouldRejectWhenTemplateEntityNotFound(t *testing.T) {
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
			"id", "name", "description", "type", "cron", "devices", "templates", "enabled", "last_run_time", "next_run_time", "created_at", "updated_at",
		}).AddRow(
			1, "策略A", nil, inspection.StrategyManual, nil, []byte(`[100]`), []byte(`[999]`), true, nil, nil, now, now,
		))
	mock.ExpectQuery(`SELECT .* FROM "inspection_templates" WHERE id = \$1.*`).
		WithArgs(999, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "name", "description", "category", "device_types", "check_items", "is_default", "is_active", "created_at", "updated_at",
		}))

	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/strategies/1/trigger", token, nil)
	ctx.SetParamNames("id")
	ctx.SetParamValues("1")

	err := h.TriggerStrategy(ctx)
	assertTemplateValidationBadRequest(t, err)
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestCancelTask_ShouldRejectCompletedInspection(t *testing.T) {
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
	mock.ExpectQuery(`SELECT .* FROM "inspections" WHERE id = \$1.*`).
		WithArgs(1, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "template_id", "schedule_id", "name", "trigger", "status", "scheduled_at",
			"started_at", "completed_at", "duration", "total_checks", "passed_checks", "failed_checks",
			"warning_checks", "skipped_checks", "error_message", "error_details", "timeout", "retry_count",
			"max_retries", "created_by", "created_at", "updated_at",
		}).AddRow(
			1, 101, nil, nil, "任务A", inspection.TriggerManual, inspection.StatusCompleted, nil,
			now, now, 60, 2, 2, 0, 0, 0, nil, []byte(`{}`), nil, nil, nil, "tester", now, now,
		))

	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/tasks/1/cancel", token, []byte(`{"reason":"测试取消"}`))
	ctx.SetParamNames("id")
	ctx.SetParamValues("1")

	err := h.CancelTask(ctx)
	httpErr, ok := err.(*echo.HTTPError)
	if !ok {
		t.Fatalf("error type = %T, want *echo.HTTPError", err)
	}
	if httpErr.Code != http.StatusBadRequest {
		t.Fatalf("http code = %d, want %d", httpErr.Code, http.StatusBadRequest)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestStartTask_ShouldMarkFailedWhenSavingResultFails(t *testing.T) {
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
	runningAt := now.Add(-30 * time.Second)
	mock.ExpectQuery(`SELECT .* FROM "inspections" WHERE id = \$1.*`).
		WithArgs(1, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "template_id", "schedule_id", "name", "trigger", "status", "scheduled_at",
			"started_at", "completed_at", "duration", "total_checks", "passed_checks", "failed_checks",
			"warning_checks", "skipped_checks", "error_message", "error_details", "timeout", "retry_count",
			"max_retries", "created_by", "created_at", "updated_at",
		}).AddRow(
			1, 101, nil, nil, "任务A", inspection.TriggerManual, inspection.StatusPending, nil,
			nil, nil, nil, 0, 0, 0, 0, 0, nil, []byte(`{}`), nil, nil, nil, "tester", now, now,
		))
	mock.ExpectQuery(`SELECT .* FROM "inspections" WHERE id = \$1.*`).
		WithArgs(1, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "template_id", "schedule_id", "name", "trigger", "status", "scheduled_at",
			"started_at", "completed_at", "duration", "total_checks", "passed_checks", "failed_checks",
			"warning_checks", "skipped_checks", "error_message", "error_details", "timeout", "retry_count",
			"max_retries", "created_by", "created_at", "updated_at",
		}).AddRow(
			1, 101, nil, nil, "任务A", inspection.TriggerManual, inspection.StatusPending, nil,
			nil, nil, nil, 0, 0, 0, 0, 0, nil, []byte(`{}`), nil, nil, nil, "tester", now, now,
		))
	mock.ExpectExec(`UPDATE "inspections" SET .* WHERE id = \$[0-9]+`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(`SELECT .* FROM "inspections" WHERE id = \$1.*`).
		WithArgs(1, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "template_id", "schedule_id", "name", "trigger", "status", "scheduled_at",
			"started_at", "completed_at", "duration", "total_checks", "passed_checks", "failed_checks",
			"warning_checks", "skipped_checks", "error_message", "error_details", "timeout", "retry_count",
			"max_retries", "created_by", "created_at", "updated_at",
		}).AddRow(
			1, 101, nil, nil, "任务A", inspection.TriggerManual, inspection.StatusRunning, nil,
			runningAt, nil, nil, 0, 0, 0, 0, 0, nil, []byte(`{}`), nil, nil, nil, "tester", now, now,
		))
	mock.ExpectExec(`UPDATE "inspections" SET .* WHERE id = \$[0-9]+`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(`SELECT .* FROM "inspections" WHERE id = \$1.*`).
		WithArgs(1, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "template_id", "schedule_id", "name", "trigger", "status", "scheduled_at",
			"started_at", "completed_at", "duration", "total_checks", "passed_checks", "failed_checks",
			"warning_checks", "skipped_checks", "error_message", "error_details", "timeout", "retry_count",
			"max_retries", "created_by", "created_at", "updated_at",
		}).AddRow(
			1, 101, nil, nil, "任务A", inspection.TriggerManual, inspection.StatusRunning, nil,
			runningAt, nil, nil, 2, 0, 0, 0, 0, nil, []byte(`{}`), nil, nil, nil, "tester", now, now,
		))
	mock.ExpectQuery(`INSERT INTO "inspection_results".*RETURNING "id"`).
		WillReturnError(assertionSQLFailure{})
	mock.ExpectQuery(`SELECT .* FROM "inspections" WHERE id = \$1.*`).
		WithArgs(1, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "template_id", "schedule_id", "name", "trigger", "status", "scheduled_at",
			"started_at", "completed_at", "duration", "total_checks", "passed_checks", "failed_checks",
			"warning_checks", "skipped_checks", "error_message", "error_details", "timeout", "retry_count",
			"max_retries", "created_by", "created_at", "updated_at",
		}).AddRow(
			1, 101, nil, nil, "任务A", inspection.TriggerManual, inspection.StatusRunning, nil,
			runningAt, nil, nil, 2, 0, 0, 0, 0, nil, []byte(`{}`), nil, nil, nil, "tester", now, now,
		))
	mock.ExpectExec(`UPDATE "inspections" SET .* WHERE id = \$[0-9]+`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(`SELECT .* FROM "inspections" WHERE id = \$1.*`).
		WithArgs(1, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "template_id", "schedule_id", "name", "trigger", "status", "scheduled_at",
			"started_at", "completed_at", "duration", "total_checks", "passed_checks", "failed_checks",
			"warning_checks", "skipped_checks", "error_message", "error_details", "timeout", "retry_count",
			"max_retries", "created_by", "created_at", "updated_at",
		}).AddRow(
			1, 101, nil, nil, "任务A", inspection.TriggerManual, inspection.StatusFailed, nil,
			runningAt, now, 30, 2, 0, 0, 0, 0, "保存巡检结果失败", []byte(`{}`), nil, nil, nil, "tester", now, now,
		))

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

func newMultipartEchoContext(t *testing.T, method string, path string, token string, fieldName string, filename string, body []byte) (echo.Context, *httptest.ResponseRecorder) {
	t.Helper()

	var payload bytes.Buffer
	writer := multipart.NewWriter(&payload)
	part, err := writer.CreateFormFile(fieldName, filename)
	if err != nil {
		t.Fatalf("CreateFormFile: %v", err)
	}
	if _, err := part.Write(body); err != nil {
		t.Fatalf("part.Write: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("writer.Close: %v", err)
	}

	e := echo.New()
	req := httptest.NewRequest(method, path, &payload)
	req.Header.Set(echo.HeaderContentType, writer.FormDataContentType())
	if token != "" {
		req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	return e.NewContext(req, rec), rec
}

type assertionSQLFailure struct{}

func (assertionSQLFailure) Error() string {
	return "assertion sql failure"
}
